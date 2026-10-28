import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db/client";
import type { Q } from "../db/types";
import { fail } from "../errors";
import { addDays, now } from "../clock";
import { assertCan, assertCanView, scopeWhere, type Actor } from "../permissions";
import { audit, notifyRole } from "../audit";
import { loadApplication } from "./workflow";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = [
  { mime: "application/pdf", ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  { mime: "image/png", ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", ext: "jpg", magic: [0xff, 0xd8, 0xff] },
];

/**
 * Validates an uploaded file by size and by its leading bytes (not by its name).
 * Returns the detected type, or throws a user-facing error.
 */
export function validateUpload(name: string, bytes: Uint8Array): { mime: string } {
  if (bytes.length === 0) fail("INVALID_INPUT", "The file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) fail("INVALID_INPUT", "Files must be 10 MB or smaller.");
  const match = ALLOWED.find((type) => type.magic.every((b, i) => bytes[i] === b));
  if (!match) fail("INVALID_INPUT", "Only PDF, PNG or JPG files are accepted.");
  const lower = name.toLowerCase();
  if (!lower.endsWith(`.${match.ext}`) && !(match.ext === "jpg" && lower.endsWith(".jpeg"))) {
    fail("INVALID_INPUT", "The file extension does not match its content.");
  }
  return { mime: match.mime };
}

/** Stores a validated file. Files are served only through the authorization-checked download route. */
export async function storeFile(q: Q, actor: Actor, institutionId: string, name: string, bytes: Uint8Array): Promise<string> {
  const { mime } = validateUpload(name, bytes);
  const id = `F-${randomUUID().slice(0, 12)}`;
  await q.query(
    `INSERT INTO files (id, institution_id, name, mime, size, data, uploaded_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, institutionId, name.slice(0, 180), mime, bytes.length, bytes, actor.id, now()],
  );
  return id;
}

// ---------- Undertakings ----------

export const UNDERTAKING_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  submitted: "Evidence awaiting review",
  correction_requested: "Corrections requested",
  verified: "Verified",
};

export type UndertakingRow = {
  id: string;
  institution_id: string;
  institution_name: string;
  application_id: string;
  condition: string;
  evidence_required: string;
  issued_at: Date;
  due_at: Date;
  status: string;
  verified_at: Date | null;
  region_id: string;
};

const UT_SELECT = `
SELECT ut.*, i.name AS institution_name, a.region_id
FROM undertakings ut
JOIN institutions i ON i.id = ut.institution_id
JOIN applications a ON a.id = ut.application_id`;

export async function listUndertakings(db: Db, actor: Actor): Promise<UndertakingRow[]> {
  const scope = scopeWhere(actor, { institution: "ut.institution_id", region: "a.region_id" }, 1);
  const res = await db.query<UndertakingRow>(`${UT_SELECT} WHERE ${scope.sql} ORDER BY ut.due_at ASC`, scope.params);
  return res.rows;
}

export async function loadUndertaking(q: Q, actor: Actor, id: string) {
  const res = await q.query<UndertakingRow>(`${UT_SELECT} WHERE ut.id = $1`, [id]);
  const ut = res.rows[0];
  if (!ut) fail("NOT_FOUND", "Undertaking not found or not in your scope.");
  assertCanView(actor, { institutionId: ut.institution_id, regionId: ut.region_id });
  const subs = await q.query<Record<string, unknown>>(
    `SELECT s.*, u.name AS submitted_by_name, rv.name AS reviewer_name, f.name AS file_name
     FROM undertaking_submissions s
     JOIN users u ON u.id = s.submitted_by
     JOIN files f ON f.id = s.file_id
     LEFT JOIN users rv ON rv.id = s.reviewer_id
     WHERE s.undertaking_id = $1 ORDER BY s.version_no DESC`,
    [id],
  );
  return { ut, submissions: subs.rows };
}

const createUtSchema = z.object({
  applicationId: z.string().min(1),
  condition: z.string().trim().min(10, "Describe the condition (at least 10 characters).").max(500),
  evidenceRequired: z.string().trim().min(5, "State the evidence required.").max(300),
  dueInDays: z.coerce.number().int().min(1).max(730),
});

/** Records a time-bound undertaking. The due date is calculated from the configured day count. */
export async function createUndertaking(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor, "ut.create");
  const parsed = createUtSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid undertaking.");
  const data = parsed.data;
  return db.transaction(async (tx) => {
    const app = await loadApplication(tx, data.applicationId);
    if (!app) fail("NOT_FOUND", "Application not found.");
    assertCanView(actor, { institutionId: app.institution_id, regionId: app.region_id });
    const count = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM undertakings");
    const id = `UT-${String((count.rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;
    const t = now();
    await tx.query(
      `INSERT INTO undertakings (id, institution_id, application_id, condition, evidence_required, issued_at, due_at, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,$6)`,
      [id, app.institution_id, app.id, data.condition, data.evidenceRequired, t, addDays(t, data.dueInDays), actor.id],
    );
    await audit(tx, actor, "undertaking.created", "undertaking", id, { application: app.id, dueInDays: data.dueInDays });
    await notifyRole(tx, { role: "institution", institutionId: app.institution_id }, {
      title: `New undertaking: ${id}`,
      body: `${data.condition.slice(0, 120)}`,
      severity: "warning",
      link: `/undertakings/${id}`,
    });
    return id;
  });
}

/** Institution submits evidence. A submission never verifies the undertaking; a reviewer must do that. */
export async function submitUndertakingEvidence(
  db: Db,
  actor: Actor,
  undertakingId: string,
  input: { note: string; fileName: string; bytes: Uint8Array },
): Promise<void> {
  assertCan(actor, "ut.submit");
  const note = z.string().trim().min(5, "Add a short note describing the evidence.").safeParse(input.note);
  if (!note.success) fail("INVALID_INPUT", note.error.issues[0]?.message ?? "A note is required.");
  return db.transaction(async (tx) => {
    const { ut } = await loadUndertaking(tx, actor, undertakingId);
    if (ut.status !== "active" && ut.status !== "correction_requested") {
      fail("INVALID_TRANSITION", "Evidence can only be submitted while the undertaking is active or awaiting corrections.");
    }
    const fileId = await storeFile(tx, actor, ut.institution_id, input.fileName, input.bytes);
    const v = await tx.query<{ n: number }>(
      "SELECT COALESCE(MAX(version_no), 0)::int AS n FROM undertaking_submissions WHERE undertaking_id = $1",
      [undertakingId],
    );
    const versionNo = (v.rows[0]?.n ?? 0) + 1;
    const t = now();
    await tx.query(
      `INSERT INTO undertaking_submissions (undertaking_id, version_no, note, file_id, submitted_by, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [undertakingId, versionNo, note.data, fileId, actor.id, t],
    );
    await tx.query("UPDATE undertakings SET status = 'submitted' WHERE id = $1", [undertakingId]);
    await audit(tx, actor, "undertaking.evidence_submitted", "undertaking", undertakingId, {
      version: versionNo,
      fileId,
    });
    await notifyRole(tx, { role: "reviewer" }, {
      title: `Evidence to review: ${undertakingId}`,
      body: `Version ${versionNo} was submitted by ${actor.name}.`,
      severity: "info",
      link: `/undertakings/${undertakingId}`,
    });
  });
}

const reviewSchema = z.object({
  outcome: z.enum(["accepted", "correction_requested"]),
  remarks: z.string().trim().max(1000),
});

/** Reviewer records the verification outcome. Corrections require remarks. */
export async function reviewUndertakingSubmission(db: Db, actor: Actor, undertakingId: string, input: unknown): Promise<void> {
  assertCan(actor, "ut.review");
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", "Choose an outcome.");
  const { outcome, remarks } = parsed.data;
  if (outcome === "correction_requested" && remarks.length < 10) {
    fail("INVALID_INPUT", "Explain the corrections needed (at least 10 characters).");
  }
  return db.transaction(async (tx) => {
    const { ut, submissions } = await loadUndertaking(tx, actor, undertakingId);
    if (ut.status !== "submitted") fail("INVALID_TRANSITION", "There is no evidence waiting for review.");
    const latest = submissions[0];
    const t = now();
    await tx.query(
      `UPDATE undertaking_submissions SET review_status = $2, reviewer_id = $3, remarks = $4, reviewed_at = $5 WHERE id = $1`,
      [latest.id, outcome, actor.id, remarks || null, t],
    );
    const newStatus = outcome === "accepted" ? "verified" : "correction_requested";
    await tx.query(
      `UPDATE undertakings SET status = $2::text,
         verified_at = CASE WHEN $2::text = 'verified' THEN $3::timestamptz ELSE NULL END
       WHERE id = $1`,
      [undertakingId, newStatus, t],
    );
    await audit(tx, actor, `undertaking.${outcome}`, "undertaking", undertakingId, { version: latest.version_no }, remarks || undefined);
    await notifyRole(tx, { role: "institution", institutionId: ut.institution_id }, {
      title: outcome === "accepted" ? `Undertaking verified: ${undertakingId}` : `Corrections requested: ${undertakingId}`,
      body: outcome === "accepted" ? "The reviewer accepted your evidence." : remarks,
      severity: outcome === "accepted" ? "success" : "warning",
      link: `/undertakings/${undertakingId}`,
    });
  });
}

// ---------- Documents and renewals ----------

export const DOC_CATEGORIES = ["Lease deed", "Building safety certificate", "Land-use permission", "Fire safety certificate"];

export type DocumentRow = {
  id: string;
  institution_id: string;
  institution_name: string;
  region_id: string;
  category: string;
  title: string;
  current_expires_at: Date | null;
  current_version_no: number | null;
  pending_version_no: number | null;
  latest_version_no: number;
};

const DOC_SELECT = `
SELECT d.id, d.institution_id, i.name AS institution_name, a.region_id, d.category, d.title,
  (SELECT v.expires_at FROM document_versions v WHERE v.document_id = d.id AND v.review_status = 'accepted'
     ORDER BY v.version_no DESC LIMIT 1) AS current_expires_at,
  (SELECT v.version_no FROM document_versions v WHERE v.document_id = d.id AND v.review_status = 'accepted'
     ORDER BY v.version_no DESC LIMIT 1) AS current_version_no,
  (SELECT v.version_no FROM document_versions v WHERE v.document_id = d.id AND v.review_status = 'pending'
     ORDER BY v.version_no DESC LIMIT 1) AS pending_version_no,
  (SELECT MAX(v.version_no) FROM document_versions v WHERE v.document_id = d.id) AS latest_version_no
FROM documents d
JOIN institutions i ON i.id = d.institution_id
LEFT JOIN applications a ON a.id = d.application_id`;

/** Derives validity from the accepted version and the demo clock. Never stored, so it is always current. */
export function documentValidity(doc: { current_expires_at: Date | null; pending_version_no: number | null }) {
  if (!doc.current_expires_at) return { key: "not_verified", label: "Not yet verified", days: null as number | null };
  const days = Math.floor((doc.current_expires_at.getTime() - now().getTime()) / (24 * 3600 * 1000));
  if (doc.pending_version_no) return { key: "renewal_review", label: "Renewal under review", days };
  if (days < 0) return { key: "expired", label: "Expired", days };
  if (days <= 7) return { key: "expiring_7", label: "Expires within 7 days", days };
  if (days <= 30) return { key: "expiring_30", label: "Expires within 30 days", days };
  return { key: "valid", label: "Valid", days };
}

export async function listDocuments(db: Db, actor: Actor): Promise<DocumentRow[]> {
  const scope = scopeWhere(actor, { institution: "d.institution_id", region: "a.region_id" }, 1);
  const res = await db.query<DocumentRow>(
    `${DOC_SELECT} WHERE ${scope.sql} ORDER BY d.title`,
    scope.params,
  );
  return res.rows;
}

export async function loadDocument(q: Q, actor: Actor, id: string) {
  const res = await q.query<DocumentRow>(`${DOC_SELECT} WHERE d.id = $1`, [id]);
  const doc = res.rows[0];
  if (!doc) fail("NOT_FOUND", "Document not found or not in your scope.");
  assertCanView(actor, { institutionId: doc.institution_id, regionId: doc.region_id });
  const versions = await q.query<Record<string, unknown>>(
    `SELECT v.*, u.name AS uploaded_by_name, rv.name AS reviewer_name, f.name AS file_name,
       (SELECT w.version_no FROM document_versions w WHERE w.id = v.replaces_version_id) AS replaces_version_no
     FROM document_versions v
     JOIN users u ON u.id = v.uploaded_by
     JOIN files f ON f.id = v.file_id
     LEFT JOIN users rv ON rv.id = v.reviewer_id
     WHERE v.document_id = $1 ORDER BY v.version_no DESC`,
    [id],
  );
  return { doc, versions: versions.rows };
}

const newDocSchema = z.object({
  title: z.string().trim().min(3, "Give the document a name.").max(140),
  category: z.string().min(1),
  expiresOn: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid expiry date."),
  applicationId: z.string().optional(),
});

/** Institution uploads a prescribed document. It is not verified until a reviewer accepts it. */
export async function createDocument(
  db: Db,
  actor: Actor,
  input: unknown,
  file: { fileName: string; bytes: Uint8Array },
): Promise<string> {
  assertCan(actor, "doc.upload");
  const parsed = newDocSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid document.");
  if (!actor.institutionId) fail("FORBIDDEN", "Only institution users upload documents.");
  const data = parsed.data;
  return db.transaction(async (tx) => {
    const count = await tx.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM documents");
    const id = `DOC-${String((count.rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;
    await tx.query(
      `INSERT INTO documents (id, institution_id, application_id, category, title, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, actor.institutionId, data.applicationId || null, data.category, data.title, now()],
    );
    const fileId = await storeFile(tx, actor, actor.institutionId!, file.fileName, file.bytes);
    await tx.query(
      `INSERT INTO document_versions (document_id, version_no, expires_at, file_id, uploaded_by, submitted_at)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [id, new Date(data.expiresOn), fileId, actor.id, now()],
    );
    await audit(tx, actor, "document.created", "document", id, { version: 1 });
    await notifyRole(tx, { role: "reviewer" }, {
      title: `Document to verify: ${id}`,
      body: `${data.title} (version 1) is awaiting review.`,
      severity: "info",
      link: `/documents/${id}`,
    });
    return id;
  });
}

const renewalSchema = z.object({
  expiresOn: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid expiry date."),
});

/** Upload a renewal. The previous version stays in the history and is never overwritten. */
export async function uploadRenewal(
  db: Db,
  actor: Actor,
  documentId: string,
  input: unknown,
  file: { fileName: string; bytes: Uint8Array },
): Promise<void> {
  assertCan(actor, "doc.upload");
  const parsed = renewalSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid renewal.");
  return db.transaction(async (tx) => {
    const { doc, versions } = await loadDocument(tx, actor, documentId);
    if (doc.pending_version_no) fail("CONFLICT", "A renewal is already waiting for review.");
    const latest = versions[0];
    const accepted = versions.find((v) => v.review_status === "accepted");
    const fileId = await storeFile(tx, actor, doc.institution_id, file.fileName, file.bytes);
    const nextNo = (doc.latest_version_no ?? 0) + 1;
    await tx.query(
      `INSERT INTO document_versions (document_id, version_no, expires_at, file_id, uploaded_by, submitted_at, replaces_version_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [documentId, nextNo, new Date(parsed.data.expiresOn), fileId, actor.id, now(), accepted?.id ?? latest?.id ?? null],
    );
    await audit(tx, actor, "document.renewal_submitted", "document", documentId, { version: nextNo });
    await notifyRole(tx, { role: "reviewer" }, {
      title: `Renewal to verify: ${documentId}`,
      body: `${doc.title} version ${nextNo} is awaiting review.`,
      severity: "info",
      link: `/documents/${documentId}`,
    });
  });
}

const docReviewSchema = z.object({
  outcome: z.enum(["accepted", "returned"]),
  remarks: z.string().trim().max(1000),
});

export async function reviewDocumentVersion(db: Db, actor: Actor, documentId: string, versionNo: number, input: unknown): Promise<void> {
  assertCan(actor, "doc.review");
  const parsed = docReviewSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", "Choose an outcome.");
  if (parsed.data.outcome === "returned" && parsed.data.remarks.length < 10) {
    fail("INVALID_INPUT", "Explain what must be corrected (at least 10 characters).");
  }
  return db.transaction(async (tx) => {
    const { doc, versions } = await loadDocument(tx, actor, documentId);
    const version = versions.find((v) => Number(v.version_no) === versionNo);
    if (!version) fail("NOT_FOUND", "Version not found.");
    if (version.review_status !== "pending") fail("INVALID_TRANSITION", "This version has already been reviewed.");
    const t = now();
    await tx.query(
      `UPDATE document_versions SET review_status = $3, reviewer_id = $4, remarks = $5, reviewed_at = $6
       WHERE document_id = $1 AND version_no = $2`,
      [documentId, versionNo, parsed.data.outcome, actor.id, parsed.data.remarks || null, t],
    );
    await audit(
      tx,
      actor,
      `document.version_${parsed.data.outcome}`,
      "document",
      documentId,
      { version: versionNo },
      parsed.data.remarks || undefined,
    );
    await notifyRole(tx, { role: "institution", institutionId: doc.institution_id }, {
      title: parsed.data.outcome === "accepted" ? `Document accepted: ${doc.title}` : `Document returned: ${doc.title}`,
      body: parsed.data.outcome === "accepted"
        ? `Version ${versionNo} is now the verified copy. Earlier versions remain in the history.`
        : parsed.data.remarks,
      severity: parsed.data.outcome === "accepted" ? "success" : "warning",
      link: `/documents/${documentId}`,
    });
  });
}
