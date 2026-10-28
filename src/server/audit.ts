import type { Q } from "./db/types";
import type { Actor } from "./permissions";
import { now } from "./clock";

/**
 * Appends one row to the audit log. Call it inside the same transaction as the change it records,
 * so a change and its audit entry are committed together or not at all.
 */
export async function audit(
  q: Q,
  actor: Actor | null,
  action: string,
  entityType: string,
  entityId: string | null,
  meta: Record<string, unknown> = {},
  reason?: string,
): Promise<void> {
  await q.query(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, reason, meta, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      actor?.id ?? "system",
      actor?.role ?? "system",
      action,
      entityType,
      entityId,
      reason ?? null,
      JSON.stringify(meta),
      now(),
    ],
  );
}

/** Creates an in-app notification for every active user holding `role` (optionally in one scope). */
export async function notifyRole(
  q: Q,
  target: { role: string; institutionId?: string | null; regionId?: string | null },
  note: { title: string; body: string; severity: "info" | "warning" | "critical" | "success"; link: string },
): Promise<number> {
  const params: unknown[] = [target.role];
  let scope = "";
  if (target.institutionId) {
    params.push(target.institutionId);
    scope = ` AND institution_id = $${params.length}`;
  } else if (target.regionId) {
    params.push(target.regionId);
    scope = ` AND region_id = $${params.length}`;
  }
  const users = await q.query<{ id: string }>(`SELECT id FROM users WHERE role = $1${scope}`, params);
  for (const user of users.rows) {
    await q.query(
      `INSERT INTO notifications (user_id, title, body, severity, link, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, note.title, note.body, note.severity, note.link, now()],
    );
  }
  return users.rows.length;
}
