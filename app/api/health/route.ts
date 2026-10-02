import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/** For uptime monitors: 200 when the app can reach its database, 503 otherwise. */
export async function GET() {
  try {
    await (await db()).execute(sql`select 1`);
    return Response.json({ ok: true, database: "up" }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ ok: false, database: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
