import type { Db } from "../db/client";
import { dropEverything, migrate } from "../db/client";
import { seedDemo } from "../db/seed";
import { fail } from "../errors";
import { assertCan, ROLES, type Actor, type Role } from "../permissions";
import { audit } from "../audit";
import { setClockOffsetDays } from "../clock";

export async function setUserRole(db: Db, actor: Actor, userId: string, role: string): Promise<void> {
  assertCan(actor, "admin.manage");
  if (userId === actor.id) fail("FORBIDDEN", "You cannot change your own role.");
  if (!ROLES.includes(role as Role)) fail("INVALID_INPUT", "Unknown role.");
  if (role === "institution" || role === "regional") {
    fail("INVALID_INPUT", "Institution and regional roles need a scope, so they are set in the seed data.");
  }
  await db.transaction(async (tx) => {
    const res = await tx.query<{ name: string; role: string }>("SELECT name, role FROM users WHERE id = $1", [userId]);
    const target = res.rows[0];
    if (!target) fail("NOT_FOUND", "User not found.");
    if (target.role === "institution" || target.role === "regional") {
      fail("INVALID_INPUT", "Scoped users (institution or regional) cannot be reassigned here.");
    }
    await tx.query("UPDATE users SET role = $2 WHERE id = $1", [userId, role]);
    await audit(tx, actor, "user.role_changed", "user", userId, { from: target.role, to: role });
  });
}

export async function setRuleEnabled(db: Db, actor: Actor, ruleId: string, enabled: boolean): Promise<void> {
  assertCan(actor, "admin.manage");
  await db.transaction(async (tx) => {
    const res = await tx.query("UPDATE alert_rules SET enabled = $2 WHERE id = $1", [ruleId, enabled]);
    if (res.affectedRows === 0) fail("NOT_FOUND", "Rule not found.");
    await audit(tx, actor, "alert_rule.toggled", "alert_rule", ruleId, { enabled });
  });
}

export async function shiftClock(db: Db, actor: Actor, days: number): Promise<void> {
  assertCan(actor, "demo.control");
  if (!Number.isInteger(days) || Math.abs(days) > 365) fail("INVALID_INPUT", "Shift by a whole number of days (max 365).");
  const current = Number(
    (await db.query<{ value: string }>("SELECT value FROM system_settings WHERE key = 'clock_offset_days'")).rows[0]?.value ?? 0,
  );
  const next = current + days;
  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO system_settings (key, value) VALUES ('clock_offset_days', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(next)],
    );
    await audit(tx, actor, "demo.clock_shifted", "system", null, { by: days, offsetDays: next });
  });
  setClockOffsetDays(next);
}

/** Drops all demo data and seeds it again. The demo clock returns to the real date. */
export async function resetDemo(db: Db, actor: Actor): Promise<void> {
  assertCan(actor, "demo.control");
  await dropEverything(db);
  await migrate(db);
  setClockOffsetDays(0);
  await seedDemo(db);
}
