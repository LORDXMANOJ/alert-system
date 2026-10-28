import type { Db } from "../db/client";
import type { Actor } from "../permissions";
import { now } from "../clock";

export type NotificationRow = {
  id: number;
  title: string;
  body: string;
  severity: string;
  link: string;
  created_at: Date;
  read_at: Date | null;
};

export async function listNotifications(db: Db, actor: Actor, filter: "all" | "unread" = "all"): Promise<NotificationRow[]> {
  const res = await db.query<NotificationRow>(
    `SELECT id, title, body, severity, link, created_at, read_at FROM notifications
     WHERE user_id = $1 ${filter === "unread" ? "AND read_at IS NULL" : ""}
     ORDER BY created_at DESC, id DESC LIMIT 200`,
    [actor.id],
  );
  return res.rows;
}

export async function unreadCount(db: Db, actor: Actor): Promise<number> {
  const res = await db.query<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [actor.id],
  );
  return res.rows[0]?.n ?? 0;
}

export async function markRead(db: Db, actor: Actor, id: number): Promise<void> {
  await db.query(
    "UPDATE notifications SET read_at = $3 WHERE id = $1 AND user_id = $2 AND read_at IS NULL",
    [id, actor.id, now()],
  );
}

export async function markAllRead(db: Db, actor: Actor): Promise<void> {
  await db.query("UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL", [actor.id, now()]);
}
