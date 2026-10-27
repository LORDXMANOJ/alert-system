import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Db } from "../src/server/db/client";
import { freshDb, actorOf } from "./helpers";
import { setClockOffsetDays } from "../src/server/clock";
import { runMonitoringChecks, thresholdKey, updateAlert, listAlerts } from "../src/server/services/monitoring";
import { shiftClock } from "../src/server/services/admin";
import { ServiceError } from "../src/server/errors";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});
afterEach(() => setClockOffsetDays(0));

async function count(table: string): Promise<number> {
  const r = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return r.rows[0].n;
}

describe("deadline threshold boundaries", () => {
  const thresholds = [30, 15, 7, 0];

  it("treats a deadline due today as the 0-day threshold", () => {
    expect(thresholdKey(0, thresholds)).toBe("within-0");
  });

  it("treats a deadline due tomorrow as the 7-day threshold", () => {
    expect(thresholdKey(1, thresholds)).toBe("within-7");
  });

  it("fires exactly at a reminder threshold", () => {
    expect(thresholdKey(7, thresholds)).toBe("within-7");
    expect(thresholdKey(15, thresholds)).toBe("within-15");
    expect(thresholdKey(30, thresholds)).toBe("within-30");
  });

  it("does not fire just outside a threshold", () => {
    expect(thresholdKey(8, thresholds)).toBe("within-15");
    expect(thresholdKey(16, thresholds)).toBe("within-30");
    expect(thresholdKey(31, thresholds)).toBeNull();
  });

  it("marks anything past its deadline as overdue", () => {
    expect(thresholdKey(-1, thresholds)).toBe("overdue");
    expect(thresholdKey(-30, thresholds)).toBe("overdue");
  });
});

describe("alert deduplication", () => {
  it("does not create duplicate alerts when the checks are run twice", async () => {
    const admin = await actorOf(db, "u-admin");
    await runMonitoringChecks(db, admin);
    const afterFirst = await count("alerts");
    const second = await runMonitoringChecks(db, admin);
    expect(await count("alerts")).toBe(afterFirst);
    expect(second.created).toBe(0);
    expect(second.duplicatesSkipped).toBeGreaterThan(0);
  });

  it("creates one alert per record and threshold", async () => {
    const keys = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM (
         SELECT rule_id, entity_type, entity_id, threshold_key FROM alerts GROUP BY 1,2,3,4 HAVING COUNT(*) > 1
       ) d`,
    );
    expect(keys.rows[0].n).toBe(0);
  });

  it("raises a document expiry alert for a lease that expires in six days", async () => {
    const rows = await db.query<{ threshold_key: string }>(
      "SELECT threshold_key FROM alerts WHERE entity_type = 'document' AND entity_id = 'DOC-0001'",
    );
    expect(rows.rows[0]?.threshold_key).toBe("within-7");
  });

  it("does not raise an expiry alert for a document whose renewal is under review", async () => {
    const rows = await db.query("SELECT 1 FROM alerts WHERE entity_type = 'document' AND entity_id = 'DOC-0004'");
    expect(rows.rows.length).toBe(0);
  });
});

describe("escalation idempotency", () => {
  it("escalates overdue items once and never duplicates an escalation event", async () => {
    const admin = await actorOf(db, "u-admin");
    await shiftClock(db, admin, 10);
    const first = await runMonitoringChecks(db, admin);
    expect(first.escalated).toBeGreaterThan(0);
    const escalations = await count("escalation_events");
    const second = await runMonitoringChecks(db, admin);
    expect(second.escalated).toBe(0);
    expect(await count("escalation_events")).toBe(escalations);
  });

  it("keeps the escalation history for each level", async () => {
    const admin = await actorOf(db, "u-admin");
    await shiftClock(db, admin, 30);
    await runMonitoringChecks(db, admin);
    const levels = await db.query<{ level: number }>("SELECT DISTINCT level FROM escalation_events ORDER BY level");
    expect(levels.rows.map((r) => r.level)).toEqual([1, 2]);
  });
});

describe("alert lifecycle", () => {
  it("requires a resolution note before an alert can be resolved", async () => {
    const admin = await actorOf(db, "u-admin");
    const [first] = await listAlerts(db, admin, "open");
    await expect(updateAlert(db, admin, Number(first.id), "resolve", "")).rejects.toBeInstanceOf(ServiceError);
    await updateAlert(db, admin, Number(first.id), "resolve", "Reviewed with the institution");
    const row = await db.query<{ status: string; resolution_note: string }>("SELECT status, resolution_note FROM alerts WHERE id = $1", [first.id]);
    expect(row.rows[0].status).toBe("resolved");
    expect(row.rows[0].resolution_note).toBe("Reviewed with the institution");
  });

  it("clears an alert automatically when its condition ends", async () => {
    const admin = await actorOf(db, "u-admin");
    const reviewer = await actorOf(db, "u-reviewer");
    const inst = await actorOf(db, "u-inst-vindhya");
    // A renewal for DOC-0001 is submitted, which means its expiry alert is no longer needed.
    const { uploadRenewal } = await import("../src/server/services/compliance");
    await uploadRenewal(db, inst, "DOC-0001", { expiresOn: new Date(Date.now() + 400 * 86400000).toISOString() }, {
      fileName: "renewal.pdf",
      bytes: new TextEncoder().encode("%PDF-1.4 renewal"),
    });
    const summary = await runMonitoringChecks(db, admin);
    expect(summary.autoResolved).toBeGreaterThan(0);
    const row = await db.query<{ status: string; resolution_note: string }>(
      "SELECT status, resolution_note FROM alerts WHERE entity_type = 'document' AND entity_id = 'DOC-0001'",
    );
    expect(row.rows[0]?.status).toBe("resolved");
    expect(row.rows[0]?.resolution_note).toContain("Condition cleared");
    void reviewer;
  });

  it("does not let an unauthorized role run the checks", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await expect(runMonitoringChecks(db, inst)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
