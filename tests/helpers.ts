import { openDb, type Db } from "../src/server/db/client";
import { seedDemo } from "../src/server/db/seed";
import type { Actor, Role } from "../src/server/permissions";

/** A fresh, in-memory database loaded with the demonstration data. */
export async function freshDb(): Promise<Db> {
  const db = await openDb();
  await seedDemo(db);
  return db;
}

export async function actorOf(db: Db, id: string): Promise<Actor> {
  const res = await db.query<{ id: string; name: string; designation: string; role: Role; institution_id: string | null; region_id: string | null }>(
    "SELECT * FROM users WHERE id = $1",
    [id],
  );
  const u = res.rows[0];
  if (!u) throw new Error(`No seeded user ${id}`);
  return { id: u.id, name: u.name, designation: u.designation, role: u.role, institutionId: u.institution_id, regionId: u.region_id };
}

/** A minimal valid PDF header, used for upload tests. */
export const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% test\n%%EOF\n");
