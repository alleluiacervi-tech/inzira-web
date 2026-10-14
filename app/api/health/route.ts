import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Monitors poll this often and anyone can reach it, so the answer is reused for a few seconds instead of
// querying the database on every call.
let last: { at: number; ok: boolean } | null = null;
const KEEP_MS = 5_000;
const headers = { "Cache-Control": "no-store" };

/** For uptime monitors: 200 when the app can reach its database, 503 otherwise. */
export async function GET() {
  if (!last || Date.now() - last.at > KEEP_MS) {
    try {
      await (await db()).execute(sql`select 1`);
      last = { at: Date.now(), ok: true };
    } catch (e) {
      console.error("[health]", e);
      last = { at: Date.now(), ok: false };
    }
  }
  return last.ok
    ? Response.json({ ok: true, database: "up" }, { headers })
    : Response.json({ ok: false, database: "down" }, { status: 503, headers });
}
