import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "../src/server/db/client";
import { freshDb, actorOf, PDF_BYTES } from "./helpers";
import { ServiceError } from "../src/server/errors";
import * as compliance from "../src/server/services/compliance";
import { exportReportCsv, toCsv } from "../src/server/services/reports";
import { setUserRole } from "../src/server/services/admin";
import { canViewRecord, can } from "../src/server/permissions";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

async function expectError(promise: Promise<unknown>, code: string) {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ServiceError);
  expect((err as ServiceError).code).toBe(code);
}

const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

describe("undertakings", () => {
  it("calculates the due date from the configured number of days", async () => {
    const bureau = await actorOf(db, "u-bureau");
    const id = await compliance.createUndertaking(db, bureau, {
      applicationId: "APF-2026-0001",
      condition: "Provide the faculty list with signatures.",
      evidenceRequired: "Signed faculty list (PDF)",
      dueInDays: 14,
    });
    const row = await db.query<{ issued_at: Date; due_at: Date }>("SELECT issued_at, due_at FROM undertakings WHERE id = $1", [id]);
    const days = (row.rows[0].due_at.getTime() - row.rows[0].issued_at.getTime()) / 86400000;
    expect(Math.round(days)).toBe(14);
  });

  it("does not let an institution's submission count as verification", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await compliance.submitUndertakingEvidence(db, inst, "UT-0002", { note: "Completion photographs attached.", fileName: "completion.pdf", bytes: PDF_BYTES });
    const row = await db.query<{ status: string; verified_at: Date | null }>("SELECT status, verified_at FROM undertakings WHERE id = 'UT-0002'");
    expect(row.rows[0].status).toBe("submitted");
    expect(row.rows[0].verified_at).toBeNull();
  });

  it("only a reviewer can verify, and corrections need remarks", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await compliance.submitUndertakingEvidence(db, inst, "UT-0002", { note: "Completion photographs attached.", fileName: "completion.pdf", bytes: PDF_BYTES });
    await expectError(compliance.reviewUndertakingSubmission(db, inst, "UT-0002", { outcome: "accepted", remarks: "" }), "FORBIDDEN");
    const reviewer = await actorOf(db, "u-reviewer");
    await expectError(compliance.reviewUndertakingSubmission(db, reviewer, "UT-0002", { outcome: "correction_requested", remarks: "no" }), "INVALID_INPUT");
    await compliance.reviewUndertakingSubmission(db, reviewer, "UT-0002", { outcome: "accepted", remarks: "" });
    const row = await db.query<{ status: string }>("SELECT status FROM undertakings WHERE id = 'UT-0002'");
    expect(row.rows[0].status).toBe("verified");
  });

  it("keeps every evidence version when corrections are resubmitted", async () => {
    const inst = await actorOf(db, "u-inst-himalaya");
    const reviewer = await actorOf(db, "u-reviewer");
    // UT-0004 already has version 1 with corrections requested. The institution resubmits as version 2.
    await compliance.submitUndertakingEvidence(db, inst, "UT-0004", { note: "Corrected letter attached.", fileName: "letter-v2.pdf", bytes: PDF_BYTES });
    await compliance.reviewUndertakingSubmission(db, reviewer, "UT-0004", { outcome: "accepted", remarks: "" });
    const versions = await db.query<{ version_no: number }>("SELECT version_no FROM undertaking_submissions WHERE undertaking_id = 'UT-0004' ORDER BY version_no");
    expect(versions.rows.map((r) => r.version_no)).toEqual([1, 2]);
  });
});

describe("document validity and historical versions", () => {
  it("keeps the previous version when a renewal is accepted", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    const reviewer = await actorOf(db, "u-reviewer");
    await compliance.uploadRenewal(db, inst, "DOC-0001", { expiresOn: future(400) }, { fileName: "lease-renewal.pdf", bytes: PDF_BYTES });
    const pending = await compliance.loadDocument(db, inst, "DOC-0001");
    expect(pending.versions.map((v) => v.review_status)).toEqual(["pending", "accepted"]);
    await compliance.reviewDocumentVersion(db, reviewer, "DOC-0001", 2, { outcome: "accepted", remarks: "" });
    const after = await compliance.loadDocument(db, reviewer, "DOC-0001");
    expect(after.versions.length).toBe(2);
    expect(after.doc.current_version_no).toBe(2);
    expect(after.versions.find((v) => Number(v.version_no) === 1)?.review_status).toBe("accepted");
  });

  it("does not treat an uploaded renewal as verified before review", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await compliance.uploadRenewal(db, inst, "DOC-0001", { expiresOn: future(400) }, { fileName: "lease-renewal.pdf", bytes: PDF_BYTES });
    const doc = await compliance.loadDocument(db, inst, "DOC-0001");
    const validity = compliance.documentValidity(doc.doc);
    expect(validity.key).toBe("renewal_review");
    expect(doc.doc.current_version_no).toBe(1);
  });

  it("refuses a second renewal while one is waiting for review", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await compliance.uploadRenewal(db, inst, "DOC-0001", { expiresOn: future(400) }, { fileName: "first.pdf", bytes: PDF_BYTES });
    await expectError(
      compliance.uploadRenewal(db, inst, "DOC-0001", { expiresOn: future(800) }, { fileName: "second.pdf", bytes: PDF_BYTES }),
      "CONFLICT",
    );
  });

  it("classifies expiry windows against the configured boundaries", () => {
    const at = (days: number) => ({ current_expires_at: new Date(Date.now() + days * 86400000), pending_version_no: null });
    expect(compliance.documentValidity(at(-1)).key).toBe("expired");
    expect(compliance.documentValidity(at(7)).key).toBe("expiring_7");
    expect(compliance.documentValidity(at(8)).key).toBe("expiring_30");
    expect(compliance.documentValidity(at(31)).key).toBe("valid");
  });
});

describe("file validation and private storage", () => {
  it("rejects a file whose content is not PDF, PNG or JPG, whatever its name", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await expectError(
      compliance.createDocument(db, inst, { title: "Lease copy", category: "Lease deed", expiresOn: future(90) }, {
        fileName: "lease.pdf",
        bytes: new TextEncoder().encode("<script>alert(1)</script>"),
      }),
      "INVALID_INPUT",
    );
  });

  it("rejects an extension that does not match the content", async () => {
    expect(() => compliance.validateUpload("notes.png", PDF_BYTES)).toThrow(/extension/);
  });

  it("rejects files over 10 MB", () => {
    const big = new Uint8Array(compliance.MAX_UPLOAD_BYTES + 1);
    big.set(PDF_BYTES.slice(0, 4), 0);
    expect(() => compliance.validateUpload("big.pdf", big)).toThrow(/10 MB/);
  });

  it("does not show one institution's file to another", () => {
    const narmada = { id: "u-inst-narmada", name: "", designation: "", role: "institution" as const, institutionId: "inst-narmada", regionId: null };
    expect(canViewRecord(narmada, { institutionId: "inst-vindhya", regionId: "r-central" })).toBe(false);
    expect(canViewRecord(narmada, { institutionId: "inst-narmada", regionId: "r-central" })).toBe(true);
  });
});

describe("role-based authorization", () => {
  it("prevents a user from changing their own role", async () => {
    const admin = await actorOf(db, "u-admin");
    await expectError(setUserRole(db, admin, "u-admin", "auditor"), "FORBIDDEN");
  });

  it("lets an administrator change another staff role, and records it", async () => {
    const admin = await actorOf(db, "u-admin");
    await setUserRole(db, admin, "u-auditor", "bureau");
    const row = await db.query<{ role: string }>("SELECT role FROM users WHERE id = 'u-auditor'");
    expect(row.rows[0].role).toBe("bureau");
    const log = await db.query("SELECT 1 FROM audit_logs WHERE action = 'user.role_changed' AND entity_id = 'u-auditor'");
    expect(log.rows.length).toBe(1);
  });

  it("denies an auditor any write permission", async () => {
    const auditor = await actorOf(db, "u-auditor");
    for (const p of ["app.stage", "app.return", "app.decide", "ut.review", "doc.review", "alert.update", "admin.manage"] as const) {
      expect(can(auditor, p)).toBe(false);
    }
  });

  it("denies CSV export to institution users", async () => {
    const inst = await actorOf(db, "u-inst-vindhya");
    await expectError(exportReportCsv(db, inst, "overdue"), "FORBIDDEN");
  });

  it("allows an auditor to export and records the export", async () => {
    const auditor = await actorOf(db, "u-auditor");
    const csv = await exportReportCsv(db, auditor, "pendency");
    expect(csv.split("\n")[0]).toContain("stage");
    const log = await db.query("SELECT 1 FROM audit_logs WHERE action = 'report.exported'");
    expect(log.rows.length).toBeGreaterThan(0);
  });

  it("restricts a regional officer's export to their region", async () => {
    const regional = await actorOf(db, "u-regional");
    const csv = await exportReportCsv(db, regional, "overdue");
    expect(csv).not.toContain("Godavari");
  });
});

describe("audit trail", () => {
  it("writes an audit entry when an application is submitted", async () => {
    const { createApplication } = await import("../src/server/services/workflow");
    const inst = await actorOf(db, "u-inst-vindhya");
    const id = await createApplication(db, inst, { title: "Audit probe application", category: "Infrastructure revision" });
    const log = await db.query("SELECT 1 FROM audit_logs WHERE action = 'application.created' AND entity_id = $1", [id]);
    expect(log.rows.length).toBe(1);
  });

  it("refuses to update or delete audit rows", async () => {
    await expect(db.query("UPDATE audit_logs SET action = 'tampered'")).rejects.toThrow(/append-only/);
    await expect(db.query("DELETE FROM audit_logs")).rejects.toThrow(/append-only/);
  });

  it("refuses to update application event history", async () => {
    await expect(db.query("UPDATE application_events SET detail = 'rewritten'")).rejects.toThrow(/append-only/);
  });
});

describe("CSV export safety", () => {
  it("neutralises spreadsheet formulas and escapes quotes and commas", () => {
    const csv = toCsv([{ a: "=1+1", b: 'say "hi", please' }]);
    expect(csv.split("\n")[1]).toBe(`'=1+1,"say ""hi"", please"`);
  });
});
