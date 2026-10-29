// Sign-in with a phone number and a one-time SMS code, and the session that follows.
// Codes and session tokens are stored only as SHA-256 hashes.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, iso, schema as s } from "./db";
import type { Permission } from "./permissions";
import type { Locale } from "./i18n/locale";
import { sms, smsText } from "./i18n/stored";
import { canDeliverEmailCodes, sendEmail, showsEmailCodeOnScreen } from "./email";
import { text } from "./i18n/messages";
import { allowFor } from "./ratelimit";
import { canDeliverCodes, sendSms, showsCodeOnScreen } from "./sms";
import { safeReturnPath } from "./return-path";
import type { Staff } from "./types";

const COOKIE = "inzira_session";
const CODE_TTL = 10 * 60e3;
const RESEND_AFTER = 30e3;
const MAX_ATTEMPTS = 5;
/** A customer's session ends after `idle` without use, and never lasts longer than `cap` from sign-in. A month of idle
 *  and a quarter in all: a customer on their own phone signs in with a code a few times a year, not every week. */
const SESSION = { customer: { idle: 30 * 864e5, cap: 90 * 864e5 } } as const;
/** Staff: 30 days on a device they chose to trust, 12 hours otherwise. After a while without use the console locks and
 *  asks for the password only (NIST SP 800-63B allows that inside a longer session): an hour on a device that is not
 *  trusted, a working day on one that is. The authenticator code is asked on a new device, on one not used for 30 days,
 *  and before refunds, payouts, roles and ID numbers, once per session. */
const STAFF_CAP = { trusted: 30 * 864e5, plain: 12 * 36e5 } as const;
export const STAFF_IDLE_LOCK = 60 * 60e3;
export const STAFF_IDLE_LOCK_TRUSTED = 10 * 36e5;
/** How long a device that gave an authenticator code is known: password alone there until then. */
export const DEVICE_VERIFIED_FOR = 30 * 864e5;
/** How long an authenticator code stays good: as long as the session it was given in. */
export const stepUpWindow = (trusted: boolean) => (trusted ? STAFF_CAP.trusted : STAFF_CAP.plain);
const DEVICE_COOKIE = "inzira_dev";
const MAX_SESSIONS = 10;

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
/** One live code per phone number or email address. The two tables have the same shape. */
type CodeStore = { table: typeof s.otpCodes; key: typeof s.otpCodes.phone };
const PHONE_CODES: CodeStore = { table: s.otpCodes, key: s.otpCodes.phone };
const EMAIL_CODES: CodeStore = { table: s.emailCodes as unknown as typeof s.otpCodes, key: s.emailCodes.email as unknown as typeof s.otpCodes.phone };

/** Counts the attempt and reads the hash in one statement, so guesses sent in parallel cannot share one count;
 *  a correct code is deleted by the request that used it, so it works once. */
async function consume(store: CodeStore, key: string, code: string, tried: "sms" | "email"): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = await db();
  const [row] = await d.update(store.table).set({ attempts: sql`${store.table.attempts} + 1` })
    .where(and(eq(store.key, key), gt(store.table.expiresAt, new Date().toISOString()), lt(store.table.attempts, MAX_ATTEMPTS)))
    .returning({ codeHash: store.table.codeHash });
  if (!row) {
    const [existing] = await d.select({ expiresAt: store.table.expiresAt }).from(store.table).where(eq(store.key, key));
    if (existing && Date.parse(iso(existing.expiresAt)!) >= Date.now()) return { ok: false, error: "Too many wrong codes. Ask for a new one." };
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }
  const a = Buffer.from(row.codeHash), b = Buffer.from(codeHash(key, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: tried === "sms" ? "That code is not right. Check the SMS and try again." : "That code is not right. Check the email and try again." };
  const used = await d.delete(store.table).where(and(eq(store.key, key), eq(store.table.codeHash, row.codeHash))).returning({ key: store.key });
  if (!used.length) return { ok: false, error: "That code has expired. Ask for a new one." };
  return { ok: true };
}

/** Stores a fresh code for `key`, refusing a second one within 30 seconds or a sixth in an hour. Returns it, or an error. */
async function newCode(store: CodeStore, key: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const d = await db();
  const [prev] = await d.select({ sentAt: store.table.sentAt }).from(store.table).where(eq(store.key, key));
  if (prev && Date.now() - Date.parse(iso(prev.sentAt)!) < RESEND_AFTER) return { ok: false, error: "We just sent a code. Wait a few seconds before asking for another." };
  // One number or address cannot be written to over and over, even from many IP addresses.
  if (!(await allowFor("codeTo", key))) return { ok: false, error: "We’ve sent several codes to this number. Try again in an hour." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = { codeHash: codeHash(key, code), expiresAt: new Date(Date.now() + CODE_TTL).toISOString(), attempts: 0, sentAt: new Date().toISOString() };
  await d.insert(store.table).values({ [store.key.name === "phone" ? "phone" : "email"]: key, ...row } as never).onConflictDoUpdate({ target: store.key, set: row });
  return { ok: true, code };
}
const dropCode = async (store: CodeStore, key: string) => { await (await db()).delete(store.table).where(eq(store.key, key)); };

// ---- phone (staff, and customers who have not added an email yet)
/** Texts a sign-in code: in the account's language for a customer, else in `locale`, the page's. */
export async function issueCode(phoneInput: string, locale: Locale = "rw"): Promise<{ ok: true; demoCode?: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a Rwandan mobile number, e.g. 788 123 456." };
  // Without a real SMS provider a live site cannot deliver a code, and must not hand it out on screen instead.
  if (!canDeliverCodes()) return { ok: false, error: "Sign-in codes can’t be sent right now. Please contact us." };
  const made = await newCode(PHONE_CODES, phone);
  if (!made.ok) return made;
  const d = await db();
  try {
    // Staff get it in English, like all their SMS (staff sign-in wins when a number is both); a customer
    // in their account's language; anyone else in the language of the page they asked from.
    const [staff] = await d.select({ id: s.staff.id }).from(s.staff).where(and(eq(s.staff.phone, phone), eq(s.staff.active, true)));
    const [account] = staff ? [] : await d.select({ locale: s.accounts.locale }).from(s.accounts).where(eq(s.accounts.phone, phone));
    await sendSms(phone, smsText(staff ? "en" : account?.locale ?? locale, sms("code", { code: made.code })));
  } catch (e) {
    console.error(e);
    await dropCode(PHONE_CODES, phone);
    return { ok: false, error: "We couldn’t send the SMS. Please try again in a minute." };
  }
  // In a demo without a live SMS provider the code is shown on screen. Never on a live site.
  return showsCodeOnScreen() ? { ok: true, demoCode: made.code } : { ok: true };
}

export async function consumeCode(phoneInput: string, code: string): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const phone = normalisePhone(phoneInput);
  if (!phone || !/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the SMS." };
  const r = await consume(PHONE_CODES, phone, code, "sms");
  return r.ok ? { ok: true, phone } : r;
}

// ---- email (customers)
/** Lower case, one address, a plausible shape; null if it is not one. */
export const normaliseEmail = (v: string) => {
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/.test(e) ? e : null;
};

/** Emails a code to sign in or to confirm an address. `locale` is the page's; a known account's own language wins. */
export async function issueEmailCode(emailInput: string, locale: Locale = "rw", purpose: "signIn" | "confirm" = "signIn"): Promise<{ ok: true; demoCode?: string } | { ok: false; error: string }> {
  const email = normaliseEmail(emailInput);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  // A live site sends every code by email, sample addresses included, and never prints one on screen.
  if (!canDeliverEmailCodes()) return { ok: false, error: "Sign-in codes can’t be sent right now. Please contact us." };
  const made = await newCode(EMAIL_CODES, email);
  if (!made.ok) return made;
  try {
    const [account] = await (await db()).select({ locale: s.accounts.locale }).from(s.accounts).where(sql`lower(${s.accounts.email}) = ${email}`);
    const lang = account?.locale ?? locale;
    await sendEmail({
      to: email, subject: text(lang, purpose === "signIn" ? "email.codeSubject" : "email.confirmSubject"),
      text: text(lang, purpose === "signIn" ? "email.codeIntro" : "email.confirmIntro"), highlight: made.code, footer: text(lang, "email.codeFooter"),
    });
  } catch (e) {
    console.error("[email]", e);
    await dropCode(EMAIL_CODES, email);
    return { ok: false, error: "We couldn’t send the email. Please try again in a minute." };
  }
  return showsEmailCodeOnScreen() ? { ok: true, demoCode: made.code } : { ok: true };
}

export async function consumeEmailCode(emailInput: string, code: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const email = normaliseEmail(emailInput);
  if (!email || !/^\d{6}$/.test(code)) return { ok: false, error: "Enter the 6-digit code from the email." };
  const r = await consume(EMAIL_CODES, email, code, "email");
  return r.ok ? { ok: true, email } : r;
}

// ---------------- sessions ----------------
/** This browser's own random id (a long-lived cookie), hashed: how staff devices are told apart. Server actions only. */
async function deviceHash(): Promise<string> {
  const jar = await cookies();
  let value = jar.get(DEVICE_COOKIE)?.value;
  if (!value || !/^[A-Za-z0-9_-]{32}$/.test(value)) {
    value = randomBytes(24).toString("base64url");
    jar.set(DEVICE_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  }
  return sha(value);
}
/** "Chrome on Android": enough for someone to recognise their own device in a list or an email. */
export async function deviceLabel(): Promise<string> {
  const ua = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export async function startSession(kind: "customer" | "staff", subjectId: string, opts: { trusted?: boolean; stepUp?: boolean } = {}) {
  const d = await db();
  const jar = await cookies();
  // A new token for every sign-in, and the one this browser held before is dropped, so a token planted before sign-in is useless after.
  const before = jar.get(COOKIE)?.value;
  if (before) await d.delete(s.sessions).where(eq(s.sessions.id, sha(before)));
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const staff = kind === "staff";
  const cap = staff ? (opts.trusted ? STAFF_CAP.trusted : STAFF_CAP.plain) : SESSION.customer.cap;
  await d.insert(s.sessions).values({
    id: sha(token), kind, subjectId, expiresAt: new Date(now + (staff ? cap : SESSION.customer.idle)).toISOString(),
    ...(staff ? { lastSeenAt: new Date(now).toISOString(), stepUpAt: opts.stepUp ? new Date(now).toISOString() : null, trusted: !!opts.trusted, device: await deviceHash(), label: await deviceLabel() } : {}),
  });
  // Keep the newest few sessions of this person; older devices are signed out.
  const mine = await d.select({ id: s.sessions.id }).from(s.sessions).where(and(eq(s.sessions.kind, kind), eq(s.sessions.subjectId, subjectId))).orderBy(desc(s.sessions.createdAt));
  if (mine.length > MAX_SESSIONS) await d.delete(s.sessions).where(inArray(s.sessions.id, mine.slice(MAX_SESSIONS).map((r) => r.id)));
  jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(now + cap) });
}

/** Records this browser for a member of staff. True when it is one they have not signed in from before. */
export async function rememberStaffDevice(staffId: string, verified = false): Promise<{ isNew: boolean; label: string }> {
  const d = await db();
  const device = await deviceHash();
  const label = await deviceLabel();
  const now = new Date().toISOString();
  const added = await d.insert(s.staffDevices).values({ staffId, device, label, ...(verified ? { verifiedAt: now } : {}) }).onConflictDoNothing().returning({ device: s.staffDevices.device });
  if (!added.length) await d.update(s.staffDevices).set({ lastSeen: now, label, ...(verified ? { verifiedAt: now } : {}) }).where(and(eq(s.staffDevices.staffId, staffId), eq(s.staffDevices.device, device)));
  return { isNew: added.length > 0, label };
}
/** Did this browser give an authenticator code for this person in the last 30 days, with "keep me signed in" on? */
export async function isDeviceVerified(staffId: string): Promise<boolean> {
  const jar = await cookies();
  const value = jar.get(DEVICE_COOKIE)?.value;
  if (!value || !/^[A-Za-z0-9_-]{32}$/.test(value)) return false;
  const [row] = await (await db()).select({ verifiedAt: s.staffDevices.verifiedAt }).from(s.staffDevices)
    .where(and(eq(s.staffDevices.staffId, staffId), eq(s.staffDevices.device, sha(value))));
  return !!row?.verifiedAt && Date.now() - Date.parse(iso(row.verifiedAt)!) < DEVICE_VERIFIED_FOR;
}

// ---- second step for staff (authenticator app)
const PENDING_COOKIE = "inzira_2fa";
const PENDING_TTL = 5 * 60e3;

/** After a staff member's SMS code is right but before the authenticator code: a five-minute marker, in its own cookie.
 *  It opens nothing on its own: getSession never reads it. */
export async function startPending(staffId: string, trusted = false) {
  const d = await db();
  const jar = await cookies();
  const token = randomBytes(32).toString("base64url");
  await d.insert(s.sessions).values({ id: sha(token), kind: "pending", subjectId: staffId, trusted, expiresAt: new Date(Date.now() + PENDING_TTL).toISOString() });
  jar.set(PENDING_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: PENDING_TTL / 1000 });
}
/** The staff id waiting for their second step, if the marker is still valid. */
export async function readPending(): Promise<{ staffId: string; trusted: boolean } | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  const [row] = await (await db()).select().from(s.sessions).where(and(eq(s.sessions.id, sha(token)), eq(s.sessions.kind, "pending"), gt(s.sessions.expiresAt, new Date().toISOString())));
  return row ? { staffId: row.subjectId, trusted: row.trusted } : null;
}
export async function endPending() {
  const jar = await cookies();
  const token = jar.get(PENDING_COOKIE)?.value;
  if (token) await (await db()).delete(s.sessions).where(eq(s.sessions.id, sha(token)));
  jar.delete(PENDING_COOKIE);
}

/** Signs a person out on every device except the one making this request (after a change of email, say). */
export async function endOtherSessions(kind: "customer" | "staff", subjectId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  const where = and(eq(s.sessions.kind, kind), eq(s.sessions.subjectId, subjectId));
  await (await db()).delete(s.sessions).where(token ? and(where, ne(s.sessions.id, sha(token))) : where);
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await (await db()).delete(s.sessions).where(eq(s.sessions.id, sha(token)));
  jar.delete(COOKIE);
}

export type Session = {
  kind: "customer" | "staff"; subjectId: string;
  /** Staff only: the session row, the last request it served, the last authenticator code, and the 30-day choice. */
  id?: string; lastSeenAt?: string; stepUpAt?: string; trusted?: boolean;
};

/** The signed-in person for this request, or null. Cached for the duration of one request. A customer's session moves
 *  its idle deadline forward when used (at most once per half window, so reading a page is not a write), never past its
 *  cap. A staff session simply ends at its cap; going idle locks it instead (getStaffUser). */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const d = await db();
  const [row] = await d.select().from(s.sessions).where(and(eq(s.sessions.id, sha(token)), gt(s.sessions.expiresAt, new Date().toISOString())));
  if (!row || row.kind === "pending") return null;
  const created = Date.parse(iso(row.createdAt)!);
  if (row.kind === "staff") {
    if (Date.now() >= created + (row.trusted ? STAFF_CAP.trusted : STAFF_CAP.plain)) return null;
    return { kind: "staff", subjectId: row.subjectId, id: row.id, lastSeenAt: iso(row.lastSeenAt) ?? iso(row.createdAt), stepUpAt: iso(row.stepUpAt), trusted: row.trusted };
  }
  const { idle, cap } = SESSION.customer;
  const hardEnd = created + cap;
  if (Date.now() >= hardEnd) return null;
  const expires = Date.parse(iso(row.expiresAt)!);
  if (expires - Date.now() < idle / 2) {
    await d.update(s.sessions).set({ expiresAt: new Date(Math.min(Date.now() + idle, hardEnd)).toISOString() }).where(eq(s.sessions.id, row.id)).catch(() => {});
  }
  return { kind: row.kind, subjectId: row.subjectId };
});

/** The page this request is for, when it is a place we can send someone back to. */
async function askedPath(): Promise<string | null> {
  try {
    return safeReturnPath((await headers()).get("x-inzira-path"));
  } catch {
    return null;
  }
}

export async function requireCustomerId(next = "/portal"): Promise<string> {
  const session = await getSession();
  if (session?.kind !== "customer") redirect(`/sign-in?next=${encodeURIComponent((await askedPath()) ?? safeReturnPath(next) ?? "/portal")}`);
  return session.subjectId;
}

/** Whether staff must have a password and the authenticator app before they can work: always on a live site, unless
 *  REQUIRE_STAFF_TOTP=0; in development and demos only with REQUIRE_STAFF_TOTP=1. */
export const staffSecurityRequired = () => {
  const set = process.env.REQUIRE_STAFF_TOTP;
  if (set === "1") return true;
  if (set === "0") return false;
  return process.env.NODE_ENV === "production" && process.env.INZIRA_DEMO !== "1";
};
/** Staff who must set up their password or authenticator hold no permissions and see only the page that sets them up. */
const mustSetUp = (person: { totpEnabledAt: unknown; passwordHash: unknown }) => staffSecurityRequired() && (!person.totpEnabledAt || !person.passwordHash);
export const SECOND_STEP_SETUP = "/console/security";

type StaffUser = Staff & {
  permissions: Set<Permission>;
  /** Must set up a password or the authenticator first. */
  needsSecondStep: boolean;
  /** An authenticator code was given in this session (30 days on a trusted device), or the person has none to give. Money, roles and ID numbers
   *  ask for one otherwise (lib/step-up.ts). */
  stepUpFresh: boolean;
  hasPassword: boolean;
};

/** The console locks after a while without use, for someone with a password to unlock it. */
const lockedOut = (session: Session, person: { passwordHash: string | null }) =>
  !!person.passwordHash && !!session.lastSeenAt && Date.now() - Date.parse(session.lastSeenAt) > (session.trusted ? STAFF_IDLE_LOCK_TRUSTED : STAFF_IDLE_LOCK);

async function loadStaff(touch: boolean): Promise<StaffUser | null> {
  const session = await getSession();
  if (session?.kind !== "staff") return null;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, session.subjectId), eq(s.staff.active, true)));
  if (!person || lockedOut(session, person)) return null;
  // Use keeps the console open. The background check for new alerts (peekStaffUser) does not.
  if (touch && session.id && (!session.lastSeenAt || Date.now() - Date.parse(session.lastSeenAt) > 60e3)) {
    await d.update(s.sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(s.sessions.id, session.id)).catch(() => {});
  }
  const base = { id: person.id, name: person.name, role: person.role, team: person.team, title: person.title, active: person.active };
  const stepUpFresh = !person.totpEnabledAt || (!!session.stepUpAt && Date.now() - Date.parse(session.stepUpAt) < stepUpWindow(!!session.trusted));
  const extra = { stepUpFresh, hasPassword: !!person.passwordHash };
  if (mustSetUp(person)) return { ...base, ...extra, permissions: new Set<Permission>(), needsSecondStep: true };
  const rows = await d.select().from(s.rolePermissions).where(and(eq(s.rolePermissions.role, person.role), eq(s.rolePermissions.allowed, true)));
  // The owner can always do everything, whatever the matrix says.
  const all = person.role === "Owner";
  const permissions = new Set<Permission>(all ? (await d.select().from(s.rolePermissions)).map((r) => r.permission as Permission) : rows.map((r) => r.permission as Permission));
  return { ...base, ...extra, permissions, needsSecondStep: false };
}
export const getStaffUser = cache(() => loadStaff(true));
/** The same, without counting as use: for the console's background checks. */
export const peekStaffUser = cache(() => loadStaff(false));

/** Whether this browser holds a staff session that is locked for being idle (it unlocks with the password). */
export const staffLocked = cache(async (): Promise<boolean> => {
  const session = await getSession();
  if (session?.kind !== "staff") return false;
  const [person] = await (await db()).select({ passwordHash: s.staff.passwordHash }).from(s.staff).where(and(eq(s.staff.id, session.subjectId), eq(s.staff.active, true)));
  return !!person && lockedOut(session, person);
});

export async function requireStaff(next = "/console") {
  const me = await getStaffUser();
  const back = encodeURIComponent((await askedPath()) ?? safeReturnPath(next) ?? "/console");
  if (!me) redirect((await staffLocked()) ? `/staff/unlock?next=${back}` : `/staff?next=${back}`);
  if (me.needsSecondStep && !((await askedPath()) ?? "").startsWith(SECOND_STEP_SETUP)) redirect(`${SECOND_STEP_SETUP}?setup=1`);
  return me;
}
export const can = (me: { permissions: Set<Permission> } | null, p: Permission) => !!me?.permissions.has(p);

/** Marks the current staff session as having just given an authenticator code, and as used now. */
export async function markStepUp() {
  const session = await getSession();
  if (session?.kind !== "staff" || !session.id) return;
  const now = new Date().toISOString();
  await (await db()).update(s.sessions).set({ stepUpAt: now, lastSeenAt: now }).where(eq(s.sessions.id, session.id));
}
/** Unlocks an idle console after the password was checked. */
export async function markUnlocked() {
  const session = await getSession();
  if (session?.kind !== "staff" || !session.id) return;
  await (await db()).update(s.sessions).set({ lastSeenAt: new Date().toISOString() }).where(eq(s.sessions.id, session.id));
}
/** The staff sessions of one person, newest first, for the devices list; `current` marks this browser's. */
export async function listStaffSessions(staffId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  const rows = await (await db()).select().from(s.sessions)
    .where(and(eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, staffId), gt(s.sessions.expiresAt, new Date().toISOString()))).orderBy(desc(s.sessions.createdAt));
  return rows.map((r) => ({ id: r.id, label: r.label ?? "A browser", since: iso(r.createdAt)!, lastSeen: iso(r.lastSeenAt) ?? iso(r.createdAt)!, trusted: r.trusted, current: !!token && r.id === sha(token) }));
}
/** Ends one of this person's own staff sessions. */
export async function endStaffSession(staffId: string, sessionId: string) {
  await (await db()).delete(s.sessions).where(and(eq(s.sessions.id, sessionId), eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, staffId)));
}
