"use server";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { normalisePhone, consumeCode, consumeEmailCode, endPending, endSession, issueCode, issueEmailCode, readPending, startPending, startSession } from "@/lib/auth";
import { checkSecondStep } from "@/lib/second-step";
import { audit } from "@/lib/mutate";
import { db, schema as s } from "@/lib/db";
import { getLocale, rememberLocale } from "@/lib/i18n/locale";
import { hasAdminAccess, type Permission } from "@/lib/permissions";
import { TOO_MANY, allowIp, clientIp } from "@/lib/ratelimit";
import { verifyHuman } from "@/lib/turnstile";
import type { StaffRole } from "@/lib/types";

const NOT_HUMAN = "We couldn’t confirm you are not a robot. Reload the page and try again.";

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
  if (account.email || !customerPhoneSignIn()) return { ok: false as const, error: "Customers sign in with their email address. Use the email option." };
  return openPortal(account, next);
}

/** Where this role starts work. Same rule as the /console page, so sign-in does not stop on an empty shell. */
async function staffHome(role: StaffRole): Promise<"/console/overview" | "/console/my-day"> {
  if (role === "Owner" || role === "Administrator" || role === "Finance") return "/console/overview";
  const rows = await (await db()).select({ permission: s.rolePermissions.permission }).from(s.rolePermissions)
    .where(and(eq(s.rolePermissions.role, role), eq(s.rolePermissions.allowed, true)));
  return hasAdminAccess(role, rows.map((r) => r.permission as Permission)) ? "/console/overview" : "/console/my-day";
}

/** Starts a staff session. When the owner requires the authenticator step and this person has not set it up, they go to set it up first. */
async function openConsole(person: typeof s.staff.$inferSelect, next?: string, via = "SMS code"): Promise<never> {
  await startSession("staff", person.id);
  await audit(await db(), { actor: person.name, role: person.role, action: "Signed in", entity: `Staff · ${via}` }).catch(() => {});
  if (process.env.REQUIRE_STAFF_TOTP === "1" && !person.totpEnabledAt) redirect("/console/security?setup=1");
  // A deep link is kept. A bare /console, or no link, opens that role's home.
  const asked = next?.startsWith("/console") || next?.startsWith("/admin") ? next : "";
  redirect(asked && asked !== "/console" ? asked : await staffHome(person.role));
}

/** Step 3 for staff with an authenticator app: the 6-digit code from the app, or a recovery code. */
export async function signInSecondStep(input: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const staffId = await readPending();
  if (!staffId) return { ok: false as const, error: "That sign-in took too long. Start again.", restart: true as const };
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
  return openConsole(person, next, checked.usedRecovery ? "recovery code" : "authenticator app");
}

/** Step 2 by email: check the code and sign in to the portal. */
export async function signInWithEmail(email: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeEmailCode(email, code);
  if (!checked.ok) return checked;
  const [account] = await (await db()).select().from(s.accounts).where(sql`lower(${s.accounts.email}) = ${checked.email}`);
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
  redirect(next?.startsWith("/portal") ? next : "/portal");
}

export async function signOut() {
  await endSession();
  redirect("/sign-in");
}
