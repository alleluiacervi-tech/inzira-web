// Sign-in with a phone number and a one-time code emailed to the address on the account.
// Codes and session tokens are stored only as SHA-256 hashes. The phone stays the login;
// the code is never sent by SMS.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, iso, schema as s } from "./db";
import type { Permission } from "./permissions";
import { maskEmail, normaliseEmail } from "./email";
import { codeMail, mailConfigured, sendMail } from "./mail";
import { isDemo } from "./runtime";
import type { Staff } from "./types";

const COOKIE = "inzira_session";
const CODE_TTL = 10 * 60e3;
const RESEND_AFTER = 30e3;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = { customer: 30, staff: 1 } as const;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
/** Nine digits after +250, or null if it is not a Rwandan mobile number. */
export const normalisePhone = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "");
  return /^7\d{8}$/.test(d) ? d : null;
};

// ---------------- codes ----------------
export async function issueCode(phoneInput: string, emailInput?: string): Promise<{ ok: true; demoCode?: string; sentTo?: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a Rwandan mobile number, e.g. 788 123 456." };
  const explicit = emailInput ? normaliseEmail(emailInput) : null;
  if (emailInput && !explicit) return { ok: false, error: "Enter a valid email address, e.g. you@example.com." };
  const d = await db();
  const [prev] = await d.select().from(s.otpCodes).where(eq(s.otpCodes.phone, phone));
  if (prev && Date.now() - Date.parse(iso(prev.sentAt)!) < RESEND_AFTER) return { ok: false, error: "We just sent a code. Wait a few seconds before asking for another." };
  // An address already on the account always wins, so a caller cannot redirect the code.
  const [staffRow] = await d.select({ email: s.staff.email, name: s.staff.name }).from(s.staff).where(and(eq(s.staff.phone, phone), eq(s.staff.active, true)));
  const [account] = await d.select({ email: s.accounts.email, first: s.accounts.first }).from(s.accounts).where(eq(s.accounts.phone, phone));
  const to = staffRow?.email ?? account?.email ?? explicit;
  const name = staffRow?.name.split(" ")[0] ?? account?.first ?? "there";
  if (!to && !isDemo()) return { ok: false, error: "This number has no email address yet. Start a request and add your email, and we’ll send the code there." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { phone, codeHash: sha(`${phone}:${code}`), expiresAt: new Date(Date.now() + CODE_TTL).toISOString(), attempts: 0, sentAt: new Date().toISOString() };
  await d.insert(s.otpCodes).values(row).onConflictDoUpdate({ target: s.otpCodes.phone, set: row });
  if (to) {
    try {
      await sendMail(codeMail({ to, name, code }));
    } catch (e) {
      console.error(e);
      await d.delete(s.otpCodes).where(eq(s.otpCodes.phone, phone));
      return { ok: false, error: "We couldn’t send the email. Please try again in a minute." };
    }
  }
  // Without SMTP the code is shown on screen, including on a deployed demo.
  return mailConfigured() ? { ok: true, sentTo: to ? maskEmail(to) : undefined } : { ok: true, sentTo: to ? maskEmail(to) : undefined, demoCode: code };
}

export async function consumeCode(phoneInput: string, code: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone || !/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the email." };
  const d = await db();
  const [row] = await d.select().from(s.otpCodes).where(eq(s.otpCodes.phone, phone));
  if (!row || Date.parse(iso(row.expiresAt)!) < Date.now()) return { ok: false, error: "That code has expired. Ask for a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, error: "Too many wrong codes. Ask for a new one." };
  const a = Buffer.from(row.codeHash), b = Buffer.from(sha(`${phone}:${code}`));
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await d.update(s.otpCodes).set({ attempts: row.attempts + 1 }).where(eq(s.otpCodes.phone, phone));
    return { ok: false, error: "That code is not right. Check the email and try again." };
  }
  await d.delete(s.otpCodes).where(eq(s.otpCodes.phone, phone));
  return { ok: true, phone };
}

// ---------------- sessions ----------------
export async function startSession(kind: "customer" | "staff", subjectId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS[kind] * 864e5);
  await (await db()).insert(s.sessions).values({ id: sha(token), kind, subjectId, expiresAt: expires.toISOString() });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await db()).delete(s.sessions).where(eq(s.sessions.id, sha(token)));
  jar.delete(COOKIE);
}

/** The signed-in person for this request, or null. Cached for the duration of one request. */
export const getSession = cache(async (): Promise<{ kind: "customer" | "staff"; subjectId: string } | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [row] = await (await db()).select().from(s.sessions).where(and(eq(s.sessions.id, sha(token)), gt(s.sessions.expiresAt, new Date().toISOString())));
  return row ? { kind: row.kind, subjectId: row.subjectId } : null;
});

export async function requireCustomerId(next = "/portal"): Promise<string> {
  const session = await getSession();
  if (session?.kind !== "customer") redirect(`/sign-in?next=${encodeURIComponent(next)}`);
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
