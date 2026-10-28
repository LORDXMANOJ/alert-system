import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "./migrations";
import { setClockOffsetDays } from "../clock";

export type Db = PGlite;

/** Opens a PGlite database (file-backed when `dataDir` is given, in-memory otherwise) and migrates it. */
export async function openDb(dataDir?: string): Promise<Db> {
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await migrate(db);
  await loadClockSetting(db);
  return db;
}

export async function migrate(db: Db): Promise<void> {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());",
  );
  const applied = await db.query<{ version: number }>("SELECT version FROM schema_migrations");
  const done = new Set(applied.rows.map((r) => r.version));
  for (const migration of MIGRATIONS) {
    if (done.has(migration.version)) continue;
    await db.transaction(async (tx) => {
      await tx.exec(migration.sql);
      await tx.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [
        migration.version,
        migration.name,
      ]);
    });
  }
}

/** Restores the demo clock offset from storage (set by Demo Control). */
export async function loadClockSetting(db: Db): Promise<void> {
  const hasTable = await db.query<{ exists: boolean }>(
    "SELECT to_regclass('system_settings') IS NOT NULL AS exists",
  );
  if (!hasTable.rows[0]?.exists) return;
  const row = await db.query<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'clock_offset_days'",
  );
  setClockOffsetDays(Number(row.rows[0]?.value ?? 0));
}

/** Drops every table and function. Used by db:reset and Demo Control. */
export async function dropEverything(db: Db): Promise<void> {
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
}
