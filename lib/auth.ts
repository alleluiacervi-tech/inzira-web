// Sign-in with a phone number and a one-time SMS code, and the session that follows.
// Codes and session tokens are stored only as SHA-256 hashes.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, iso, schema as s } from "./db";
import type { Permission } from "./permissions";
import type { Locale } from "./i18n/locale";
import { sms, smsText } from "./i18n/stored";
import { allowFor } from "./ratelimit";
import { canDeliverCodes, sendSms, showsCodeOnScreen } from "./sms";
import type { Staff } from "./types";

const COOKIE = "inzira_session";
const CODE_TTL = 10 * 60e3;
const RESEND_AFTER = 30e3;
const MAX_ATTEMPTS = 5;
const SESSION_DAYS = { customer: 30, staff: 1 } as const;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
/** Codes are six digits, so a plain hash could be reversed in moments if the table leaked. With AUTH_SECRET set they
 *  are keyed to the server instead. Without it (development, demos) the plain hash is used. */
const codeHash = (phone: string, code: string) => (process.env.AUTH_SECRET ? createHmac("sha256", process.env.AUTH_SECRET).update(`${phone}:${code}`).digest("hex") : sha(`${phone}:${code}`));
/** Nine digits after +250, or null if it is not a Rwandan mobile number. */
export const normalisePhone = (v: string) => {
  const d = v.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "");
  return /^7\d{8}$/.test(d) ? d : null;
};

// ---------------- codes ----------------
/** Texts a sign-in code: in the account's language for a customer, else in `locale`, the page's. */
export async function issueCode(phoneInput: string, locale: Locale = "rw"): Promise<{ ok: true; demoCode?: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a Rwandan mobile number, e.g. 788 123 456." };
  // Without a real SMS provider a live site cannot deliver a code, and must not hand it out on screen instead.
  if (!canDeliverCodes()) return { ok: false, error: "Sign-in codes can’t be sent right now. Please contact us." };
  const d = await db();
  const [prev] = await d.select().from(s.otpCodes).where(eq(s.otpCodes.phone, phone));
  if (prev && Date.now() - Date.parse(iso(prev.sentAt)!) < RESEND_AFTER) return { ok: false, error: "We just sent a code. Wait a few seconds before asking for another." };
  // One number cannot be texted over and over, even from many addresses.
  if (!(await allowFor("codeTo", phone))) return { ok: false, error: "We’ve sent several codes to this number. Try again in an hour." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { phone, codeHash: codeHash(phone, code), expiresAt: new Date(Date.now() + CODE_TTL).toISOString(), attempts: 0, sentAt: new Date().toISOString() };
  await d.insert(s.otpCodes).values(row).onConflictDoUpdate({ target: s.otpCodes.phone, set: row });
  try {
    // Staff get it in English, like all their SMS (staff sign-in wins when a number is both); a customer
    // in their account's language; anyone else in the language of the page they asked from.
    const [staff] = await d.select({ id: s.staff.id }).from(s.staff).where(and(eq(s.staff.phone, phone), eq(s.staff.active, true)));
    const [account] = staff ? [] : await d.select({ locale: s.accounts.locale }).from(s.accounts).where(eq(s.accounts.phone, phone));
    await sendSms(phone, smsText(staff ? "en" : account?.locale ?? locale, sms("code", { code })));
  } catch (e) {
    console.error(e);
    await d.delete(s.otpCodes).where(eq(s.otpCodes.phone, phone));
    return { ok: false, error: "We couldn’t send the SMS. Please try again in a minute." };
  }
  // In a demo without a live SMS provider the code is shown on screen. Never on a live site.
  return showsCodeOnScreen() ? { ok: true, demoCode: code } : { ok: true };
}

export async function consumeCode(phoneInput: string, code: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone || !/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the SMS." };
  const d = await db();
  // Count the attempt and read the hash in one statement, so guesses sent in parallel cannot share one count.
  const [row] = await d.update(s.otpCodes).set({ attempts: sql`${s.otpCodes.attempts} + 1` })
    .where(and(eq(s.otpCodes.phone, phone), gt(s.otpCodes.expiresAt, new Date().toISOString()), lt(s.otpCodes.attempts, MAX_ATTEMPTS)))
    .returning({ codeHash: s.otpCodes.codeHash });
  if (!row) {
    const [existing] = await d.select({ expiresAt: s.otpCodes.expiresAt }).from(s.otpCodes).where(eq(s.otpCodes.phone, phone));
    if (existing && Date.parse(iso(existing.expiresAt)!) >= Date.now()) return { ok: false, error: "Too many wrong codes. Ask for a new one." };
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }
  const a = Buffer.from(row.codeHash), b = Buffer.from(codeHash(phone, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: "That code is not right. Check the SMS and try again." };
  // A code works once: only the request that deletes the row gets in.
  const used = await d.delete(s.otpCodes).where(and(eq(s.otpCodes.phone, phone), eq(s.otpCodes.codeHash, row.codeHash))).returning({ phone: s.otpCodes.phone });
  if (!used.length) return { ok: false, error: "That code has expired. Ask for a new one." };
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

export async function requireStaff(next = "/console") {
  const me = await getStaffUser();
  if (!me) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return me;
}
export const can = (me: { permissions: Set<Permission> } | null, p: Permission) => !!me?.permissions.has(p);
