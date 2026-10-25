// One-time links for staff to set a password: an invite (48 hours) or a reset (1 hour). The secret sits after "#" in
// the link, so it never reaches a server log; only its SHA-256 is stored. Server only.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema as s } from "./db";
import { SITE } from "./site";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const HOURS = { invite: 48, reset: 1 } as const;

export async function issueStaffToken(staffId: string, kind: "invite" | "reset"): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await (await db()).insert(s.staffTokens).values({ id: sha(token), staffId, kind, expiresAt: new Date(Date.now() + HOURS[kind] * 36e5).toISOString() });
  return token;
}

export function staffTokenUrl(token: string): string {
  const origin = SITE.url.startsWith("http") ? SITE.url.replace(/\/$/, "") : "";
  return `${origin}/staff/set-password#k=${token}`;
}

/** The staff member a link is for, while it is unused and in date. */
export async function readStaffToken(token: string): Promise<{ staffId: string; kind: "invite" | "reset" } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await (await db()).select().from(s.staffTokens)
    .where(and(eq(s.staffTokens.id, sha(token)), isNull(s.staffTokens.usedAt), gt(s.staffTokens.expiresAt, new Date().toISOString())));
  return row ? { staffId: row.staffId, kind: row.kind } : null;
}

/** Uses a link once. False when another tab used it first. */
export async function spendStaffToken(token: string): Promise<boolean> {
  const used = await (await db()).update(s.staffTokens).set({ usedAt: new Date().toISOString() })
    .where(and(eq(s.staffTokens.id, sha(token)), isNull(s.staffTokens.usedAt))).returning({ id: s.staffTokens.id });
  return used.length > 0;
}
