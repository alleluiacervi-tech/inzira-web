// Simple fixed-window rate limiting, stored in the database so it works across server instances.
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "./db";
import { isDemo } from "./sms";

/** The caller's IP address as reported by the host's proxy. */
export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

/** Counts one attempt for `key`. Returns false once more than `max` attempts fall in `windowMs`. */
export async function allow(key: string, max: number, windowMs: number): Promise<boolean> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const [row] = await (await db()).insert(s.rateLimits).values({ key, windowStart: now, count: 1 })
    .onConflictDoUpdate({
      target: s.rateLimits.key,
      set: {
        // A window that has ended starts again at 1; otherwise count up.
        count: sql`case when ${s.rateLimits.windowStart} < ${cutoff} then 1 else ${s.rateLimits.count} + 1 end`,
        windowStart: sql`case when ${s.rateLimits.windowStart} < ${cutoff} then ${now}::timestamptz else ${s.rateLimits.windowStart} end`,
      },
    })
    .returning({ count: s.rateLimits.count });
  return row.count <= max;
}

/** Limits per IP for the public, abuse-prone actions. */
export const LIMITS = {
  code: { max: 10, windowMs: 15 * 60e3 },      // SMS codes requested
  signIn: { max: 20, windowMs: 15 * 60e3 },    // codes tried
  track: { max: 30, windowMs: 15 * 60e3 },     // tracking look-ups
  request: { max: 10, windowMs: 60 * 60e3 },   // new requests sent
  payment: { max: 10, windowMs: 60 * 60e3 },   // payment prompts
} as const;

export async function allowIp(kind: keyof typeof LIMITS) {
  const { max, windowMs } = LIMITS[kind];
  // Demos and automated tests sign in many times from one machine.
  return allow(`${kind}:ip:${await clientIp()}`, isDemo() ? max * 10 : max, windowMs);
}
export const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
