"use server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { consumeCode, endSession, issueCode, startSession } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { TOO_MANY, allowIp } from "@/lib/ratelimit";

/** Step 1 of signing in, and of confirming a new request: text a code to the number. */
export async function requestCode(phone: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  return issueCode(phone);
}

/** Step 2: check the code and sign in. Staff go to their workspace, customers to their portal. */
export async function signIn(phone: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeCode(phone, code);
  if (!checked.ok) return checked;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.phone, checked.phone), eq(s.staff.active, true)));
  if (person) {
    await startSession("staff", person.id);
    const admin = person.role === "Owner" || person.role === "Administrator" || person.role === "Finance";
    redirect(next?.startsWith("/agent") || next?.startsWith("/admin") ? next : admin ? "/admin" : "/agent");
  }
  const [account] = await d.select().from(s.accounts).where(eq(s.accounts.phone, checked.phone));
  if (!account) return { ok: false as const, error: "We don’t have an account for this number yet. Start a service and your portal is created with your first request." };
  await startSession("customer", account.id);
  redirect(next?.startsWith("/portal") ? next : "/portal");
}

export async function signOut() {
  await endSession();
  redirect("/sign-in");
}
