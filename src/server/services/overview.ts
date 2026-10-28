import type { Db } from "../db/client";
import { addDays, now } from "../clock";
import { scopeWhere, type Actor } from "../permissions";
import { APP_SELECT, isOverdue, listApplications, type ApplicationRow } from "./workflow";
import { ALERT_SELECT } from "./monitoring";
import { documentValidity, listDocuments, listUndertakings } from "./compliance";
import { unreadCount } from "./notifications";

export type NavCounts = { scrutiny: number; evc: number; tasks: number; notifications: number };

/** Counts shown as badges in the sidebar. Each one respects the user's record scope. */
export async function navCounts(db: Db, actor: Actor): Promise<NavCounts> {
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);
  const queue = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM applications a
     JOIN workflow_stages s ON s.template_id = a.template_id AND s.position = a.stage_position
     WHERE ${scope.sql} AND a.status = 'in_progress' AND s.role = $${scope.params.length + 1}`,
    [...scope.params, actor.role === "institution" ? "__none__" : actor.role],
  );
  const evc = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM evc_records e JOIN applications a ON a.id = e.application_id
     WHERE ${scope.sql} AND e.status IN ('awaiting_scheduling','scheduling_in_progress','scheduled')`,
    scope.params,
  );
  const alertScope = scopeWhere(actor, { institution: "al.institution_id", region: "al.region_id" }, 1);
  const tasks = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM alerts al WHERE ${alertScope.sql} AND al.status <> 'resolved'`,
    alertScope.params,
  );
  return {
    scrutiny: queue.rows[0]?.n ?? 0,
    evc: evc.rows[0]?.n ?? 0,
    tasks: tasks.rows[0]?.n ?? 0,
    notifications: await unreadCount(db, actor),
  };
}

export async function overviewData(db: Db, actor: Actor) {
  const t = now();
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);

  const openRows = await db.query<ApplicationRow>(
    `${APP_SELECT} WHERE ${scope.sql} AND a.status <> 'decided' ORDER BY a.due_at ASC`,
    scope.params,
  );
  const open = openRows.rows;

  const pendency = new Map<string, { stage: string; open: number; overdue: number }>();
  for (const a of open) {
    const g = pendency.get(a.stage_name) ?? { stage: a.stage_name, open: 0, overdue: 0 };
    g.open += 1;
    if (isOverdue(a)) g.overdue += 1;
    pendency.set(a.stage_name, g);
  }

  const queue =
    actor.role === "institution"
      ? await listApplications(db, actor, { status: "clarification", limit: 6 })
      : await listApplications(db, actor, { stageRole: actor.role, status: "in_progress", limit: 6 });

  const alertScope = scopeWhere(actor, { institution: "al.institution_id", region: "al.region_id" }, 1);
  const alerts = await db.query<Record<string, unknown>>(
    `${ALERT_SELECT} WHERE ${alertScope.sql} AND al.status <> 'resolved'
     ORDER BY (al.threshold_key = 'overdue') DESC, al.due_at ASC LIMIT 6`,
    alertScope.params,
  );

  const openAlertCount = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM alerts al WHERE ${alertScope.sql} AND al.status <> 'resolved'`,
    alertScope.params,
  );

  const events = await db.query<Record<string, unknown>>(
    `SELECT e.id, e.type, e.detail, e.created_at, e.application_id, a.title, u.name AS actor_name
     FROM application_events e
     JOIN applications a ON a.id = e.application_id
     LEFT JOIN users u ON u.id = e.actor_id
     WHERE ${scope.sql}
     ORDER BY e.created_at DESC, e.id DESC LIMIT 8`,
    scope.params,
  );

  const uts = await listUndertakings(db, actor);
  const undertakingsDue = uts.filter((u) => u.status !== "verified" && u.due_at.getTime() <= addDays(t, 30).getTime());

  const docs = await listDocuments(db, actor);
  const docsAttention = docs
    .map((d) => ({ ...d, validity: documentValidity(d) }))
    .filter((d) => ["expired", "expiring_7", "expiring_30", "renewal_review"].includes(d.validity.key));

  const evcAwaiting = await db.query<Record<string, unknown>>(
    `SELECT e.*, a.title, i.name AS institution_name FROM evc_records e
     JOIN applications a ON a.id = e.application_id
     JOIN institutions i ON i.id = a.institution_id
     WHERE ${scope.sql} AND e.status IN ('awaiting_scheduling','scheduling_in_progress','scheduled')
     ORDER BY COALESCE(e.scheduled_date, e.target_date) ASC LIMIT 5`,
    scope.params,
  );

  // The flow: open applications per stage, split by deadline health.
  const STAGE_ORDER = ["Scrutiny", "Re-scrutiny", "EVC visit", "Committee review", "Competent decision"];
  const flowMap = new Map<string, { stage: string; role: string; ok: number; soon: number; late: number; wait: number; total: number }>();
  for (const a of open) {
    const f = flowMap.get(a.stage_name) ?? { stage: a.stage_name, role: a.stage_role, ok: 0, soon: 0, late: 0, wait: 0, total: 0 };
    const daysLeft = Math.floor((a.due_at.getTime() - t.getTime()) / 86400000);
    if (a.status === "clarification") f.wait += 1;
    else if (daysLeft < 0) f.late += 1;
    else if (daysLeft <= 7) f.soon += 1;
    else f.ok += 1;
    f.total += 1;
    flowMap.set(a.stage_name, f);
  }
  const flow = [...flowMap.values()].sort((x, y) => STAGE_ORDER.indexOf(x.stage) - STAGE_ORDER.indexOf(y.stage));

  // Activity: recorded events per day for the last 30 days.
  const since = addDays(t, -29);
  const act = await db.query<{ day: string; n: number }>(
    `SELECT to_char(e.created_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
     FROM application_events e JOIN applications a ON a.id = e.application_id
     WHERE ${scope.sql} AND e.created_at >= $${scope.params.length + 1}
     GROUP BY 1`,
    [...scope.params, since],
  );
  const actMap = new Map(act.rows.map((r) => [r.day, r.n]));
  const activity = Array.from({ length: 30 }, (_, i) => {
    const d = addDays(since, i);
    const key = d.toISOString().slice(0, 10);
    return { day: key, n: actMap.get(key) ?? 0 };
  });

  const regionMap = new Map<string, { region: string; open: number; late: number }>();
  for (const a of open) {
    const r = regionMap.get(a.region_name) ?? { region: a.region_name, open: 0, late: 0 };
    r.open += 1;
    if (isOverdue(a)) r.late += 1;
    regionMap.set(a.region_name, r);
  }
  const regions = [...regionMap.values()].sort((x, y) => y.open - x.open);

  const escalations = await db.query<{ created_at: Date; level: number; entity_label: string; link: string; to_role: string }>(
    `SELECT e.created_at, e.level, al.entity_label, al.link, e.to_role
     FROM escalation_events e JOIN alerts al ON al.id = e.alert_id
     WHERE ${alertScope.sql} AND al.status <> 'resolved'
     ORDER BY e.created_at DESC, e.level DESC LIMIT 5`,
    alertScope.params,
  );

  const attention =
    actor.role === "admin" || actor.role === "regional" || actor.role === "auditor"
      ? open.filter((a) => isOverdue(a) || a.due_at.getTime() - t.getTime() < 7 * 86400000).slice(0, 6)
      : queue;

  return {
    flow,
    activity,
    regions,
    escalations: escalations.rows,
    attention,
    openApps: open.slice(0, 8),
    kpis: {
      open: open.length,
      overdue: open.filter((a) => isOverdue(a)).length,
      queue: queue.length,
      evcAwaiting: evcAwaiting.rows.length,
      openAlerts: openAlertCount.rows[0]?.n ?? 0,
      undertakingsDue: undertakingsDue.length,
      documentsAttention: docsAttention.length,
    },
    pendency: [...pendency.values()],
    queue,
    alerts: alerts.rows,
    events: events.rows,
    undertakingsDue: undertakingsDue.slice(0, 5),
    docsAttention: docsAttention.slice(0, 5),
    evcUpcoming: evcAwaiting.rows,
  };
}
