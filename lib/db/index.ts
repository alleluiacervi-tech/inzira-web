// Database connection.
// - DATABASE_URL set (production, staging): a normal Postgres server through node-postgres.
//   Pending migrations in drizzle/ are applied on startup. Set DB_AUTO_MIGRATE=0 to skip that
//   and run `npm run db:migrate` yourself. DATABASE_URL_UNPOOLED, when set, is the direct (not pooled)
//   address used for that step: a pooler can leave the startup lock held on one of its connections.
// - DATABASE_URL not set (development, demos): PGlite, a full Postgres compiled to WebAssembly,
//   stored in .data/pglite (in memory on Vercel). It is migrated and filled with the seed data
//   automatically the first time the app touches it.
// Only import this from server code.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Client, Pool } from "pg";
import * as schema from "./schema";
import { alignSchema, latestMigration } from "./align";
import { pgCode } from "./errors";
import { protectIdentity } from "./protect";
import { ensureCatalogue, ensureDemoSignIns, linkSampleSignIns, seed } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

/** Any fixed number; every Inzira server asks for the same one. */
const MIGRATION_LOCK = 727_274_001;
/** How long a starting server waits for another one to finish migrating before it serves without migrating. */
const LOCK_WAIT_MS = 15_000;
const migrationsFolder = path.join(process.cwd(), "drizzle");
const g = globalThis as unknown as { __inziraDb?: Promise<Db> };

/** The shared database handle. Opened once per server process. */
export function db(): Promise<Db> {
  g.__inziraDb ??= open().catch((e) => { g.__inziraDb = undefined; throw e; });
  return g.__inziraDb;
}

async function open(): Promise<Db> {
  // A production build needs real Postgres; only demo builds (INZIRA_DEMO=1) may use PGlite.
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL && process.env.INZIRA_DEMO !== "1") {
    throw new Error("DATABASE_URL must point to a persistent Postgres database in production.");
  }
  if (process.env.DATABASE_URL) {
    // A connection that cannot be had in 10 seconds is an error, not a page that loads for ever.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 5), connectionTimeoutMillis: 10_000 });
    const d = drizzlePg(pool, { schema }) as unknown as Db;
    // Most starts have nothing to migrate and never touch the lock, so a lock someone else holds cannot stop them.
    if (await migrationsPending(pool)) await migrateOnce();
    // Each of these is safe to run on several servers at once.
    await ensureCatalogue(d);
    await ensureDemoSignIns(d);
    await linkSampleSignIns(d);
    await protectIdentity(d);
    return d;
  }
  const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "memory://" : path.join(process.cwd(), ".data", "pglite"));
  if (!dir.includes("://")) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const d = drizzlePglite(client, { schema }) as unknown as Db;
  await alignSchema(d, () => migratePglite(d as never, { migrationsFolder }));
  const empty = (await d.select({ id: schema.categories.id }).from(schema.categories).limit(1)).length === 0;
  if (empty && process.env.DB_AUTO_SEED !== "0") await seed(d);
  await ensureCatalogue(d);
  await ensureDemoSignIns(d);
  await linkSampleSignIns(d);
  await protectIdentity(d);
  return d;
}

/** True when drizzle/ has a migration the database has not recorded. Read the same way drizzle's migrator decides. */
async function migrationsPending(q: Pool | Client): Promise<boolean> {
  if (process.env.DB_AUTO_MIGRATE === "0") return false;
  try {
    const { rows } = await q.query<{ at: string | null }>("select max(created_at)::text as at from drizzle.__drizzle_migrations");
    return Number(rows[0]?.at ?? 0) < latestMigration();
  } catch (e) {
    if (pgCode(e) === "42P01" || pgCode(e) === "3F000") return true; // no history yet: a new database
    throw e;
  }
}

/** One server at a time brings the schema up to date, on a direct connection of its own so the lock is released by
 *  the session that took it. It waits a bounded time: a server that cannot get the lock (another is migrating, or a
 *  lock was left behind) serves without migrating, and any table lock a migration waits on gives up after 10 seconds
 *  instead of queueing every reader of that table behind it. */
async function migrateOnce() {
  const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let locked = false;
  try {
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!locked) {
      locked = (await client.query<{ ok: boolean }>("select pg_try_advisory_lock($1) as ok", [MIGRATION_LOCK])).rows[0]?.ok === true;
      if (locked) break;
      if (Date.now() > deadline) {
        console.error(`[db] another session holds the migration lock (${MIGRATION_LOCK}); starting without migrating`);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!(await migrationsPending(client))) return; // the server that held the lock did it
    await client.query("set lock_timeout = '10s'");
    const direct = drizzlePg(client, { schema }) as unknown as Db;
    try {
      await alignSchema(direct, () => migratePg(direct as never, { migrationsFolder }));
    } catch (e) {
      if (pgCode(e) !== "55P03") throw e;
      console.error("[db] a migration waited too long for a table lock; starting without it, the next start retries", e);
    }
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    await client.end().catch(() => {});
  }
}

/** Postgres timestamps come back as "2026-09-30 08:05:00+00"; screens expect ISO 8601. */
export const iso = (v: string | null | undefined): string | undefined => {
  if (!v) return undefined;
  if (v.includes("T")) return v;
  return new Date(v.replace(" ", "T") + (/[+-]\d\d$/.test(v) ? ":00" : "")).toISOString();
};
