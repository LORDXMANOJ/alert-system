import type { Db } from "../db/client";
import type { Q } from "../db/types";
import { fail } from "../errors";
import { daysBetween, now } from "../clock";
import { assertCan, scopeWhere, type Actor } from "../permissions";
import { audit, notifyRole } from "../audit";

/**
 * The unified deadline and compliance engine.
 *
 * Each rule has a collector that finds records with a due date. For each record the engine works out
 * one threshold key: "within-N" (the nearest configured threshold N days or less away) or "overdue".
 * It then creates at most one open alert per (rule, record). Re-running the checks is idempotent:
 * an open alert with the same key is counted as a duplicate and skipped.
 */

export type Candidate = {
  ruleId: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  dueAt: Date;
  responsibleRole: string;
  institutionId: string | null;
  regionId: string | null;
  link: string;
  message: string;
};

export type MonitoringSummary = {
  checkedAt: string;
  created: number;
  duplicatesSkipped: number;
  superseded: number;
  autoResolved: number;
  escalated: number;
  candidates: number;
};

/** Escalation ladder. Level 1 goes to the supervisory role; level 2 to the designated administrator. */
export const ESCALATION_LADDER = [
  { level: 1, role: "regional", label: "Regional supervisor" },
  { level: 2, role: "admin", label: "Designated administrative authority" },
];

export function thresholdKey(daysLeft: number, thresholds: number[]): string | null {
  if (daysLeft < 0) return "overdue";
  const sorted = [...thresholds].sort((a, b) => a - b);
  const hit = sorted.find((t) => daysLeft <= t);
  return hit === undefined ? null : `within-${hit}`;
}

async function collect(q: Q, ruleId: string): Promise<Candidate[]> {
  if (ruleId === "R-STAGE") {
    const res = await q.query<{
      id: string; title: string; due_at: Date; institution_id: string; region_id: string; stage_name: string; stage_role: string;
    }>(
      `SELECT a.id, a.title, a.due_at, a.institution_id, a.region_id, s.name AS stage_name, s.role AS stage_role
       FROM applications a
       JOIN workflow_stages s ON s.template_id = a.template_id AND s.position = a.stage_position
       WHERE a.status = 'in_progress'`,
    );
    return res.rows.map((r) => ({
      ruleId, entityType: "application", entityId: r.id, entityLabel: `${r.id} · ${r.title}`,
      dueAt: r.due_at, responsibleRole: r.stage_role, institutionId: r.institution_id, regionId: r.region_id,
      link: `/applications/${r.id}`, message: `${r.stage_name} is due for ${r.id}.`,
    }));
  }
  if (ruleId === "R-EVC") {
    const res = await q.query<{
      application_id: string; status: string; target_date: Date; scheduled_date: Date | null; title: string;
      institution_id: string; region_id: string;
    }>(
      `SELECT e.application_id, e.status, e.target_date, e.scheduled_date, a.title, a.institution_id, a.region_id
       FROM evc_records e JOIN applications a ON a.id = e.application_id
       WHERE e.status IN ('awaiting_scheduling','scheduling_in_progress','scheduled')`,
    );
    return res.rows.map((r) => {
      const scheduled = r.status === "scheduled";
      return {
        ruleId, entityType: "evc", entityId: r.application_id, entityLabel: `${r.application_id} · EVC visit`,
        dueAt: scheduled && r.scheduled_date ? r.scheduled_date : r.target_date,
        responsibleRole: "evc", institutionId: r.institution_id, regionId: r.region_id,
        link: `/applications/${r.application_id}?tab=evc`,
        message: scheduled ? `Scheduled EVC visit for ${r.application_id} is approaching.` : `EVC for ${r.application_id} needs scheduling.`,
      };
    });
  }
  if (ruleId === "R-UT") {
    const res = await q.query<{ id: string; condition: string; due_at: Date; institution_id: string; region_id: string }>(
      `SELECT ut.id, ut.condition, ut.due_at, ut.institution_id, a.region_id
       FROM undertakings ut JOIN applications a ON a.id = ut.application_id
       WHERE ut.status IN ('active','correction_requested')`,
    );
    return res.rows.map((r) => ({
      ruleId, entityType: "undertaking", entityId: r.id, entityLabel: `${r.id} · ${r.condition.slice(0, 60)}`,
      dueAt: r.due_at, responsibleRole: "institution", institutionId: r.institution_id, regionId: r.region_id,
      link: `/undertakings/${r.id}`, message: `Undertaking ${r.id} is due. Submit the required evidence.`,
    }));
  }
  if (ruleId === "R-DOC") {
    const res = await q.query<{
      id: string; title: string; expires_at: Date; institution_id: string; region_id: string;
    }>(
      `SELECT d.id, d.title, cur.expires_at, d.institution_id, i.region_id
       FROM documents d
       JOIN institutions i ON i.id = d.institution_id
       JOIN LATERAL (
         SELECT v.expires_at FROM document_versions v
         WHERE v.document_id = d.id AND v.review_status = 'accepted'
         ORDER BY v.version_no DESC LIMIT 1
       ) cur ON TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM document_versions p WHERE p.document_id = d.id AND p.review_status = 'pending'
       )`,
    );
    return res.rows.map((r) => ({
      ruleId, entityType: "document", entityId: r.id, entityLabel: `${r.id} · ${r.title}`,
      dueAt: r.expires_at, responsibleRole: "institution", institutionId: r.institution_id, regionId: r.region_id,
      link: `/documents/${r.id}`, message: `${r.title} is nearing or past its validity date. Submit a renewal.`,
    }));
  }
  if (ruleId === "R-REVIEW") {
    const subs = await q.query<{ undertaking_id: string; version_no: number; submitted_at: Date; institution_id: string; region_id: string }>(
      `SELECT s.undertaking_id, s.version_no, s.submitted_at, ut.institution_id, a.region_id
       FROM undertaking_submissions s
       JOIN undertakings ut ON ut.id = s.undertaking_id
       JOIN applications a ON a.id = ut.application_id
       WHERE s.review_status = 'pending'`,
    );
    const docs = await q.query<{ id: string; version_no: number; submitted_at: Date; institution_id: string; region_id: string; title: string }>(
      `SELECT v.document_id AS id, v.version_no, v.submitted_at, d.institution_id, i.region_id, d.title
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       JOIN institutions i ON i.id = d.institution_id
       WHERE v.review_status = 'pending'`,
    );
    const REVIEW_WINDOW_DAYS = 3; // Illustrative: configurable review turnaround.
    const addDays = (d: Date) => new Date(d.getTime() + REVIEW_WINDOW_DAYS * 24 * 3600 * 1000);
    return [
      ...subs.rows.map((r) => ({
        ruleId, entityType: "review", entityId: `${r.undertaking_id}:v${r.version_no}`, entityLabel: `${r.undertaking_id} · evidence v${r.version_no}`,
        dueAt: addDays(r.submitted_at), responsibleRole: "reviewer", institutionId: r.institution_id, regionId: r.region_id,
        link: `/undertakings/${r.undertaking_id}`, message: `Evidence for ${r.undertaking_id} (v${r.version_no}) is waiting for review.`,
      })),
      ...docs.rows.map((r) => ({
        ruleId, entityType: "review", entityId: `${r.id}:v${r.version_no}`, entityLabel: `${r.id} · ${r.title} v${r.version_no}`,
        dueAt: addDays(r.submitted_at), responsibleRole: "reviewer", institutionId: r.institution_id, regionId: r.region_id,
        link: `/documents/${r.id}`, message: `${r.title} (version ${r.version_no}) is waiting for verification.`,
      })),
    ];
  }
  return [];
}

export async function runMonitoringChecks(db: Db, actor: Actor | null): Promise<MonitoringSummary> {
  if (actor) assertCan(actor, "alert.run");
  const summary: MonitoringSummary = {
    checkedAt: now().toISOString(),
    created: 0,
    duplicatesSkipped: 0,
    superseded: 0,
    autoResolved: 0,
    escalated: 0,
    candidates: 0,
  };

  await db.transaction(async (tx) => {
    const rules = await tx.query<{ id: string; thresholds_days: string; severity: string; responsible_role: string; enabled: boolean; escalation_delay_days: number; name: string }>(
      "SELECT * FROM alert_rules WHERE enabled = TRUE ORDER BY id",
    );

    for (const rule of rules.rows) {
      const thresholds = rule.thresholds_days.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
      const candidates = await collect(tx, rule.id);
      summary.candidates += candidates.length;

      const activeEntities = new Set<string>();
      for (const c of candidates) {
        const key = thresholdKey(daysBetween(now(), c.dueAt), thresholds);
        if (key === null) continue;
        const entityKey = `${c.entityType}:${c.entityId}`;
        activeEntities.add(entityKey);

        // A record can only have one open alert per rule. If its threshold has moved, supersede the old one.
        const open = await tx.query<{ id: number; threshold_key: string }>(
          `SELECT id, threshold_key FROM alerts
           WHERE rule_id = $1 AND entity_type = $2 AND entity_id = $3 AND status <> 'resolved'`,
          [rule.id, c.entityType, c.entityId],
        );
        const existing = open.rows[0];
        if (existing && existing.threshold_key === key) {
          summary.duplicatesSkipped += 1;
          continue;
        }
        if (existing) {
          await tx.query(
            `UPDATE alerts SET status = 'resolved', resolved_at = $2, resolution_note = $3 WHERE id = $1`,
            [existing.id, now(), `Superseded: the condition moved to ${key}.`],
          );
          summary.superseded += 1;
        }

        const severity = key === "overdue" ? "critical" : rule.severity;
        // Insert, or re-open a previously resolved alert for the same threshold when the condition returns.
        const inserted = await tx.query<{ id: number }>(
          `INSERT INTO alerts (rule_id, entity_type, entity_id, entity_label, institution_id, region_id, threshold_key,
             severity, message, responsible_role, link, due_at, status, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'open',$13)
           ON CONFLICT (rule_id, entity_type, entity_id, threshold_key) DO UPDATE
             SET status = 'open', resolved_at = NULL, resolution_note = NULL, acknowledged_at = NULL,
                 created_at = EXCLUDED.created_at, due_at = EXCLUDED.due_at, message = EXCLUDED.message,
                 severity = EXCLUDED.severity
             WHERE alerts.status = 'resolved'
           RETURNING id`,
          [rule.id, c.entityType, c.entityId, c.entityLabel, c.institutionId, c.regionId, key, severity, c.message, c.responsibleRole, c.link, c.dueAt, now()],
        );
        if (inserted.rows.length === 0) {
          summary.duplicatesSkipped += 1;
          continue;
        }
        summary.created += 1;
        await notifyRole(tx, { role: c.responsibleRole, institutionId: c.responsibleRole === "institution" ? c.institutionId : null, regionId: null }, {
          title: key === "overdue" ? `Overdue: ${c.entityLabel}` : `Due soon: ${c.entityLabel}`,
          body: c.message,
          severity: key === "overdue" ? "critical" : "warning",
          link: c.link,
        });
      }

      // Auto-resolve open alerts whose condition has cleared (e.g. a renewal was accepted).
      const stale = await tx.query<{ id: number; entity_type: string; entity_id: string }>(
        `SELECT id, entity_type, entity_id FROM alerts WHERE rule_id = $1 AND status <> 'resolved'`,
        [rule.id],
      );
      for (const row of stale.rows) {
        if (activeEntities.has(`${row.entity_type}:${row.entity_id}`)) continue;
        await tx.query(
          `UPDATE alerts SET status = 'resolved', resolved_at = $2, resolution_note = 'Condition cleared automatically.' WHERE id = $1`,
          [row.id, now()],
        );
        summary.autoResolved += 1;
      }
    }

    // Escalation: an overdue alert climbs one level each time the rule's escalation delay elapses.
    const overdue = await tx.query<{ id: number; rule_id: string; due_at: Date; entity_label: string; delay: number; message: string; institution_id: string | null; region_id: string | null }>(
      `SELECT al.id, al.rule_id, al.due_at, al.entity_label, al.message, al.institution_id, al.region_id,
              r.escalation_delay_days AS delay
       FROM alerts al JOIN alert_rules r ON r.id = al.rule_id
       WHERE al.threshold_key = 'overdue' AND al.status <> 'resolved'`,
    );
    for (const alert of overdue.rows) {
      const overdueDays = daysBetween(alert.due_at, now());
      for (const step of ESCALATION_LADDER) {
        if (overdueDays < alert.delay * step.level) continue;
        const inserted = await tx.query<{ id: number }>(
          `INSERT INTO escalation_events (alert_id, level, to_role, reason, created_at)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (alert_id, level) DO NOTHING RETURNING id`,
          [alert.id, step.level, step.role, `Overdue by ${overdueDays} day(s); escalated to ${step.label}.`, now()],
        );
        if (inserted.rows.length === 0) continue;
        summary.escalated += 1;
        await notifyRole(tx, { role: step.role }, {
          title: `Escalation level ${step.level}: ${alert.entity_label}`,
          body: `${alert.message} Overdue for ${overdueDays} day(s).`,
          severity: "critical",
          link: "/alerts",
        });
      }
    }

    await audit(tx, actor, "monitoring.run", "system", null, { ...summary });
    await tx.query(
      `INSERT INTO system_settings (key, value) VALUES ('last_monitoring_run', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(summary)],
    );
  });

  return summary;
}

export const ALERT_SELECT = `
SELECT al.*, r.name AS rule_name,
  (SELECT COUNT(*)::int FROM escalation_events e WHERE e.alert_id = al.id) AS escalation_count
FROM alerts al JOIN alert_rules r ON r.id = al.rule_id`;

export async function listAlerts(db: Db, actor: Actor, status?: string) {
  const scope = scopeWhere(actor, { institution: "al.institution_id", region: "al.region_id" }, 1);
  const params: unknown[] = [...scope.params];
  let where = scope.sql;
  if (status) {
    params.push(status);
    where += ` AND al.status = $${params.length}`;
  }
  const res = await db.query<Record<string, unknown>>(
    `${ALERT_SELECT} WHERE ${where} ORDER BY (al.threshold_key = 'overdue') DESC, al.due_at ASC LIMIT 300`,
    params,
  );
  return res.rows;
}

export async function updateAlert(db: Db, actor: Actor, alertId: number, action: "acknowledge" | "resolve", note?: string): Promise<void> {
  assertCan(actor, "alert.update");
  return db.transaction(async (tx) => {
    const row = await tx.query<{ status: string; region_id: string | null; institution_id: string | null }>(
      "SELECT status, region_id, institution_id FROM alerts WHERE id = $1",
      [alertId],
    );
    const alert = row.rows[0];
    if (!alert) fail("NOT_FOUND", "Alert not found.");
    if (actor.role === "regional" && alert.region_id !== actor.regionId) fail("NOT_FOUND", "Alert not found or not in your scope.");
    if (action === "acknowledge") {
      if (alert.status !== "open") fail("INVALID_TRANSITION", "Only an open alert can be acknowledged.");
      await tx.query("UPDATE alerts SET status = 'acknowledged', acknowledged_at = $2 WHERE id = $1", [alertId, now()]);
      await audit(tx, actor, "alert.acknowledged", "alert", String(alertId), {});
      return;
    }
    if (alert.status === "resolved") fail("INVALID_TRANSITION", "This alert is already resolved.");
    const resolution = (note ?? "").trim();
    if (resolution.length < 5) fail("INVALID_INPUT", "Add a resolution note (at least 5 characters).");
    await tx.query(
      "UPDATE alerts SET status = 'resolved', resolved_at = $2, resolution_note = $3 WHERE id = $1",
      [alertId, now(), resolution],
    );
    await audit(tx, actor, "alert.resolved", "alert", String(alertId), {}, resolution);
  });
}
