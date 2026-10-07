// Database tasks.
//   npm run db:migrate   apply migrations in ./drizzle to DATABASE_URL (or the local PGlite database)
//   npm run db:setup     production first run: fill an EMPTY database with the catalogue and one
//                        owner (OWNER_NAME and OWNER_EMAIL must be set). No sample data.
//   npm run db:seed      development: fill an EMPTY database with the catalogue and sample data
//   npm run db:reset     local PGlite only: delete .data/pglite so it is rebuilt on next start
import { rmSync } from "node:fs";
import path from "node:path";

const cmd = process.argv[2];

if (cmd === "reset") {
  if (process.env.DATABASE_URL) { console.error("db:reset only deletes the local PGlite database. Unset DATABASE_URL."); process.exit(1); }
  const dir = path.join(process.cwd(), ".data", "pglite");
  rmSync(dir, { recursive: true, force: true });
  console.log(`Deleted ${dir}. It is recreated and seeded the next time the app starts.`);
  process.exit(0);
}

const { db, schema } = await import("../lib/db/index.ts");
const { seed, setupProduction } = await import("../lib/db/seed.ts");

if (cmd === "migrate") {
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate((await db()) as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } else {
    await db(); // the local database migrates itself when opened
  }
  console.log("Migrations applied.");
} else if (cmd === "setup") {
  const name = process.env.OWNER_NAME, email = process.env.OWNER_EMAIL?.trim().toLowerCase(), phone = process.env.OWNER_PHONE;
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { console.error("Set OWNER_NAME and OWNER_EMAIL (the owner signs in with this address). OWNER_PHONE is optional."); process.exit(1); }
  const d = await db();
  const existing = await d.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing.length) { console.log("The database already has data; nothing changed."); process.exit(0); }
  await setupProduction(d, { name, email, phone });
  console.log(`Set up. ${name} can now sign in with ${email} and invite the team.`);
} else if (cmd === "seed") {
  const d = await db();
  const existing = await d.select({ id: schema.categories.id }).from(schema.categories).limit(1);
  if (existing.length) { console.log("The database already has data; nothing seeded."); process.exit(0); }
  await seed(d);
  console.log("Seeded.");
} else {
  console.error("Usage: tsx scripts/db.mts migrate | setup | seed | reset");
  process.exit(1);
}
process.exit(0);
