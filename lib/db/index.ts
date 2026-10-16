// Database connection.
// - DATABASE_URL set (production, staging): a normal Postgres server through node-postgres.
//   Pending migrations in drizzle/ are applied on startup. Set DB_AUTO_MIGRATE=0 to skip that
//   and run `npm run db:migrate` yourself.
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
import { Pool } from "pg";
import * as schema from "./schema";
import { alignSchema } from "./align";
import { protectIdentity } from "./protect";
import { ensureDemoSignIns, linkSampleSignIns, seed } from "./seed";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

/** Any fixed number; every Inzira server asks for the same one. */
const MIGRATION_LOCK = 727_274_001;
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
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX ?? 5) });
    const d = drizzlePg(pool, { schema }) as unknown as Db;
    // When several servers start together (a scale-out, a deploy), one at a time brings the schema up to date; the others
    // wait on this lock, then find nothing left to do.
    const lock = await pool.connect();
    try {
      await lock.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
      await alignSchema(d, () => migratePg(d as never, { migrationsFolder }));
      await ensureDemoSignIns(d);
      await linkSampleSignIns(d);
      await protectIdentity(d);
    } finally {
      await lock.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
      lock.release();
    }
    return d;
  }
  const dir = process.env.PGLITE_DIR ?? (process.env.VERCEL ? "memory://" : path.join(process.cwd(), ".data", "pglite"));
  if (!dir.includes("://")) mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const d = drizzlePglite(client, { schema }) as unknown as Db;
  await alignSchema(d, () => migratePglite(d as never, { migrationsFolder }));
  const empty = (await d.select({ id: schema.categories.id }).from(schema.categories).limit(1)).length === 0;
  if (empty && process.env.DB_AUTO_SEED !== "0") await seed(d);
  await ensureDemoSignIns(d);
  await linkSampleSignIns(d);
  await protectIdentity(d);
  return d;
}

/** Postgres timestamps come back as "2026-09-30 08:05:00+00"; screens expect ISO 8601. */
export const iso = (v: string | null | undefined): string | undefined => {
  if (!v) return undefined;
  if (v.includes("T")) return v;
  return new Date(v.replace(" ", "T") + (/[+-]\d\d$/.test(v) ? ":00" : "")).toISOString();
};
