"use server";
import { and, eq, or, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { normalisePhone, consumeCode, consumeEmailCode, endPending, endSession, getSession, issueCode, issueEmailCode, markStepUp, markUnlocked, readPending, rememberStaffDevice, staffSecurityRequired, startPending, startSession } from "@/lib/auth";
import { enqueue, sendSoon } from "@/lib/outbox";
import { verifyPassword } from "@/lib/password";
import { safeReturnPath } from "@/lib/return-path";
import { checkSecondStep } from "@/lib/second-step";
import { audit } from "@/lib/mutate";
import { db, schema as s } from "@/lib/db";
import { getLocale, rememberLocale } from "@/lib/i18n/locale";
import { hasAdminAccess, type Permission } from "@/lib/permissions";
import { TOO_MANY, allowFor, allowIp, clientIp } from "@/lib/ratelimit";
import { verifyHuman } from "@/lib/turnstile";
import type { StaffRole } from "@/lib/types";

const NOT_HUMAN = "We couldn’t confirm you are not a robot. Reload the page and try again.";
const STAFF_USE_PASSWORD = "Inzira staff sign in with their username and password.";
const WRONG_PASSWORD = "That username or password is not right.";
const PAUSED = "Too many wrong passwords. Sign-in is paused for 15 minutes.";

/** Customers sign in with their email. Phone sign-in stays for staff and, until they add an email, for customers
 *  who registered before email sign-in existed. Set CUSTOMER_PHONE_SIGNIN=0 to end that for customers. */
const customerPhoneSignIn = () => process.env.CUSTOMER_PHONE_SIGNIN !== "0";

/** Step 1 of signing in by phone (staff), and of confirming a phone: text a code to the number. */
export async function requestCode(phone: string, human?: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  if (!(await verifyHuman(human, await clientIp()))) return { ok: false as const, error: NOT_HUMAN };
  return issueCode(phone, await getLocale());
}

/** Step 1 of signing in as a customer, and of confirming a request: email a code to the address. */
export async function requestEmailCode(email: string, human?: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  if (!(await verifyHuman(human, await clientIp()))) return { ok: false as const, error: NOT_HUMAN };
  return issueEmailCode(email, await getLocale(), "signIn");
}

/** Step 2 by phone: check the code and sign in. Staff go to their workspace, customers to their portal. */
export async function signIn(phone: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeCode(phone, code);
  const d = await db();
  if (!checked.ok) {
    // Wrong codes for a staff number are worth a line in the audit log; for anyone else they would only be noise.
    const digits = normalisePhone(phone);
    const [target] = digits ? await d.select().from(s.staff).where(and(eq(s.staff.phone, digits), eq(s.staff.active, true))) : [];
    if (target) await audit(d, { actor: target.name, role: target.role, action: "Wrong sign-in code", entity: "Staff sign-in" }).catch(() => {});
    return checked;
  }
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.phone, checked.phone), eq(s.staff.active, true)));
  // Once someone has a password, a code to their phone is no longer a way into the console.
  if (person?.passwordHash) return { ok: false as const, error: STAFF_USE_PASSWORD };
  if (person) {
    // A member of staff with the authenticator step on is not signed in yet: the SMS code was the first step.
    if (person.totpEnabledAt) {
      await startPending(person.id);
      return { ok: true as const, step: "totp" as const };
    }
    return openConsole(person, next);
  }
  const [account] = await d.select().from(s.accounts).where(eq(s.accounts.phone, checked.phone));
  if (!account) return { ok: false as const, error: "We don’t have an account for this number yet. Start a service and your portal is created with your first request." };
  // Once a customer has an email, the email is the way in; the phone stays a contact number.
  if (account.email || !customerPhoneSignIn()) return { ok: false as const, error: "Customers sign in with their email address. Type your email instead." };
  return openPortal(account, next);
}

/** Where this role starts work. Same rule as the /console page, so sign-in does not stop on an empty shell. */
async function staffHome(role: StaffRole): Promise<"/console/overview" | "/console/my-day"> {
  if (role === "Owner" || role === "Administrator" || role === "Finance") return "/console/overview";
  const rows = await (await db()).select({ permission: s.rolePermissions.permission }).from(s.rolePermissions)
    .where(and(eq(s.rolePermissions.role, role), eq(s.rolePermissions.allowed, true)));
  return hasAdminAccess(role, rows.map((r) => r.permission as Permission)) ? "/console/overview" : "/console/my-day";
}

/** Starts a staff session: 30 days on a trusted device, 12 hours otherwise. A browser this person has never used is
 *  announced to their work email. Someone who still has to set up a password or the authenticator goes there first. */
async function openConsole(person: typeof s.staff.$inferSelect, next?: string, via = "SMS code", opts: { trusted?: boolean; stepUp?: boolean } = {}): Promise<never> {
  await startSession("staff", person.id, opts);
  const d = await db();
  const device = await rememberStaffDevice(person.id);
  await audit(d, { actor: person.name, role: person.role, action: "Signed in", entity: `Staff · ${via} · ${device.label}${opts.trusted ? " · 30 days" : ""}` }).catch(() => {});
  if (device.isNew && person.email) await announceDevice(person, device.label).catch((e) => console.error("[auth] new-device email", e));
  if (staffSecurityRequired() && (!person.totpEnabledAt || !person.passwordHash)) redirect("/console/security?setup=1");
  // A deep link is kept. A bare /console or /admin, or no link, opens that role's home.
  const asked = safeReturnPath(next);
  const home = !asked || asked === "/console" || asked === "/admin" || (!asked.startsWith("/console") && !asked.startsWith("/admin"));
  redirect(home ? await staffHome(person.role) : asked);
}

/** Step 3 for staff with an authenticator app: the 6-digit code from the app, or a recovery code. */
export async function signInSecondStep(input: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const pending = await readPending();
  if (!pending) return { ok: false as const, error: "That sign-in took too long. Start again.", restart: true as const };
  const { staffId, trusted } = pending;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, staffId), eq(s.staff.active, true)));
  if (!person) { await endPending(); return { ok: false as const, error: "That sign-in took too long. Start again.", restart: true as const }; }
  const checked = await checkSecondStep(staffId, input);
  if (!checked.ok) {
    await audit(d, { actor: person.name, role: person.role, action: "Wrong authenticator code", entity: "Staff sign-in" }).catch(() => {});
    if (checked.locked) await endPending();
    return { ok: false as const, error: checked.error, restart: checked.locked ? true as const : undefined };
  }
  await endPending();
  if (checked.usedRecovery) await audit(d, { actor: person.name, role: person.role, action: "Used a recovery code", entity: "Staff sign-in" }).catch(() => {});
  return openConsole(person, next, checked.usedRecovery ? "recovery code" : "authenticator app", { trusted, stepUp: true });
}

/** Step 2 by email: check the code and sign in. A staff work email opens the dashboard; everyone else opens the portal. */
export async function signInWithEmail(email: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeEmailCode(email, code);
  if (!checked.ok) return checked;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(sql`lower(${s.staff.email}) = ${checked.email}`, eq(s.staff.active, true)));
  if (person?.passwordHash) return { ok: false as const, error: STAFF_USE_PASSWORD };
  if (person) {
    if (person.totpEnabledAt) {
      await startPending(person.id);
      return { ok: true as const, step: "totp" as const };
    }
    return openConsole(person, next, "email code");
  }
  const [account] = await d.select().from(s.accounts).where(sql`lower(${s.accounts.email}) = ${checked.email}`);
  if (!account) return { ok: false as const, error: "We don’t have an account for this email yet. Start a service and your portal is created with your first request." };
  return openPortal(account, next);
}

/** Starts the customer's session. The first sign-in is what makes someone a registered portal user. */
async function openPortal(account: typeof s.accounts.$inferSelect, next?: string): Promise<never> {
  const d = await db();
  if (!account.registeredAt) await d.update(s.accounts).set({ registeredAt: new Date().toISOString() }).where(eq(s.accounts.id, account.id));
  await startSession("customer", account.id);
  // The public site follows the language of their portal from here on.
  await rememberLocale(account.locale === "en" ? "en" : "rw");
  const asked = safeReturnPath(next);
  redirect(asked?.startsWith("/portal") ? asked : "/portal");
}

export async function signOut() {
  // Staff go back to their own sign-in page.
  const staff = (await getSession())?.kind === "staff";
  await endSession();
  redirect(staff ? "/staff" : "/sign-in");
}

// ---------------- staff: username and password ----------------
const PAUSE_AFTER = 5;
const PAUSE_MS = 15 * 60e3;

/** Emails a member of staff when their account is used from a browser it has not seen before. */
async function announceDevice(person: typeof s.staff.$inferSelect, label: string) {
  const when = new Date().toLocaleString("en-GB", { timeZone: "Africa/Kigali", dateStyle: "medium", timeStyle: "short" });
  const to = person.email!;
  sendSoon([await enqueue(await db(), { channel: "email", to, mail: {
    to, subject: "New sign-in to the Inzira console",
    text: `Your Inzira staff account was used to sign in from ${label} on ${when} (Kigali time).\n\nIf this was you, there is nothing to do. If it wasn't, open the console, go to Security, sign out everywhere and change your password, then tell the owner.`,
    footer: "Sent to Inzira staff when their account is used from a new browser.",
  } })]);
}

/** Staff sign-in, step 1: username (or work email) and password. Five wrong passwords pause the account for 15 minutes.
 *  With the authenticator on, the code is step 2; `trust` keeps them signed in on this device for 30 days. */
export async function staffPasswordSignIn(identifier: string, password: string, trust: boolean, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const name = identifier.trim().toLowerCase().slice(0, 120);
  const d = await db();
  const [person] = name ? await d.select().from(s.staff)
    .where(and(eq(s.staff.active, true), or(sql`lower(${s.staff.username}) = ${name}`, sql`lower(${s.staff.email}) = ${name}`))) : [];
  if (person?.lockedUntil && Date.parse(person.lockedUntil) > Date.now()) return { ok: false as const, error: PAUSED };
  // The hash is checked even for a name that does not exist, so the answer takes as long either way.
  const right = await verifyPassword(password, person?.passwordHash);
  if (!person || !right) {
    if (person) {
      const failed = person.failedLogins + 1;
      const pause = failed >= PAUSE_AFTER;
      await d.update(s.staff).set({ failedLogins: pause ? 0 : failed, lockedUntil: pause ? new Date(Date.now() + PAUSE_MS).toISOString() : person.lockedUntil }).where(eq(s.staff.id, person.id));
      await audit(d, { actor: person.name, role: person.role, action: pause ? "Sign-in paused after wrong passwords" : "Wrong password", entity: "Staff sign-in" }).catch(() => {});
      if (pause) return { ok: false as const, error: PAUSED };
    }
    return { ok: false as const, error: WRONG_PASSWORD };
  }
  if (person.failedLogins || person.lockedUntil) await d.update(s.staff).set({ failedLogins: 0, lockedUntil: null }).where(eq(s.staff.id, person.id));
  if (person.totpEnabledAt) {
    await startPending(person.id, trust);
    return { ok: true as const, step: "totp" as const };
  }
  return openConsole(person, next, "password", { trusted: trust });
}

/** Unlocks a console that went idle for an hour: the password only, inside the same session. */
export async function unlockConsole(password: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const session = await getSession();
  if (session?.kind !== "staff") return { ok: false as const, error: "Your session has ended. Sign in again.", restart: true as const };
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, session.subjectId), eq(s.staff.active, true)));
  if (!person?.passwordHash) return { ok: false as const, error: "Your session has ended. Sign in again.", restart: true as const };
  if (!(await allowFor("unlock", person.id)) || !(await verifyPassword(password, person.passwordHash))) {
    await audit(d, { actor: person.name, role: person.role, action: "Wrong password", entity: "Unlock" }).catch(() => {});
    return { ok: false as const, error: "That password is not right." };
  }
  await markUnlocked();
  const asked = safeReturnPath(next);
  redirect(asked && (asked.startsWith("/console") || asked.startsWith("/admin")) ? asked : await staffHome(person.role));
}

/** "Confirm it's you" before a refund, payout, role change or ID number: an authenticator code, good for the rest of the session. */
export async function confirmSecondStep(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await allowIp("signIn"))) return { ok: false, error: TOO_MANY };
  const session = await getSession();
  if (session?.kind !== "staff") return { ok: false, error: "Your session has ended. Sign in again." };
  const checked = await checkSecondStep(session.subjectId, input);
  if (!checked.ok) return { ok: false, error: checked.error };
  await markStepUp();
  const [person] = await (await db()).select({ name: s.staff.name, role: s.staff.role }).from(s.staff).where(eq(s.staff.id, session.subjectId));
  if (person) await audit(await db(), { actor: person.name, role: person.role, action: "Confirmed with authenticator", entity: checked.usedRecovery ? "Recovery code" : "Authenticator app" }).catch(() => {});
  return { ok: true };
}

