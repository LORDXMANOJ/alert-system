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

  return {
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
