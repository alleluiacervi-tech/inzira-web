"use server";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { consumeCode, endSession, issueCode, startSession } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { TOO_MANY, allowIp } from "@/lib/ratelimit";

/** Step 1 of signing in: email a code to the address (if it belongs to someone). */
export async function requestCode(email: string) {
  if (!(await allowIp("code"))) return { ok: false as const, error: TOO_MANY };
  return issueCode(email);
}

/** Step 2: check the code and sign in. Staff go to their workspace, customers to their portal. */
export async function signIn(email: string, code: string, next?: string) {
  if (!(await allowIp("signIn"))) return { ok: false as const, error: TOO_MANY };
  const checked = await consumeCode(email, code);
  if (!checked.ok) return checked;
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.email, checked.email), eq(s.staff.active, true)));
  if (person) {
    await startSession("staff", person.id);
    const admin = person.role === "Owner" || person.role === "Administrator" || person.role === "Finance";
    redirect(next?.startsWith("/agent") || next?.startsWith("/admin") || next?.startsWith("/console") ? next : admin ? "/admin" : "/agent");
  }
  const [account] = await d.select().from(s.accounts).where(eq(s.accounts.email, checked.email));
  if (!account) return { ok: false as const, error: "That code has expired or isn’t valid. Ask for a new one." };
  await startSession("customer", account.id);
  redirect(next?.startsWith("/portal") ? next : "/portal");
}

export async function signOut() {
  await endSession();
  redirect("/sign-in");
}
