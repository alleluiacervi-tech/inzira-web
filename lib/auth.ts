// Sign-in with an email address and a one-time code, and the session that follows.
// Codes and session tokens are stored only as SHA-256 hashes. A session can also be opened by a
// private link (lib/access.ts); that session is limited to one request (`scopeRef`).
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { normaliseEmail } from "./contact";
import { db, iso, schema as s } from "./db";
import { sendsRealEmail, sendEmail } from "./email";
import { signInCodeMail } from "./mail";
import type { Permission } from "./permissions";
import { TOO_MANY, allow } from "./ratelimit";
import { getLocale } from "./i18n/locale";
import type { Staff } from "./types";

const COOKIE = "inzira_session";
const CODE_TTL = 10 * 60e3;
const RESEND_AFTER = 30e3;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = { customer: 30, staff: 1 } as const;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

// ---------------- codes ----------------
/**
 * Emails a sign-in code. Only addresses that belong to an account or to staff get one, but the answer
 * is the same either way, so the form cannot be used to find out who has an account (or to send mail
 * to strangers).
 */
export async function issueCode(emailInput: string): Promise<{ ok: true; demoCode?: string } | { ok: false; error: string }> {
  const email = normaliseEmail(emailInput);
  if (!email) return { ok: false, error: "Enter a valid email address, e.g. name@example.com." };
  if (!(await allow(`code:email:${email}`, 5, 60 * 60e3))) return { ok: false, error: TOO_MANY };
  const d = await db();
  const [staffRow] = await d.select({ id: s.staff.id }).from(s.staff).where(and(eq(s.staff.email, email), eq(s.staff.active, true)));
  const [account] = staffRow ? [] : await d.select({ id: s.accounts.id, locale: s.accounts.locale }).from(s.accounts).where(eq(s.accounts.email, email));
  if (!staffRow && !account) return { ok: true };
  const [prev] = await d.select().from(s.otpCodes).where(eq(s.otpCodes.email, email));
  if (prev && Date.now() - Date.parse(iso(prev.sentAt)!) < RESEND_AFTER) return { ok: false, error: "We just sent a code. Wait a few seconds before asking for another." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { email, codeHash: sha(`${email}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL).toISOString(), attempts: 0, sentAt: new Date().toISOString() };
  await d.insert(s.otpCodes).values(row).onConflictDoUpdate({ target: s.otpCodes.email, set: row });
  try {
    await sendEmail(signInCodeMail(email, code, staffRow ? "en" : account?.locale ?? (await getLocale())));
  } catch (e) {
    console.error("[email]", e);
    await d.delete(s.otpCodes).where(eq(s.otpCodes.email, email));
    return { ok: false, error: "We couldn’t send the email. Please try again in a minute." };
  }
  // Without a live email provider the code is shown on screen, including on a deployed demo.
  return sendsRealEmail() ? { ok: true } : { ok: true, demoCode: code };
}

export async function consumeCode(emailInput: string, code: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = normaliseEmail(emailInput);
  if (!email || !/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the email." };
  const d = await db();
  const now = new Date().toISOString();
  // Count the attempt first, in one statement, so parallel guesses can't beat the limit.
  const [row] = await d.update(s.otpCodes).set({ attempts: sql`${s.otpCodes.attempts} + 1` })
    .where(and(eq(s.otpCodes.email, email), gt(s.otpCodes.expiresAt, now), lt(s.otpCodes.attempts, MAX_ATTEMPTS))).returning();
  if (!row) {
    const [any] = await d.select().from(s.otpCodes).where(eq(s.otpCodes.email, email));
    if (any && Date.parse(iso(any.expiresAt)!) > Date.now()) return { ok: false, error: "Too many wrong codes. Ask for a new one." };
    return { ok: false, error: "That code has expired or isn’t valid. Ask for a new one." };
  }
  const a = Buffer.from(row.codeHash), b = Buffer.from(sha(`${email}:${code}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "That code is not right. Check the email and try again." };
  // A code works once, even if two requests arrive together.
  const used = await d.delete(s.otpCodes).where(and(eq(s.otpCodes.email, email), eq(s.otpCodes.codeHash, row.codeHash))).returning({ email: s.otpCodes.email });
  return used.length ? { ok: true, email } : { ok: false, error: "That code has expired or isn’t valid. Ask for a new one." };
}

// ---------------- sessions ----------------
export async function startSession(kind: "customer" | "staff", subjectId: string, scopeRef?: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS[kind] * 864e5);
  await (await db()).insert(s.sessions).values({ id: sha(token), kind, subjectId, scopeRef: scopeRef ?? null, expiresAt: expires.toISOString() });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

/** Opens a session limited to one request, for someone arriving with its private link. A member of staff or a full sign-in for the same account stays as it is. */
export async function enterRequest(accountId: string, ref: string): Promise<"staff" | "customer"> {
  const session = await getSession();
  if (session?.kind === "staff") return "staff";
  if (session?.kind === "customer" && !session.scopeRef && session.subjectId === accountId) return "customer";
  await startSession("customer", accountId, ref);
  return "customer";
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await db()).delete(s.sessions).where(eq(s.sessions.id, sha(token)));
  jar.delete(COOKIE);
}

/** The signed-in person for this request, or null. Cached for the duration of one request. */
export const getSession = cache(async (): Promise<{ kind: "customer" | "staff"; subjectId: string; scopeRef: string | null } | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await (await db()).select().from(s.sessions).where(and(eq(s.sessions.id, sha(token)), gt(s.sessions.expiresAt, new Date().toISOString())));
  return row ? { kind: row.kind, subjectId: row.subjectId, scopeRef: row.scopeRef } : null;
});

/** The one request a private-link session is limited to, or null for a full sign-in. */
export const customerScope = async () => (await getSession())?.scopeRef ?? null;

export async function requireCustomerId(next = "/portal"): Promise<string> {
  const session = await getSession();
  if (session?.kind !== "customer") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session.subjectId;
}

/** Like requireCustomerId, but for pages and actions about the whole account: a private-link session is sent to sign in. */
export async function requireFullCustomer(next = "/portal"): Promise<string> {
  const session = await getSession();
  if (session?.kind !== "customer" || session.scopeRef) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return session.subjectId;
}

export const getStaffUser = cache(async (): Promise<(Staff & { permissions: Set<Permission> }) | null> => {
  const session = await getSession();
  if (session?.kind !== "staff") return null;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, session.subjectId), eq(s.staff.active, true)));
  if (!person) return null;
  const rows = await d.select().from(s.rolePermissions).where(and(eq(s.rolePermissions.role, person.role), eq(s.rolePermissions.allowed, true)));
  // The owner can always do everything, whatever the matrix says.
  const all = person.role === "Owner";
  const permissions = new Set<Permission>(all ? (await d.select().from(s.rolePermissions)).map((r) => r.permission as Permission) : rows.map((r) => r.permission as Permission));
  return { id: person.id, name: person.name, role: person.role, team: person.team, title: person.title, active: person.active, permissions };
});

export async function requireStaff(next = "/agent") {
  const me = await getStaffUser();
  if (!me) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return me;
}
export const can = (me: { permissions: Set<Permission> } | null, p: Permission) => !!me?.permissions.has(p);
