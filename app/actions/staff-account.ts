"use server";
// A member of staff's own sign-in: password, username, signed-in devices, and the one-time links that set a password.
import { and, eq, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { endStaffSession, getSession, getStaffUser, listStaffSessions } from "@/lib/auth";
import { showsEmailCodeOnScreen } from "@/lib/email";
import { audit, db, fail, s, type Result } from "@/lib/mutate";
import { enqueue, sendSoon } from "@/lib/outbox";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { allowFor, allowIp, TOO_MANY } from "@/lib/ratelimit";
import { checkSecondStep } from "@/lib/second-step";
import { issueStaffToken, readStaffToken, spendStaffToken, staffTokenUrl } from "@/lib/staff-tokens";

const ended = "Your session has ended. Sign in again.";

/** Sets or changes the signed-in person's password. Changing one needs the current password; every other device is
 *  signed out afterwards. */
export async function setMyPassword(current: string, next: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail(ended);
  const d = await db();
  const [row] = await d.select().from(s.staff).where(eq(s.staff.id, me.id));
  if (!row) return fail(ended);
  if (!(await allowFor("unlock", `pw:${me.id}`))) return fail(TOO_MANY);
  if (row.passwordHash && !(await verifyPassword(current, row.passwordHash))) return fail("Your current password is not right.");
  const problem = await passwordProblem(next, [row.name, row.username ?? "", row.email ?? ""]);
  if (problem) return fail(problem);
  const session = await getSession();
  await d.update(s.staff).set({ passwordHash: await hashPassword(next), passwordSetAt: new Date().toISOString(), failedLogins: 0, lockedUntil: null }).where(eq(s.staff.id, me.id));
  // Other devices keep no access a stolen password gave them.
  if (session?.id) await d.delete(s.sessions).where(and(eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, me.id), ne(s.sessions.id, session.id)));
  await audit(d, { actor: me.name, role: me.role, action: row.passwordHash ? "Changed password" : "Set a password", entity: "Staff sign-in" });
  revalidatePath("/console/security");
  return { ok: true };
}

/** The name the person signs in with. Lower case letters, digits, dots, dashes and underscores. */
export async function setMyUsername(input: string): Promise<Result<{ username: string }>> {
  const me = await getStaffUser();
  if (!me) return fail(ended);
  const username = input.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) return fail("Use 3 to 32 lower-case letters, digits, dots, dashes or underscores.");
  const d = await db();
  const [taken] = await d.select({ id: s.staff.id }).from(s.staff)
    .where(and(ne(s.staff.id, me.id), or(sql`lower(${s.staff.username}) = ${username}`, sql`lower(${s.staff.email}) = ${username}`)));
  if (taken) return fail("That username is taken.");
  await d.update(s.staff).set({ username }).where(eq(s.staff.id, me.id));
  await audit(d, { actor: me.name, role: me.role, action: "Changed username", entity: username });
  revalidatePath("/console/security");
  return { ok: true, username };
}

/** Signs out one of the person's own devices. */
export async function signOutDevice(sessionId: string): Promise<Result> {
  const me = await getStaffUser();
  if (!me) return fail(ended);
  await endStaffSession(me.id, sessionId);
  await audit(await db(), { actor: me.name, role: me.role, action: "Signed out a device", entity: "Staff sign-in" });
  revalidatePath("/console/security");
  return { ok: true };
}

/** Signs out every other device of the person. */
export async function signOutOtherDevices(): Promise<Result<{ ended: number }>> {
  const me = await getStaffUser();
  const session = await getSession();
  if (!me || !session?.id) return fail(ended);
  const others = (await listStaffSessions(me.id)).filter((x) => !x.current);
  const d = await db();
  await d.delete(s.sessions).where(and(eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, me.id), ne(s.sessions.id, session.id)));
  await audit(d, { actor: me.name, role: me.role, action: "Signed out everywhere else", entity: `${others.length} device(s)` });
  revalidatePath("/console/security");
  return { ok: true, ended: others.length };
}

/** "Forgot your password?": a one-hour link to the work email on the account. The answer is the same whether or not the
 *  account exists, so the form can't be used to find usernames. */
export async function requestPasswordReset(identifier: string): Promise<{ ok: true; demoUrl?: string } | { ok: false; error: string }> {
  const name = identifier.trim().toLowerCase().slice(0, 120);
  if (!name) return { ok: false, error: "Enter your username or work email." };
  if (!(await allowIp("code")) || !(await allowFor("codeTo", `reset:${name}`))) return { ok: false, error: TOO_MANY };
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.active, true), or(sql`lower(${s.staff.username}) = ${name}`, sql`lower(${s.staff.email}) = ${name}`)));
  if (!person?.email) return { ok: true };
  const url = staffTokenUrl(await issueStaffToken(person.id, "reset"));
  const to = person.email;
  sendSoon([await enqueue(d, { channel: "email", to, mail: {
    to, subject: "Reset your Inzira console password",
    text: `Someone asked to reset the password of your Inzira staff account. If it was you, open this link within an hour:\n\n${url}\n\nIf it wasn't, ignore this email: your password stays as it is.`,
    footer: "Sent to Inzira staff who ask to reset their password.",
  } })]);
  await audit(d, { actor: person.name, role: person.role, action: "Asked for a password reset", entity: "Staff sign-in" });
  return { ok: true, ...(showsEmailCodeOnScreen() ? { demoUrl: url } : {}) };
}

/** Whom a set-password link is for, to greet them on its page. */
export async function readPasswordLink(token: string): Promise<{ ok: true; name: string; username: string | null; needsCode: boolean; kind: "invite" | "reset" } | { ok: false }> {
  if (!(await allowIp("track"))) return { ok: false };
  const link = await readStaffToken(token);
  if (!link) return { ok: false };
  const [person] = await (await db()).select().from(s.staff).where(and(eq(s.staff.id, link.staffId), eq(s.staff.active, true)));
  return person ? { ok: true, name: person.name, username: person.username ?? person.email, needsCode: !!person.totpEnabledAt, kind: link.kind } : { ok: false };
}

/** Sets a password from an invite or reset link. Someone with the authenticator on also gives a code, so an email
 *  account alone can't take over a staff account. Every session of theirs is ended. */
export async function setPasswordWithLink(token: string, password: string, code?: string): Promise<Result<{ username: string }>> {
  if (!(await allowIp("signIn"))) return fail(TOO_MANY);
  const link = await readStaffToken(token);
  if (!link) return fail("This link has expired or was already used. Ask the owner for a new one.");
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, link.staffId), eq(s.staff.active, true)));
  if (!person) return fail("This link has expired or was already used. Ask the owner for a new one.");
  const problem = await passwordProblem(password, [person.name, person.username ?? "", person.email ?? ""]);
  if (problem) return fail(problem);
  if (person.totpEnabledAt) {
    const checked = await checkSecondStep(person.id, code ?? "");
    if (!checked.ok) return fail(checked.error);
  }
  if (!(await spendStaffToken(token))) return fail("This link has expired or was already used. Ask the owner for a new one.");
  // A username is needed to sign in; a new colleague without one gets their work email, or one made from their name.
  const username = person.username ?? person.email?.toLowerCase() ?? await freeUsername(person.name);
  await d.update(s.staff).set({ passwordHash: await hashPassword(password), passwordSetAt: new Date().toISOString(), failedLogins: 0, lockedUntil: null, username }).where(eq(s.staff.id, person.id));
  await d.delete(s.sessions).where(and(eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, person.id)));
  await d.update(s.staffDevices).set({ verifiedAt: null }).where(eq(s.staffDevices.staffId, person.id));
  await audit(d, { actor: person.name, role: person.role, action: link.kind === "invite" ? "Set a password from an invite" : "Reset password", entity: "Staff sign-in" });
  return { ok: true, username };
}

async function freeUsername(name: string): Promise<string> {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 24) || "staff";
  const d = await db();
  for (let i = 0; i < 50; i++) {
    const candidate = i ? `${base}${i + 1}` : base;
    const [taken] = await d.select({ id: s.staff.id }).from(s.staff).where(sql`lower(${s.staff.username}) = ${candidate}`);
    if (!taken) return candidate;
  }
  return `${base}.${Date.now().toString(36)}`;
}
