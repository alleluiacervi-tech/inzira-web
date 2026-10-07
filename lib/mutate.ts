// Helpers shared by the server actions in app/actions: running numbers, the audit trail,
// customer notifications and the request timeline. Server only.
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s, type Db } from "./db";
import { sendMail } from "./mail";
import { siteOrigin } from "./site";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Next value of a running number, safely under concurrent use. */
export async function nextNumber(tx: Tx | Db, name: "request" | "invoice") {
  const [row] = await tx.update(s.counters).set({ value: sql`${s.counters.value} + 1` }).where(eq(s.counters.name, name)).returning({ value: s.counters.value });
  return row.value;
}
export const refFor = (n: number) => `INZ-${new Date().getFullYear()}-${String(n).padStart(5, "0")}`;
export const invoiceFor = (n: number) => `INZ-R-${n}`;

/** "Web · Chrome/Android" — where an action came from, for the audit log. */
export async function source() {
  const ua = (await headers()).get("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return `Web · ${browser}${os ? `/${os}` : ""}`;
}

export async function audit(tx: Tx | Db, e: { actor: string; role: string; action: string; entity: string; fee?: boolean }) {
  await tx.insert(s.audit).values({ ...e, fee: !!e.fee, source: await source() });
}

export async function event(tx: Tx | Db, ref: string, title: string, by: string, body?: string) {
  await tx.insert(s.events).values({ ref, title, by, body });
}

const portalLink = (ref: string) => {
  const origin = siteOrigin();
  return origin ? `${origin}/portal/requests/${ref}` : `/portal/requests/${ref}`;
};

/** Emails the agent on the case. No agent, or no mailbox, is not an error. */
export async function pingAgent(tx: Tx | Db, ref: string, message: string) {
  const [row] = await tx.select({ agentId: s.requests.agentId }).from(s.requests).where(eq(s.requests.ref, ref));
  if (!row?.agentId) return;
  const [agent] = await tx.select({ email: s.staff.email, name: s.staff.name }).from(s.staff).where(eq(s.staff.id, row.agentId));
  if (!agent?.email) return;
  sendMail({
    to: agent.email,
    subject: `Inzira ${ref}: a customer wrote`,
    preheader: message,
    title: `${ref} needs you`,
    paragraphs: [`Hello ${agent.name.split(" ")[0]},`, message],
    cta: { href: `/agent/cases/${ref}`, label: "Open the case" },
  }).catch((e) => console.error("[mail]", e));
}

/** A notification in the customer's portal, and the same news by email. Mail failures never block the action. */
export async function notify(tx: Tx | Db, ref: string, n: { icon: string; title: string; detail?: string }) {
  const [row] = await tx.select({ accountId: s.profiles.accountId, email: s.accounts.email, first: s.accounts.first })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  if (!row) return;
  await tx.insert(s.notifications).values({ accountId: row.accountId, icon: n.icon, title: n.title, href: `/portal/requests/${ref}` });
  if (n.detail && row.email) {
    sendMail({
      to: row.email,
      subject: `Inzira ${ref}`,
      preheader: n.detail,
      title: n.title,
      paragraphs: [`Hello ${row.first},`, n.detail],
      cta: { href: portalLink(ref), label: "Open your request" },
    }).catch((e) => console.error("[mail]", e));
  }
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export { db, s };
