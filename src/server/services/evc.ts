import { z } from "zod";
import type { Db } from "../db/client";
import { fail } from "../errors";
import { now } from "../clock";
import { assertCan, type Actor, scopeWhere } from "../permissions";
import { audit, notifyRole } from "../audit";
import { loadApplication } from "./workflow";

export const EVC_STATUS_LABELS: Record<string, string> = {
  awaiting_scheduling: "Awaiting scheduling",
  scheduling_in_progress: "Scheduling in progress",
  scheduled: "Scheduled",
  completed: "Visit completed",
  report_pending: "Report pending",
  follow_up_required: "Follow-up required",
  closed: "Closed",
};

export type EvcRow = {
  id: string;
  application_id: string;
  status: string;
  target_date: Date;
  scheduled_date: Date | null;
  completed_date: Date | null;
  notes: string;
  institution_id: string;
  institution_name: string;
  institution_is_new: boolean;
  region_id: string;
  region_name: string;
  application_title: string;
  coordinator_name: string | null;
};

const EVC_SELECT = `
SELECT e.*, a.institution_id, a.region_id, a.title AS application_title,
  i.name AS institution_name, i.is_new AS institution_is_new, r.name AS region_name,
  u.name AS coordinator_name
FROM evc_records e
JOIN applications a ON a.id = e.application_id
JOIN institutions i ON i.id = a.institution_id
JOIN regions r ON r.id = a.region_id
LEFT JOIN users u ON u.id = e.coordinator_id`;

export async function listEvcRecords(db: Db, actor: Actor): Promise<EvcRow[]> {
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);
  const res = await db.query<EvcRow>(
    `${EVC_SELECT} WHERE ${scope.sql} ORDER BY COALESCE(e.scheduled_date, e.target_date) ASC`,
    scope.params,
  );
  return res.rows;
}

const scheduleSchema = z.object({
  scheduledFor: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time."),
  notes: z.string().trim().max(500).optional(),
});

/** Records a visit date. Only the EVC coordinator can schedule; the status moves to Scheduled. */
export async function scheduleVisit(db: Db, actor: Actor, applicationId: string, input: unknown): Promise<void> {
  assertCan(actor, "evc.manage");
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid schedule.");
  const scheduledDate = new Date(parsed.data.scheduledFor);

  return db.transaction(async (tx) => {
    const app = await loadApplication(tx, applicationId);
    if (!app) fail("NOT_FOUND", "Application not found.");
    const evc = await tx.query<{ status: string }>("SELECT status FROM evc_records WHERE application_id = $1", [applicationId]);
    const status = evc.rows[0]?.status;
    if (!status) fail("INVALID_TRANSITION", "This application has no EVC record.");
    if (!["awaiting_scheduling", "scheduling_in_progress", "scheduled"].includes(status)) {
      fail("INVALID_TRANSITION", `A visit cannot be scheduled while the EVC is ${EVC_STATUS_LABELS[status] ?? status}.`);
    }
    const t = now();
    await tx.query(
      `UPDATE evc_records SET status = 'scheduled', scheduled_date = $2, coordinator_id = $3,
         notes = CASE WHEN $4 = '' THEN notes ELSE $4 END, updated_at = $5
       WHERE application_id = $1`,
      [applicationId, scheduledDate, actor.id, parsed.data.notes ?? "", t],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, detail, created_at)
       VALUES ($1,$2,$3,'evc_scheduled',$4,$5)`,
      [applicationId, actor.id, actor.role, `Visit scheduled for ${scheduledDate.toISOString().slice(0, 10)}.`, t],
    );
    await audit(tx, actor, "evc.scheduled", "evc_record", `EVC-${applicationId}`, {
      scheduledFor: scheduledDate.toISOString(),
    });
    await notifyRole(tx, { role: "institution", institutionId: app.institution_id }, {
      title: `EVC visit scheduled: ${applicationId}`,
      body: `A visit has been scheduled for ${scheduledDate.toDateString()}.`,
      severity: "info",
      link: `/applications/${applicationId}?tab=evc`,
    });
  });
}

/** Records that the visit took place. This unlocks completion of the EVC stage. */
export async function completeVisit(db: Db, actor: Actor, applicationId: string, notes: string): Promise<void> {
  assertCan(actor, "evc.manage");
  const trimmed = z.string().trim().min(10, "Record a short visit note (at least 10 characters).").safeParse(notes);
  if (!trimmed.success) fail("INVALID_INPUT", trimmed.error.issues[0]?.message ?? "A note is required.");

  return db.transaction(async (tx) => {
    const evc = await tx.query<{ status: string }>("SELECT status FROM evc_records WHERE application_id = $1", [applicationId]);
    const status = evc.rows[0]?.status;
    if (status !== "scheduled" && status !== "scheduling_in_progress") {
      fail("INVALID_TRANSITION", "Only a scheduled visit can be marked as completed.");
    }
    const t = now();
    await tx.query(
      `UPDATE evc_records SET status = 'completed', completed_date = $2, notes = $3, updated_at = $2
       WHERE application_id = $1`,
      [applicationId, t, trimmed.data],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, detail, created_at)
       VALUES ($1,$2,$3,'evc_visit_completed',$4,$5)`,
      [applicationId, actor.id, actor.role, trimmed.data, t],
    );
    await audit(tx, actor, "evc.visit_completed", "evc_record", `EVC-${applicationId}`, {});
  });
}

/** Marks that the visit report is still outstanding. */
export async function markReportPending(db: Db, actor: Actor, applicationId: string): Promise<void> {
  assertCan(actor, "evc.manage");
  return db.transaction(async (tx) => {
    const res = await tx.query(
      `UPDATE evc_records SET status = 'report_pending', updated_at = $2
       WHERE application_id = $1 AND status = 'completed'`,
      [applicationId, now()],
    );
    if (res.affectedRows === 0) fail("INVALID_TRANSITION", "Only a completed visit can move to report pending.");
    await audit(tx, actor, "evc.report_pending", "evc_record", `EVC-${applicationId}`, {});
  });
}
