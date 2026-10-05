import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { alignSchema } from "../lib/db/align";
import * as schema from "../lib/db/schema";

async function runFile(client: PGlite, name: string) {
  const text = readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
  for (const stmt of text.split("--> statement-breakpoint")) {
    const q = stmt.trim();
    if (q) await client.exec(q);
  }
}

async function selects(d: ReturnType<typeof drizzle>) {
  await d.select().from(schema.accounts);
  await d.select().from(schema.profiles);
  await d.select().from(schema.clientTags);
  await d.select().from(schema.jobRuns);
  await d.select().from(schema.rateLimits);
}

const folder = new URL("../drizzle", import.meta.url).pathname;

// Case 1: tables exist from the first release, but drizzle has no record of them.
{
  const client = new PGlite();
  await runFile(client, "0000_init.sql");
  await runFile(client, "0001_rate_limits.sql");
  const d = drizzle(client, { schema });
  let before = "";
  try { await d.select().from(schema.accounts); } catch (e) { before = (e as Error).message.split("\n")[0]; }
  if (!before.includes("deleted_at")) throw new Error("expected the old schema to reject deleted_at, got: " + before);
  await alignSchema(d as never, () => migrate(d as never, { migrationsFolder: folder }));
  await selects(d);
  await alignSchema(d as never, () => migrate(d as never, { migrationsFolder: folder }));
  await selects(d);
  console.log("case 1: old tables without migration history now match the app");
}

// Case 2: drizzle recorded the first two migrations, so only the later ones should run.
{
  delete process.env.DB_AUTO_MIGRATE;
  const client = new PGlite();
  await runFile(client, "0000_init.sql");
  await runFile(client, "0001_rate_limits.sql");
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")) as { entries: { when: number; tag: string }[] };
  const applied = journal.entries.filter((e) => e.tag.startsWith("0000") || e.tag.startsWith("0001"));
  await client.exec(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.exec(`CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
  for (const e of applied) await client.exec(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${e.tag}', ${e.when})`);
  const d = drizzle(client, { schema });
  await alignSchema(d as never, () => migrate(d as never, { migrationsFolder: folder }));
  await selects(d);
  const rows = await client.query<{ created_at: string }>(`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`);
  console.log("case 2: pending migrations applied, history", rows.rows.map((r) => r.created_at).join(","));
}

// Case 3: an explicit opt-out leaves the old schema alone.
{
  process.env.DB_AUTO_MIGRATE = "0";
  const client = new PGlite();
  await runFile(client, "0000_init.sql");
  const d = drizzle(client, { schema });
  await alignSchema(d as never, () => migrate(d as never, { migrationsFolder: folder }));
  let failed = false;
  try { await d.select().from(schema.accounts); } catch { failed = true; }
  if (!failed) throw new Error("DB_AUTO_MIGRATE=0 should not add deleted_at");
  delete process.env.DB_AUTO_MIGRATE;
  console.log("case 3: DB_AUTO_MIGRATE=0 skips the update");
}

console.log("align-check ok");
