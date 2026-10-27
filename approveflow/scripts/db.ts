/* Database maintenance: `tsx scripts/db.ts migrate | seed | reset` */
import path from "node:path";
import { dropEverything, migrate, openDb } from "../src/server/db/client";
import { seedDemo } from "../src/server/db/seed";

const command = process.argv[2];
const dir = process.env.APPROVEFLOW_DATA_DIR ?? path.join(process.cwd(), "data", "pglite");

async function main() {
  if (command === "migrate") {
    const db = await openDb(dir);
    console.log(`Migrations are up to date in ${dir}.`);
    await db.close();
    return;
  }
  if (command === "seed") {
    const db = await openDb(dir);
    const count = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
    if ((count.rows[0]?.n ?? 0) > 0) {
      console.log("Demo data already exists. Run `npm run db:reset` to start again.");
    } else {
      await seedDemo(db);
      console.log("Demo data loaded (all records are fictional).");
    }
    await db.close();
    return;
  }
  if (command === "reset") {
    const db = await openDb(dir);
    await dropEverything(db);
    await migrate(db);
    await seedDemo(db);
    console.log(`Demo data reset in ${dir}.`);
    await db.close();
    return;
  }
  console.error("Usage: tsx scripts/db.ts migrate | seed | reset");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
