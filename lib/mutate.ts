// Helpers shared by the server actions in app/actions: running numbers, the audit trail,
// customer notifications and the request timeline. Server only.
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { after } from "next/server";
import { db, schema as s, type Db } from "./db";
import { sendEmail } from "./email";
import { text } from "./i18n/messages";
import { english, hasPart, smsText } from "./i18n/stored";
import { SITE } from "./site";
import { sendSms } from "./sms";
import type { Msg } from "./types";

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

/** A line on the request's timeline, which the customer sees too. `body` is someone's own words,
 *  shown as typed; a message with a body part of its own takes no `body`. */
export async function event(tx: Tx | Db, ref: string, what: Msg, by: string, body?: string) {
  const ownBody = hasPart(what, "body");
  if (ownBody && body !== undefined) console.error(`[i18n] ${what.key} has its own body; the text passed was dropped`);
  await tx.insert(s.events).values({
    ref, by, key: what.key, vars: what.vars ?? null,
    title: english(what, "title"), body: ownBody ? english(what, "body") : body,
  });
}

/** Runs work after the response has gone and the database has committed: the customer never waits for a mail
 *  server, a rolled-back change never sends a message, and a serverless host does not stop it half way.
 *  Outside a request (a script) it simply runs. Failures are logged, never thrown. */
function afterResponse(task: () => Promise<void>) {
  const run = () => task().catch((e) => console.error("[notify]", e));
  try { after(run); } catch { void run(); }
}

/** A notification in the customer's portal and, with `sms`, a message to them in their language: an email when
 *  they have one, otherwise an SMS to their phone. A delivery failure never blocks the action. */
export async function notify(tx: Tx | Db, ref: string, n: { icon: string; title: Msg; sms?: Msg }) {
  const [row] = await tx.select({ accountId: s.profiles.accountId, phone: s.accounts.phone, email: s.accounts.email, locale: s.accounts.locale })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  if (!row) return;
  await tx.insert(s.notifications).values({ accountId: row.accountId, icon: n.icon, title: english(n.title), key: n.title.key, vars: n.title.vars ?? null, href: `/portal/requests/${ref}` });
  if (!n.sms) return;
  const body = smsText(row.locale, n.sms);
  const { email, phone, locale } = row;
  if (email) {
    const link = SITE.url.startsWith("http") ? `\n\n${SITE.url}/portal/requests/${ref}` : "";
    afterResponse(() => sendEmail({ to: email, subject: text(locale, "email.updateSubject", { ref }), text: `${body}${link}`, footer: text(locale, "email.updateFooter") }));
  } else if (phone) {
    afterResponse(() => sendSms(phone, `Inzira ${ref}: ${body}`));
  }
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
export { db, s };
