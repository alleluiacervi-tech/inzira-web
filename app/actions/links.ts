"use server";
// Private request links (lib/request-links.ts): opening one, saving a request to an account, and sending the link again.
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { startSession } from "@/lib/auth";
import { prettyPhone } from "@/lib/format";
import { rememberLocale, asLocale } from "@/lib/i18n/locale";
import { text } from "@/lib/i18n/messages";
import { audit, db, s } from "@/lib/mutate";
import { enqueue, sendSoon } from "@/lib/outbox";
import { allowFor, allowIp } from "@/lib/ratelimit";
import { dropLink, hasLink, issueLink, linkUrl, openLink, useClaim } from "@/lib/request-links";
import { trackRequest } from "@/lib/repo";
import { showsEmailCodeOnScreen } from "@/lib/email";
import { showsCodeOnScreen } from "@/lib/sms";

/** In a demo with no real email or SMS provider, the link is also shown on screen, like a sign-in code. Never on a live site. */
const demoShows = (byEmail: boolean) => (byEmail ? showsEmailCodeOnScreen() : showsCodeOnScreen());

/** Trades the secret after "#" in a link for this browser's cookie. The page reads it; the server never sees it in a URL. */
export async function openRequestLink(ref: string, token: string): Promise<{ ok: boolean }> {
  if (!(await allowIp("track"))) return { ok: false };
  return { ok: await openLink(ref, token) };
}

/** "Not my computer": forgets this request in this browser and stops the link it used. */
export async function forgetRequest(ref: string) {
  await dropLink(ref);
  redirect("/track");
}

/** Saves a request sent without an account to the account with the email the claim link went to, and signs in. Clicking
 *  the link proves the address. A new account is made from the request's contact record when there is none yet. */
export async function claimRequest(ref: string, token: string): Promise<{ ok: false; error: string } | never> {
  if (!(await allowIp("signIn"))) return { ok: false, error: "tooMany" };
  const d = await db();
  const done = await d.transaction(async (tx) => {
    const claim = await useClaim(ref, token, tx);
    if (!claim) return null;
    const email = claim.email.toLowerCase();
    const [req] = await tx.select({ profileId: s.requests.profileId, accountId: s.profiles.accountId }).from(s.requests)
      .innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).where(eq(s.requests.ref, ref));
    if (!req) return null;
    const [contact] = await tx.select().from(s.accounts).where(eq(s.accounts.id, req.accountId));
    const [owner] = await tx.select().from(s.accounts).where(sql`lower(${s.accounts.email}) = ${email}`);
    if (contact.registeredAt && contact.id !== owner?.id) return null;
    const now = new Date().toISOString();
    if (!owner) {
      // Nobody has this email yet: the request's own contact record becomes the account.
      await tx.update(s.accounts).set({ email, registeredAt: now }).where(eq(s.accounts.id, contact.id));
      await audit(tx, { actor: contact.name, role: "Customer", action: "Saved a request to a new account", entity: ref });
      return { accountId: contact.id, locale: contact.locale };
    }
    if (owner.id !== contact.id) {
      // The email has an account: the request joins it. Each person or business it was for is matched to the account's
      // own record of them, or moved across.
      const theirs = await tx.select().from(s.profiles).where(eq(s.profiles.accountId, owner.id));
      const moving = await tx.select().from(s.profiles).where(eq(s.profiles.accountId, contact.id));
      for (const p of moving) {
        const same = theirs.find((x) => (p.relation === "self" ? x.relation === "self" : x.kind === p.kind && x.relation === p.relation && x.name.toLowerCase() === p.name.toLowerCase()));
        if (same) {
          await tx.update(s.requests).set({ profileId: same.id }).where(eq(s.requests.profileId, p.id));
          if (!same.nationalId && p.nationalId) await tx.update(s.profiles).set({ nationalId: p.nationalId, idMasked: p.idMasked }).where(eq(s.profiles.id, same.id));
        } else {
          await tx.update(s.profiles).set({ accountId: owner.id }).where(eq(s.profiles.id, p.id));
        }
      }
      await tx.update(s.notifications).set({ accountId: owner.id }).where(eq(s.notifications.accountId, contact.id));
    }
    if (!owner.registeredAt) await tx.update(s.accounts).set({ registeredAt: now }).where(eq(s.accounts.id, owner.id));
    await audit(tx, { actor: owner.name, role: "Customer", action: "Saved a request to their account", entity: ref });
    return { accountId: owner.id, locale: owner.locale };
  });
  if (!done) return { ok: false, error: "claim" };
  await startSession("customer", done.accountId);
  await rememberLocale(asLocale(done.locale));
  redirect(`/portal/requests/${ref}`);
}

/** Sends the private link again to the request's own email or phone, after the track page matched both. The message
 *  goes to the contact that was given, so it reaches its owner, never the person asking. */
export async function resendLink(ref: string, contact: string): Promise<{ ok: boolean; to?: string; demoUrl?: string }> {
  if (!(await allowIp("track"))) return { ok: false };
  const found = await trackRequest(ref, contact);
  if (!found) return { ok: false };
  const key = found.ref;
  if (!(await allowFor("trackRef", `link:${key}`))) return { ok: false };
  const d = await db();
  const [row] = await d.select({ contactPhone: s.requests.contactPhone, contactEmail: s.requests.contactEmail, phone: s.accounts.phone, email: s.accounts.email, locale: s.accounts.locale })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(and(eq(s.requests.ref, key)));
  if (!row) return { ok: false };
  const byEmail = contact.includes("@");
  const to = byEmail ? (row.email ?? row.contactEmail) : (row.phone ?? row.contactPhone);
  if (!to) return { ok: false };
  const locale = asLocale(row.locale);
  const url = await d.transaction(async (tx) => {
    const url = linkUrl(key, await issueLink(tx, key));
    const line = text(locale, "sms.linkAgain", { ref: key });
    sendSoon([await enqueue(tx, byEmail
      ? { channel: "email", to, ref: key, mail: { to, subject: text(locale, "email.updateSubject", { ref: key }), text: `${line}\n\n${url}`, footer: text(locale, "email.updateFooter") } }
      : { channel: "sms", to, ref: key, message: `Inzira ${key}: ${line} ${url}` })]);
    return url;
  });
  return { ok: true, to: byEmail ? to : prettyPhone(to), ...(demoShows(byEmail) ? { demoUrl: url } : {}) };
}

/** From the request page: sends the "save to my account" link to the email on the request (never to an address typed
 *  here), for someone who opened it with its private link. */
export async function sendSaveLink(ref: string): Promise<{ ok: boolean; demoUrl?: string }> {
  if (!(await hasLink(ref)) || !(await allowFor("trackRef", `save:${ref}`))) return { ok: false };
  const d = await db();
  const [row] = await d.select({ contactEmail: s.requests.contactEmail, email: s.accounts.email, registeredAt: s.accounts.registeredAt, locale: s.accounts.locale })
    .from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  const to = row && !row.registeredAt ? row.contactEmail : null;
  if (!to) return { ok: false };
  const locale = asLocale(row.locale);
  const url = await d.transaction(async (tx) => {
    const url = linkUrl(ref, await issueLink(tx, ref, "claim", to), "/save");
    sendSoon([await enqueue(tx, { channel: "email", to, ref, mail: { to, subject: text(locale, "email.saveSubject", { ref }), text: text(locale, "email.saveToAccount", { url }), footer: text(locale, "email.updateFooter") } })]);
    return url;
  });
  return { ok: true, ...(demoShows(true) ? { demoUrl: url } : {}) };
}
