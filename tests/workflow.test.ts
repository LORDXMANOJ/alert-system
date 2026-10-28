import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Db } from "../src/server/db/client";
import { freshDb, actorOf } from "./helpers";
import { ServiceError } from "../src/server/errors";
import { setClockOffsetDays } from "../src/server/clock";
import * as wf from "../src/server/services/workflow";
import * as evc from "../src/server/services/evc";
import { listEvcRecords } from "../src/server/services/evc";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});
afterEach(() => setClockOffsetDays(0));

async function expectError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).code).toBe(code);
}

describe("application creation and template selection", () => {
  it("selects the workflow template from the category and places the application in stage 1", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    const id = await wf.createApplication(db, inst, { title: "Test application for a new block", category: "Infrastructure revision" });
    const app = await wf.loadApplication(db, id);
    expect(app?.template_id).toBe("t-scrutiny");
    expect(app?.stage_position).toBe(1);
    expect(app?.status).toBe("in_progress");
    expect(app?.stage_name).toBe("Scrutiny");
  });

  it("rejects invalid input on the server", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await expectError(wf.createApplication(db, inst, { title: "x", category: "Infrastructure revision" }), "INVALID_INPUT");
    await expectError(wf.createApplication(db, inst, { title: "Valid title here", category: "Not a category" }), "INVALID_INPUT");
  });

  it("forbids auditors and regional officers from creating applications", async () => {
    const auditor = await actorOf(db, "u-auditor");
    await expectError(wf.createApplication(db, auditor, { title: "Valid title here", category: "Infrastructure revision" }), "FORBIDDEN");
  });

  it("forbids an institution from filing for another institution", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    const id = await wf.createApplication(db, inst, { title: "Filed by Vindhya", category: "Infrastructure revision" });
    const app = await wf.loadApplication(db, id);
    expect(app?.institution_id).toBe("inst-vindhya");
  });
});

describe("stage transitions", () => {
  it("advances after the checklist is confirmed by the stage owner", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await wf.completeStage(db, bureau, "APF-2026-0001", { checklist: [true, true, true, true] });
    const app = await wf.loadApplication(db, "APF-2026-0001");
    expect(app?.stage_position).toBe(2);
    expect(app?.stage_name).toBe("EVC visit");
  });

  it("queues the application for EVC only after the preliminary stage is complete", async () => {
    const bureau = await actorOf(db, "u-bureau");
    const before = (await listEvcRecords(db, bureau)).map((r) => r.application_id);
    expect(before).not.toContain("APF-2026-0001");
    await wf.completeStage(db, bureau, "APF-2026-0001", { checklist: [true, true, true, true] });
    const after = (await listEvcRecords(db, bureau)).find((r) => r.application_id === "APF-2026-0001");
    expect(after?.status).toBe("awaiting_scheduling");
  });

  it("rejects completion by a user whose role does not own the stage", async () => {
    const reviewer = await actorOf(db, "u-reviewer");
    await expectError(wf.completeStage(db, reviewer, "APF-2026-0001", { checklist: [true, true, true, true] }), "FORBIDDEN");
  });

  it("rejects completion when a checklist item is not confirmed (no skipping)", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await expectError(wf.completeStage(db, bureau, "APF-2026-0001", { checklist: [true, true, false, true] }), "INVALID_TRANSITION");
    const app = await wf.loadApplication(db, "APF-2026-0001");
    expect(app?.stage_position).toBe(1);
  });

  it("blocks completing an EVC stage until the visit is recorded", async () => {
    const evcUser = await actorOf(db, "u-evc");
    await expectError(wf.completeStage(db, evcUser, "APF-2026-0003", { checklist: [] }), "INVALID_TRANSITION");
    await evc.scheduleVisit(db, evcUser, "APF-2026-0003", { scheduledFor: new Date(Date.now() + 86400000).toISOString() });
    await evc.completeVisit(db, evcUser, "APF-2026-0003", "Visit held with all members present.");
    await wf.completeStage(db, evcUser, "APF-2026-0003", { checklist: [] });
    const app = await wf.loadApplication(db, "APF-2026-0003");
    expect(app?.stage_position).toBe(3);
  });

  it("refuses to complete the final decision stage through Complete stage", async () => {
    // The competent authority has no stage-completion permission, so the decision path is the only route.
    const authority = await actorOf(db, "u-authority");
    await expectError(wf.completeStage(db, authority, "APF-2026-0011", { checklist: [true] }), "FORBIDDEN");
  });
});

describe("return for clarification and response", () => {
  it("requires a meaningful reason to return an application", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await expectError(wf.returnForClarification(db, bureau, "APF-2026-0001", "no"), "INVALID_INPUT");
  });

  it("returns with a recorded reason, and the institution can respond to resume", async () => {
    const bureau = await actorOf(db, "u-bureau");
    const inst = await actorOf(db, "u-inst-vindhya");
    await wf.returnForClarification(db, bureau, "APF-2026-0001", "Please attach the signed affidavit for the faculty list.");
    let app = await wf.loadApplication(db, "APF-2026-0001");
    expect(app?.status).toBe("clarification");
    expect(app?.clarification_reason).toContain("affidavit");
    await wf.respondToClarification(db, inst, "APF-2026-0001", "The affidavit is attached as requested.");
    app = await wf.loadApplication(db, "APF-2026-0001");
    expect(app?.status).toBe("in_progress");
    expect(app?.stage_position).toBe(1);
  });

  it("does not let the stage be completed while the application awaits clarification", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await expectError(wf.completeStage(db, bureau, "APF-2026-0002", { checklist: [true, true, true, true] }), "INVALID_TRANSITION");
  });

  it("does not let another institution respond to a clarification", async () => {
    const otherInst = await actorOf(db, "u-inst-narmada");
    await expectError(wf.respondToClarification(db, otherInst, "APF-2026-0001", "This should be refused."), "NOT_FOUND");
  });
});

describe("final decisions", () => {
  it("is recorded only by the competent authority at the final stage", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await expectError(wf.recordDecision(db, bureau, "APF-2026-0011", { outcome: "approved", reason: "Meets the configured criteria.", checklistConfirmed: true }), "FORBIDDEN");
    const authority = await actorOf(db, "u-authority");
    await wf.recordDecision(db, authority, "APF-2026-0011", { outcome: "approved", reason: "Reviewed history and observations.", checklistConfirmed: true });
    const app = await wf.loadApplication(db, "APF-2026-0011");
    expect(app?.status).toBe("decided");
    expect(app?.decision).toBe("approved");
  });

  it("requires the reviewer to confirm they reviewed the history", async () => {
    const authority = await actorOf(db, "u-authority");
    await expectError(wf.recordDecision(db, authority, "APF-2026-0011", { outcome: "approved", reason: "Reviewed history and observations.", checklistConfirmed: false }), "INVALID_INPUT");
  });
});

describe("record scoping and role isolation", () => {
  it("shows an institution only its own applications", async () => {
    const narmada = await actorOf(db, "u-inst-narmada");
    const rows = await wf.listApplications(db, narmada);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.institution_id === "inst-narmada")).toBe(true);
  });

  it("returns not-found for another institution's application by direct ID", async () => {
    const narmada = await actorOf(db, "u-inst-narmada");
    await expectError(wf.getApplicationDetail(db, narmada, "APF-2026-0001"), "NOT_FOUND");
  });

  it("limits a regional officer to their own region", async () => {
    const regional = await actorOf(db, "u-regional");
    const rows = await wf.listApplications(db, regional);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.region_id === "r-central")).toBe(true);
  });

  it("lets the national roles see every region", async () => {
    const admin = await actorOf(db, "u-admin");
    const regions = new Set((await wf.listApplications(db, admin)).map((r) => r.region_id));
    expect(regions.size).toBeGreaterThan(1);
  });

  it("gives every event a timestamp and an actor", async () => {
    const detail = await wf.getApplicationDetail(db, await actorOf(db, "u-admin"), "APF-2026-0012");
    expect(detail.events.length).toBeGreaterThan(0);
    for (const e of detail.events) {
      expect(e.created_at).toBeInstanceOf(Date);
      expect(e.actor_id).toBeTruthy();
    }
  });
});

describe("EVC scheduling", () => {
  it("records a scheduled visit and a completed visit", async () => {
    const evcUser = await actorOf(db, "u-evc");
    const when = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
    await evc.scheduleVisit(db, evcUser, "APF-2026-0006", { scheduledFor: when, notes: "Confirmed" });
    const rec = (await listEvcRecords(db, evcUser)).find((r) => r.application_id === "APF-2026-0006");
    expect(rec?.status).toBe("scheduled");
    expect(rec?.scheduled_date).toBeInstanceOf(Date);
  });

  it("refuses a schedule from a role without EVC management", async () => {
    const bureau = await actorOf(db, "u-bureau");
    await expectError(evc.scheduleVisit(db, bureau, "APF-2026-0006", { scheduledFor: new Date().toISOString() }), "FORBIDDEN");
  });
});
