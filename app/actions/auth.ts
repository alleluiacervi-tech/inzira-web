"use server";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { consumeCode, consumeEmailCode, endSession, issueCode, issueEmailCode, startSession } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { getLocale, rememberLocale } from "@/lib/i18n/locale";
import { TOO_MANY, allowIp } from "@/lib/ratelimit";

/** Customers sign in with their email. Phone sign-in stays for staff and, until they add an email, for customers
 *  who registered before email sign-in existed. Set CUSTOMER_PHONE_SIGNIN=0 to end that for customers. */
const customerPhoneSignIn = () => process.env.CUSTOMER_PHONE_SIGNIN !== "0";

/** Step 1 of signing in by phone (staff), and of confirming a phone: text a code to the number. */
export async function requestCode(phone: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  return issueCode(phone, await getLocale());
}

/** Step 1 of signing in as a customer, and of confirming a request: email a code to the address. */
export async function requestEmailCode(email: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  return issueEmailCode(email, await getLocale(), "signIn");
}

/** Step 2 by phone: check the code and sign in. Staff go to their workspace, customers to their portal. */
export async function signIn(phone: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeCode(phone, code);
  if (!checked.ok) return checked;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.phone, checked.phone), eq(s.staff.active, true)));
  if (person) {
    await startSession("staff", person.id);
    // /console sends each role to its own home: the overview or My day.
    redirect(next?.startsWith("/console") || next?.startsWith("/admin") ? next : "/console");
  }
  const [account] = await d.select().from(s.accounts).where(eq(s.accounts.phone, checked.phone));
  if (!account) return { ok: false as const, error: "We don’t have an account for this number yet. Start a service and your portal is created with your first request." };
  // Once a customer has an email, the email is the way in; the phone stays a contact number.
  if (account.email || !customerPhoneSignIn()) return { ok: false as const, error: "Customers sign in with their email address. Use the email option." };
  return openPortal(account, next);
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
