// Simple fixed-window rate limiting, stored in the database so it works across server instances.
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s, type Db } from "./db";
import { isDemo } from "./sms";

type Queryable = Pick<Db, "insert">;

let warned = false;
/**
 * The caller's IP address, taken only from a header the host sets itself, because X-Forwarded-For can be written by the caller.
 * - On Vercel: x-vercel-forwarded-for, which Vercel overwrites.
 * - Behind your own proxy: set CLIENT_IP_HEADER to the header it sets (for example x-real-ip or cf-connecting-ip).
 * - Development and demos: the first X-Forwarded-For value, or "local".
 * On a live site with none of these, every caller shares the "unknown" bucket and a log line says so: limits then
 * hold for everyone together (safe, but one abuser can lock out the rest) instead of being skipped.
 */
export async function clientIp() {
  const h = await headers();
  const named = process.env.CLIENT_IP_HEADER?.toLowerCase();
  const value = named ? h.get(named) : process.env.VERCEL ? h.get("x-vercel-forwarded-for") ?? h.get("x-real-ip") : null;
  if (value) return value.split(",")[0].trim();
  if (process.env.NODE_ENV !== "production" || isDemo()) return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
  if (!warned) { warned = true; console.error("[ratelimit] no trusted client IP header: set CLIENT_IP_HEADER (or deploy on Vercel). All callers share one limit."); }
  return "unknown";
}

/** Counts one attempt for `key`. Returns false once more than `max` attempts fall in `windowMs`.
 *  Pass the open transaction when calling from inside one: PGlite is a single connection, and a
 *  second write while a transaction is open never comes back. */
export async function allow(key: string, max: number, windowMs: number, database?: Queryable): Promise<boolean> {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const [row] = await (database ?? await db()).insert(s.rateLimits).values({ key, windowStart: now, count: 1 })
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
  code: { max: 10, windowMs: 15 * 60e3 },      // sign-in codes requested
  codeTo: { max: 5, windowMs: 60 * 60e3 },     // sign-in codes sent to one number or address
  signIn: { max: 20, windowMs: 15 * 60e3 },    // codes tried
  track: { max: 30, windowMs: 15 * 60e3 },     // tracking look-ups
  trackRef: { max: 10, windowMs: 15 * 60e3 },  // tries at one reference, from anywhere
  totp: { max: 6, windowMs: 15 * 60e3 },       // authenticator codes tried for one staff account
  unlock: { max: 6, windowMs: 15 * 60e3 },     // passwords tried to unlock one idle console
  request: { max: 10, windowMs: 60 * 60e3 },   // new requests sent
  portal: { max: 40, windowMs: 60 * 60e3 },    // documents and messages a customer adds from the portal
  payment: { max: 10, windowMs: 60 * 60e3 },   // payment prompts
  payPhone: { max: 3, windowMs: 60 * 60e3 },   // payment prompts to one phone number, from anywhere
} as const;

export async function allowIp(kind: keyof typeof LIMITS) {
  const { max, windowMs } = LIMITS[kind];
  // Demos and automated tests sign in many times from one machine.
  return allow(`${kind}:ip:${await clientIp()}`, isDemo() ? max * 10 : max, windowMs);
}
/** The same limits, counted per person (a phone number or an email address) instead of per IP address. */
export async function allowFor(kind: keyof typeof LIMITS, subject: string) {
  const { max, windowMs } = LIMITS[kind];
  return allow(`${kind}:${subject}`, isDemo() ? max * 10 : max, windowMs);
}
export const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
