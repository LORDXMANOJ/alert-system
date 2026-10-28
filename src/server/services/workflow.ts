import { z } from "zod";
import type { Db } from "../db/client";
import type { Q } from "../db/types";
import { fail } from "../errors";
import { addDays, now } from "../clock";
import { assertCan, assertCanView, scopeWhere, type Actor } from "../permissions";
import { audit, notifyRole } from "../audit";

export const APP_SELECT = `
SELECT a.*,
  i.name AS institution_name, i.is_new AS institution_is_new,
  r.name AS region_name,
  t.name AS template_name,
  s.name AS stage_name, s.role AS stage_role, s.target_days, s.is_evc, s.is_committee,
  s.is_decision, s.checklist AS stage_checklist,
  (SELECT COUNT(*)::int FROM workflow_stages ws WHERE ws.template_id = a.template_id) AS stage_count,
  asg.name AS assignee_name
FROM applications a
JOIN institutions i ON i.id = a.institution_id
JOIN regions r ON r.id = a.region_id
JOIN workflow_templates t ON t.id = a.template_id
JOIN workflow_stages s ON s.template_id = a.template_id AND s.position = a.stage_position
LEFT JOIN users asg ON asg.id = a.assignee_id`;

export type ApplicationRow = {
  id: string;
  title: string;
  institution_id: string;
  region_id: string;
  template_id: string;
  category: string;
  stage_position: number;
  status: "in_progress" | "clarification" | "decided";
  priority: "normal" | "high";
  submitted_at: Date;
  stage_entered_at: Date;
  due_at: Date;
  last_action_at: Date;
  decision: string | null;
  decision_reason: string | null;
  clarification_reason: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  institution_name: string;
  institution_is_new: boolean;
  region_name: string;
  template_name: string;
  stage_name: string;
  stage_role: string;
  target_days: number;
  is_evc: boolean;
  is_committee: boolean;
  is_decision: boolean;
  stage_checklist: string;
  stage_count: number;
};

export type StageRow = {
  id: number;
  position: number;
  name: string;
  role: string;
  target_days: number;
  is_evc: boolean;
  is_committee: boolean;
  is_decision: boolean;
  checklist: string;
};

const EVC_DONE_STATUSES = ["completed", "report_pending", "closed"];

const createSchema = z.object({
  title: z.string().trim().min(5, "Title needs at least 5 characters.").max(140),
  category: z.string().min(1, "Choose a category."),
  institutionId: z.string().optional(),
});

const reasonSchema = z
  .string()
  .trim()
  .min(10, "Give a reason of at least 10 characters so the history is clear.")
  .max(1000);

export async function loadApplication(q: Q, id: string): Promise<ApplicationRow | null> {
  const res = await q.query<ApplicationRow>(`${APP_SELECT} WHERE a.id = $1`, [id]);
  return res.rows[0] ?? null;
}

async function requireApplication(q: Q, actor: Actor, id: string): Promise<ApplicationRow> {
  const app = await loadApplication(q, id);
  if (!app) fail("NOT_FOUND", "Application not found.");
  assertCanView(actor, { institutionId: app.institution_id, regionId: app.region_id });
  return app;
}

export function isOverdue(app: { due_at: Date; status: string }): boolean {
  return app.status !== "decided" && app.due_at.getTime() < now().getTime();
}

/** Stage-owned work: the stage's role must match the actor's role. This stops unauthorized approvals. */
function assertStageOwner(app: ApplicationRow, actor: Actor): void {
  if (app.stage_role !== actor.role) {
    fail("FORBIDDEN", `The current stage (${app.stage_name}) is handled by the ${app.stage_role} role.`);
  }
}

async function createEvcRecord(q: Q, applicationId: string, actor: Actor | null): Promise<void> {
  const t = now();
  await q.query(
    `INSERT INTO evc_records (id, application_id, status, target_date, created_at, updated_at)
     VALUES ($1, $2, 'awaiting_scheduling', $3, $4, $4)`,
    [`EVC-${applicationId}`, applicationId, addDays(t, 14), t],
  );
  await q.query(
    `INSERT INTO application_events (application_id, actor_id, actor_role, type, detail, created_at)
     VALUES ($1, $2, $3, 'evc_queued', 'Placed in the EVC queue (awaiting scheduling).', $4)`,
    [applicationId, actor?.id ?? "system", actor?.role ?? "system", t],
  );
}

export async function nextApplicationId(q: Q): Promise<string> {
  const year = now().getUTCFullYear();
  const res = await q.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM applications WHERE id LIKE $1",
    [`APF-${year}-%`],
  );
  return `APF-${year}-${String((res.rows[0]?.n ?? 0) + 1).padStart(4, "0")}`;
}

export async function createApplication(db: Db, actor: Actor, input: unknown): Promise<string> {
  assertCan(actor, "app.create");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input.");
  const data = parsed.data;

  const institutionId = actor.role === "institution" ? actor.institutionId : data.institutionId;
  if (!institutionId) fail("INVALID_INPUT", "Choose an institution.");

  return db.transaction(async (tx) => {
    const inst = await tx.query<{ id: string; region_id: string }>(
      "SELECT id, region_id FROM institutions WHERE id = $1",
      [institutionId],
    );
    if (!inst.rows[0]) fail("INVALID_INPUT", "Institution not found.");

    const template = await tx.query<{ id: string }>(
      "SELECT id FROM workflow_templates WHERE category = $1 AND active = TRUE",
      [data.category],
    );
    if (!template.rows[0]) fail("INVALID_INPUT", "No workflow is configured for this category.");
    const templateId = template.rows[0].id;

    const first = await tx.query<StageRow>(
      "SELECT * FROM workflow_stages WHERE template_id = $1 ORDER BY position LIMIT 1",
      [templateId],
    );
    const stage = first.rows[0];
    if (!stage) fail("INVALID_INPUT", "The workflow has no stages.");

    const id = await nextApplicationId(tx);
    const t = now();
    await tx.query(
      `INSERT INTO applications (id, title, institution_id, region_id, template_id, category, stage_position,
         status, priority, submitted_at, stage_entered_at, due_at, last_action_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'in_progress','normal',$8,$8,$9,$8)`,
      [
        id,
        data.title,
        institutionId,
        inst.rows[0].region_id,
        templateId,
        data.category,
        stage.position,
        t,
        addDays(t, stage.target_days),
      ],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, to_stage, detail, created_at)
       VALUES ($1,$2,$3,'submitted',$4,'Application submitted and placed in the first stage.',$5)`,
      [id, actor.id, actor.role, stage.position, t],
    );
    if (stage.is_evc) await createEvcRecord(tx, id, actor);

    await audit(tx, actor, "application.created", "application", id, { category: data.category, institutionId });
    await notifyRole(tx, { role: stage.role, regionId: null }, {
      title: `New application ${id}`,
      body: `${data.title} is waiting for ${stage.name}.`,
      severity: "info",
      link: `/applications/${id}`,
    });
    await notifyRole(tx, { role: "institution", institutionId }, {
      title: "Application submitted",
      body: `${id} was submitted and entered ${stage.name}.`,
      severity: "success",
      link: `/applications/${id}`,
    });
    return id;
  });
}

export async function completeStage(
  db: Db,
  actor: Actor,
  applicationId: string,
  input: { checklist: boolean[]; observations?: string },
): Promise<void> {
  assertCan(actor, "app.stage");
  return db.transaction(async (tx) => {
    const app = await requireApplication(tx, actor, applicationId);
    if (app.status !== "in_progress") {
      fail("INVALID_TRANSITION", "This application is awaiting clarification from the institution.");
    }
    assertStageOwner(app, actor);
    if (app.is_decision) {
      fail("INVALID_TRANSITION", "The final stage is completed with Record decision, not Complete stage.");
    }

    const checklist = JSON.parse(app.stage_checklist) as string[];
    const missing = checklist.filter((_, i) => input.checklist[i] !== true);
    if (missing.length > 0) {
      fail("INVALID_TRANSITION", `Confirm every checklist item first. Missing: ${missing.join("; ")}.`);
    }

    if (app.is_evc) {
      const evc = await tx.query<{ status: string }>(
        "SELECT status FROM evc_records WHERE application_id = $1",
        [applicationId],
      );
      const status = evc.rows[0]?.status;
      if (!status || !EVC_DONE_STATUSES.includes(status)) {
        fail("INVALID_TRANSITION", "The EVC visit must be recorded as completed before this stage can be completed.");
      }
    }

    const next = await tx.query<StageRow>(
      "SELECT * FROM workflow_stages WHERE template_id = $1 AND position > $2 ORDER BY position LIMIT 1",
      [app.template_id, app.stage_position],
    );
    const nextStage = next.rows[0];
    if (!nextStage) fail("INVALID_TRANSITION", "There is no next stage in this workflow.");

    const t = now();
    await tx.query(
      `UPDATE applications SET stage_position = $2, stage_entered_at = $3, due_at = $4, last_action_at = $3
       WHERE id = $1`,
      [applicationId, nextStage.position, t, addDays(t, nextStage.target_days)],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, from_stage, to_stage, detail, created_at)
       VALUES ($1,$2,$3,'stage_completed',$4,$5,$6,$7)`,
      [
        applicationId,
        actor.id,
        actor.role,
        app.stage_position,
        nextStage.position,
        input.observations?.trim() || `${app.stage_name} completed.`,
        t,
      ],
    );
    if (nextStage.is_evc) await createEvcRecord(tx, applicationId, actor);

    await audit(tx, actor, "application.stage_completed", "application", applicationId, {
      from: app.stage_name,
      to: nextStage.name,
      checklistItems: checklist.length,
    });
    await notifyRole(tx, { role: nextStage.role }, {
      title: `Assigned: ${applicationId}`,
      body: `${app.title} is now at ${nextStage.name}.`,
      severity: "info",
      link: `/applications/${applicationId}`,
    });
    await notifyRole(tx, { role: "institution", institutionId: app.institution_id }, {
      title: "Application progressed",
      body: `${applicationId} moved to ${nextStage.name}.`,
      severity: "success",
      link: `/applications/${applicationId}`,
    });
  });
}

export async function returnForClarification(
  db: Db,
  actor: Actor,
  applicationId: string,
  reasonInput: unknown,
): Promise<void> {
  assertCan(actor, "app.return");
  const parsed = reasonSchema.safeParse(reasonInput);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "A reason is required.");
  const reason = parsed.data;

  return db.transaction(async (tx) => {
    const app = await requireApplication(tx, actor, applicationId);
    if (app.status !== "in_progress") fail("INVALID_TRANSITION", "Only an application in progress can be returned.");
    assertStageOwner(app, actor);
    const t = now();
    await tx.query(
      `UPDATE applications SET status = 'clarification', clarification_reason = $2, last_action_at = $3 WHERE id = $1`,
      [applicationId, reason, t],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, from_stage, reason, created_at)
       VALUES ($1,$2,$3,'returned_for_clarification',$4,$5,$6)`,
      [applicationId, actor.id, actor.role, app.stage_position, reason, t],
    );
    await audit(tx, actor, "application.returned", "application", applicationId, { stage: app.stage_name }, reason);
    await notifyRole(tx, { role: "institution", institutionId: app.institution_id }, {
      title: `Clarification requested: ${applicationId}`,
      body: reason,
      severity: "warning",
      link: `/applications/${applicationId}`,
    });
  });
}

export async function respondToClarification(
  db: Db,
  actor: Actor,
  applicationId: string,
  responseInput: unknown,
): Promise<void> {
  assertCan(actor, "app.respond");
  const parsed = reasonSchema.safeParse(responseInput);
  if (!parsed.success) fail("INVALID_INPUT", parsed.error.issues[0]?.message ?? "A response is required.");
  const response = parsed.data;

  return db.transaction(async (tx) => {
    const app = await requireApplication(tx, actor, applicationId);
    if (app.status !== "clarification") fail("INVALID_TRANSITION", "No clarification is pending for this application.");
    const t = now();
    await tx.query(
      `UPDATE applications SET status = 'in_progress', clarification_reason = NULL, last_action_at = $2 WHERE id = $1`,
      [applicationId, t],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, from_stage, detail, created_at)
       VALUES ($1,$2,$3,'clarification_response',$4,$5,$6)`,
      [applicationId, actor.id, actor.role, app.stage_position, response, t],
    );
    await audit(tx, actor, "application.clarification_answered", "application", applicationId, {});
    await notifyRole(tx, { role: app.stage_role }, {
      title: `Clarification answered: ${applicationId}`,
      body: "The institution responded. The application has resumed at its current stage.",
      severity: "info",
      link: `/applications/${applicationId}`,
    });
  });
}

export async function recordDecision(
  db: Db,
  actor: Actor,
  applicationId: string,
  input: { outcome: string; reason: unknown; checklistConfirmed: boolean },
): Promise<void> {
  assertCan(actor, "app.decide");
  const outcome = z.enum(["approved", "deferred", "rejected"]).safeParse(input.outcome);
  if (!outcome.success) fail("INVALID_INPUT", "Choose an outcome.");
  const reason = reasonSchema.safeParse(input.reason);
  if (!reason.success) fail("INVALID_INPUT", reason.error.issues[0]?.message ?? "A reason is required.");
  if (!input.checklistConfirmed) {
    fail("INVALID_INPUT", "Confirm that you have reviewed the history and observations.");
  }

  return db.transaction(async (tx) => {
    const app = await requireApplication(tx, actor, applicationId);
    if (app.status !== "in_progress") fail("INVALID_TRANSITION", "This application cannot receive a decision right now.");
    assertStageOwner(app, actor);
    if (!app.is_decision) fail("INVALID_TRANSITION", "The application is not at its decision stage yet.");
    const t = now();
    await tx.query(
      `UPDATE applications SET status = 'decided', decision = $2, decision_reason = $3, last_action_at = $4 WHERE id = $1`,
      [applicationId, outcome.data, reason.data, t],
    );
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, from_stage, reason, detail, created_at)
       VALUES ($1,$2,$3,'decision_recorded',$4,$5,$6,$7)`,
      [applicationId, actor.id, actor.role, app.stage_position, reason.data, `Outcome recorded by the competent authority: ${outcome.data}.`, t],
    );
    await audit(tx, actor, "application.decision_recorded", "application", applicationId, { outcome: outcome.data }, reason.data);
    await notifyRole(tx, { role: "institution", institutionId: app.institution_id }, {
      title: `Decision recorded: ${applicationId}`,
      body: `The competent authority recorded the outcome: ${outcome.data}.`,
      severity: outcome.data === "rejected" ? "critical" : "success",
      link: `/applications/${applicationId}`,
    });
  });
}

export async function assignApplication(db: Db, actor: Actor, applicationId: string, userId: string): Promise<void> {
  if (actor.role !== "admin") {
    assertCan(actor, "app.stage");
  }
  return db.transaction(async (tx) => {
    const app = await requireApplication(tx, actor, applicationId);
    if (actor.role !== "admin") assertStageOwner(app, actor);
    const user = await tx.query<{ id: string; name: string; role: string }>(
      "SELECT id, name, role FROM users WHERE id = $1",
      [userId],
    );
    const target = user.rows[0];
    if (!target) fail("INVALID_INPUT", "User not found.");
    if (target.role !== app.stage_role) {
      fail("INVALID_INPUT", `Only a ${app.stage_role} user can be assigned to this stage.`);
    }
    await tx.query("UPDATE applications SET assignee_id = $2, last_action_at = $3 WHERE id = $1", [applicationId, userId, now()]);
    await tx.query(
      `INSERT INTO application_events (application_id, actor_id, actor_role, type, detail, created_at)
       VALUES ($1,$2,$3,'assigned',$4,$5)`,
      [applicationId, actor.id, actor.role, `Assigned to ${target.name}.`, now()],
    );
    await audit(tx, actor, "application.assigned", "application", applicationId, { assignee: target.name });
  });
}

export async function updateStageTarget(db: Db, actor: Actor, stageId: number, targetDays: number): Promise<void> {
  assertCan(actor, "admin.manage");
  if (!Number.isInteger(targetDays) || targetDays < 1 || targetDays > 365) {
    fail("INVALID_INPUT", "Target days must be a whole number between 1 and 365.");
  }
  return db.transaction(async (tx) => {
    const res = await tx.query<{ name: string; template_id: string }>(
      "UPDATE workflow_stages SET target_days = $2 WHERE id = $1 RETURNING name, template_id",
      [stageId, targetDays],
    );
    if (!res.rows[0]) fail("NOT_FOUND", "Stage not found.");
    await tx.query("UPDATE workflow_templates SET version = version + 1 WHERE id = $1", [res.rows[0].template_id]);
    await audit(tx, actor, "workflow.stage_target_changed", "workflow_stage", String(stageId), {
      stage: res.rows[0].name,
      targetDays,
      note: "Applies to applications that enter this stage from now on.",
    });
  });
}

export type ListFilters = {
  q?: string;
  stageRole?: string;
  status?: string;
  regionId?: string;
  overdueOnly?: boolean;
  limit?: number;
};

export async function listApplications(db: Db, actor: Actor, filters: ListFilters = {}): Promise<ApplicationRow[]> {
  const params: unknown[] = [];
  const clauses: string[] = [];
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);
  params.push(...scope.params);
  clauses.push(scope.sql);
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const p = `$${params.length}`;
    clauses.push(`(a.id ILIKE ${p} OR a.title ILIKE ${p} OR i.name ILIKE ${p})`);
  }
  if (filters.stageRole) {
    params.push(filters.stageRole);
    clauses.push(`s.role = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`a.status = $${params.length}`);
  }
  if (filters.regionId) {
    params.push(filters.regionId);
    clauses.push(`a.region_id = $${params.length}`);
  }
  if (filters.overdueOnly) {
    params.push(now());
    clauses.push(`a.due_at < $${params.length} AND a.status <> 'decided'`);
  }
  params.push(filters.limit ?? 200);
  const sql = `${APP_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY a.due_at ASC LIMIT $${params.length}`;
  const res = await db.query<ApplicationRow>(sql, params);
  return res.rows;
}

export async function getApplicationDetail(db: Db, actor: Actor, id: string) {
  const app = await requireApplication(db, actor, id);
  const [stages, events, evc, undertakings, documents, alerts] = await Promise.all([
    db.query<StageRow>("SELECT * FROM workflow_stages WHERE template_id = $1 ORDER BY position", [app.template_id]),
    db.query<{
      id: number;
      type: string;
      actor_id: string;
      actor_role: string;
      from_stage: number | null;
      to_stage: number | null;
      reason: string | null;
      detail: string | null;
      created_at: Date;
      actor_name: string | null;
    }>(
      `SELECT e.*, u.name AS actor_name FROM application_events e
       LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.application_id = $1 ORDER BY e.created_at DESC, e.id DESC`,
      [id],
    ),
    db.query<Record<string, unknown>>("SELECT * FROM evc_records WHERE application_id = $1", [id]),
    db.query<Record<string, unknown>>(
      "SELECT * FROM undertakings WHERE application_id = $1 ORDER BY due_at",
      [id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT d.*, (SELECT COUNT(*)::int FROM document_versions v WHERE v.document_id = d.id) AS version_count
       FROM documents d WHERE d.application_id = $1 ORDER BY d.created_at`,
      [id],
    ),
    db.query<Record<string, unknown>>(
      `SELECT al.*, r.name AS rule_name FROM alerts al JOIN alert_rules r ON r.id = al.rule_id
       WHERE al.entity_type = 'application' AND al.entity_id = $1 ORDER BY al.created_at DESC`,
      [id],
    ),
  ]);
  return {
    app,
    stages: stages.rows,
    events: events.rows,
    evc: evc.rows[0] ?? null,
    undertakings: undertakings.rows,
    documents: documents.rows,
    alerts: alerts.rows,
  };
}
