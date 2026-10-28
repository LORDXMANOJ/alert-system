import path from "node:path";
import { openDb, type Db } from "./client";
import { seedDemo } from "./seed";

const globalForDb = globalThis as unknown as { __approveflowDb?: Promise<Db> };

/**
 * Process-wide database handle. The first call opens the file-backed database
 * (data/pglite, or APPROVEFLOW_DATA_DIR) and seeds demo data if it is empty.
 */
export function getDb(): Promise<Db> {
  if (!globalForDb.__approveflowDb) {
    globalForDb.__approveflowDb = (async () => {
      const dir = process.env.APPROVEFLOW_DATA_DIR ?? path.join(process.cwd(), "data", "pglite");
      const db = await openDb(dir);
      const count = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
      if ((count.rows[0]?.n ?? 0) === 0) await seedDemo(db);
      return db;
    })();
  }
  return globalForDb.__approveflowDb;
}
