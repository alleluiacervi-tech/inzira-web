// Brings an existing Postgres database up to the schema in drizzle/.
// Production on Vercel has no separate release command, so a deploy that adds a column
// would otherwise crash every screen that reads it until someone runs `npm run db:migrate`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "./index";

const migrationsFolder = path.join(process.cwd(), "drizzle");

/** Postgres error code from a drizzle-wrapped failure, if it has one. */
function pgCode(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur && typeof cur === "object"; i++) {
    const c = cur as { code?: unknown; cause?: unknown };
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c.code;
    cur = c.cause;
  }
  return undefined;
}

/** Columns and tables added after the first release. Safe to run more than once. */
async function addLaterObjects(database: Db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "rate_limits" (
      "key" text PRIMARY KEY NOT NULL,
      "window_start" timestamp with time zone NOT NULL,
      "count" integer NOT NULL
    )`,
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "tin_masked" text`,
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "tin" text`,
    `CREATE TABLE IF NOT EXISTS "client_tags" (
      "id" serial PRIMARY KEY NOT NULL,
      "profile_id" text NOT NULL REFERENCES "profiles"("id"),
      "tag" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "client_notes" (
      "id" serial PRIMARY KEY NOT NULL,
      "profile_id" text NOT NULL REFERENCES "profiles"("id"),
      "at" timestamp with time zone DEFAULT now() NOT NULL,
      "by" text NOT NULL,
      "body" text NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "saved_views" (
      "id" text PRIMARY KEY NOT NULL,
      "entity" text NOT NULL,
      "name" text NOT NULL,
      "filters" jsonb NOT NULL,
      "columns" jsonb,
      "sort" jsonb,
      "is_default" boolean DEFAULT false NOT NULL,
      "staff_id" text REFERENCES "staff"("id"),
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS "stage_targets" (
      "stage" text PRIMARY KEY NOT NULL,
      "target_hours" integer NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "client_tags_profile_idx" ON "client_tags" USING btree ("profile_id")`,
    `CREATE INDEX IF NOT EXISTS "client_notes_profile_idx" ON "client_notes" USING btree ("profile_id")`,
    `CREATE TABLE IF NOT EXISTS "job_runs" (
      "id" serial PRIMARY KEY NOT NULL,
      "at" timestamp with time zone DEFAULT now() NOT NULL,
      "ok" boolean NOT NULL,
      "result" jsonb NOT NULL,
      "ms" integer NOT NULL
    )`,
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone`,
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "email" text`,
    `ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "email" text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_idx" ON "accounts" USING btree ("email")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "staff_email_idx" ON "staff" USING btree ("email")`,
  ];
  for (const statement of statements) await database.execute(sql.raw(statement));
}

/** Records the bundled migrations as applied so the next boot does not try to create existing tables. */
async function stampMigrationHistory(database: Db) {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8")) as { entries: { when: number }[] };
  const latest = Math.max(...journal.entries.map((e) => e.when));
  await database.execute(sql`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await database.execute(sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  await database.execute(sql`
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
    SELECT 'aligned', ${latest}
    WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at >= ${latest})
  `);
}

/**
 * Runs pending drizzle migrations. If the database was created before that history
 * existed, creating the first tables fails with "already exists"; the missing
 * columns are added directly instead.
 */
export async function alignSchema(database: Db, migrate: () => Promise<void>) {
  if (process.env.DB_AUTO_MIGRATE === "0") return;
  try {
    await migrate();
  } catch (err) {
    const code = pgCode(err);
    // 42P07 relation already exists, 42701 duplicate column.
    if (code !== "42P07" && code !== "42701") throw err;
    console.error("[db] migration history does not match the existing tables; adding the missing columns");
    await addLaterObjects(database);
    await stampMigrationHistory(database);
  }
}
