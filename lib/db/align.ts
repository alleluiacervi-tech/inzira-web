// Brings an existing Postgres database up to the schema in drizzle/.
// Production on Vercel has no separate release command, so a deploy that adds a column
// would otherwise crash every screen that reads it until someone runs `npm run db:migrate`.
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { pgCode } from "./errors";
import type { Db } from "./index";

const migrationsFolder = path.join(process.cwd(), "drizzle");

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
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "locale" text DEFAULT 'rw' NOT NULL`,
    `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "key" text`,
    `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "vars" jsonb`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "key" text`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "vars" jsonb`,
    `CREATE TABLE IF NOT EXISTS "email_codes" (
      "email" text PRIMARY KEY NOT NULL,
      "code_hash" text NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "attempts" integer DEFAULT 0 NOT NULL,
      "sent_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `ALTER TABLE "accounts" ALTER COLUMN "phone" DROP NOT NULL`,
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "email" text`,
    `ALTER TABLE "accounts" ADD COLUMN IF NOT EXISTS "registered_at" timestamp with time zone`,
    `UPDATE "accounts" SET "registered_at" = "since" WHERE "registered_at" IS NULL AND "deleted_at" IS NULL`,
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "date_of_birth" text`,
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "id_checked_at" timestamp with time zone`,
    `ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "id_checked_by" text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "accounts_email_unique" ON "accounts" USING btree (lower("email"))`,
    `CREATE TABLE IF NOT EXISTS "outbox" (
      "id" serial PRIMARY KEY NOT NULL,
      "channel" text NOT NULL,
      "recipient" text NOT NULL,
      "payload" jsonb NOT NULL,
      "ref" text,
      "status" text DEFAULT 'pending' NOT NULL,
      "attempts" integer DEFAULT 0 NOT NULL,
      "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
      "last_error" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "sent_at" timestamp with time zone
    )`,
    `ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "totp_secret" text`,
    `ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone`,
    `ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "totp_last_step" integer`,
    `ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "totp_recovery" jsonb`,
    `CREATE INDEX IF NOT EXISTS "outbox_due_idx" ON "outbox" USING btree ("status","next_attempt_at")`,
    `CREATE INDEX IF NOT EXISTS "outbox_recipient_idx" ON "outbox" USING btree ("recipient")`,
    `CREATE INDEX IF NOT EXISTS "audit_at_idx" ON "audit" USING btree ("at")`,
    `CREATE INDEX IF NOT EXISTS "deliverables_ref_idx" ON "deliverables" USING btree ("ref")`,
    `CREATE INDEX IF NOT EXISTS "files_ref_idx" ON "files" USING btree ("ref")`,
    `CREATE INDEX IF NOT EXISTS "notes_ref_idx" ON "notes" USING btree ("ref")`,
    `CREATE INDEX IF NOT EXISTS "sessions_subject_idx" ON "sessions" USING btree ("subject_id")`,
    `CREATE INDEX IF NOT EXISTS "sessions_expires_idx" ON "sessions" USING btree ("expires_at")`,
    `CREATE INDEX IF NOT EXISTS "transactions_provider_ref_idx" ON "transactions" USING btree ("provider_ref" text_pattern_ops)`,
    `UPDATE "transactions" t SET "status" = 'failed' WHERE t."status" = 'pending' AND EXISTS (SELECT 1 FROM "transactions" n WHERE n."ref" = t."ref" AND n."status" = 'pending' AND n."id" > t."id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "transactions_one_pending" ON "transactions" USING btree ("ref") WHERE "status" = 'pending'`,
    `ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "id_policy" text`,
    `UPDATE "services" SET "id_policy" = CASE "slug"
      WHEN 'e-title' THEN 'required'
      WHEN 'land-spouse-update' THEN 'required'
      WHEN 'land-merging' THEN 'required'
      WHEN 'property-tax-tin' THEN 'required'
      WHEN 'irembo-training' THEN 'none'
      WHEN 'ebm-training' THEN 'none'
      ELSE CASE WHEN "no_id" THEN 'none' ELSE 'unsure' END
    END
    WHERE "id_policy" IS NULL`,
    `ALTER TABLE "services" ALTER COLUMN "id_policy" SET DEFAULT 'unsure'`,
    `UPDATE "services" SET "id_policy" = 'unsure' WHERE "id_policy" IS NULL`,
    `ALTER TABLE "services" ALTER COLUMN "id_policy" SET NOT NULL`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_policy" text`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_required" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review" text`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_note" text`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_at" timestamp with time zone`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_by" text`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_consent" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "requirements_snapshot" jsonb`,
    `UPDATE "requests" AS r
    SET "id_required" = (NOT s."no_id" AND p."kind" = 'person'),
        "id_policy" = CASE WHEN s."no_id" THEN 'none' ELSE 'required' END,
        "id_review" = CASE WHEN NOT s."no_id" AND p."kind" = 'person' AND r."closed" IS NULL AND r."stage" <> 'completed' THEN 'pending' ELSE NULL END,
        "requirements_snapshot" = s."requirements"
    FROM "services" AS s, "profiles" AS p
    WHERE r."service_slug" = s."slug" AND r."profile_id" = p."id" AND r."id_policy" IS NULL`,
    `ALTER TABLE "requests" ALTER COLUMN "id_policy" SET DEFAULT 'none'`,
    `UPDATE "requests" SET "id_policy" = 'none' WHERE "id_policy" IS NULL`,
    `ALTER TABLE "requests" ALTER COLUMN "id_policy" SET NOT NULL`,
    `CREATE INDEX IF NOT EXISTS "requests_id_review_idx" ON "requests" USING btree ("id_review")`,
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
