// Outgoing email. Server only. Two providers, either or both:
//
//   Resend (resend.com), the main one:
//     RESEND_API_KEY      a "Sending access" key for the sending domain
//     EMAIL_FROM          "Inzira <no-reply@your-domain>", on a domain verified in Resend
//     RESEND_DAILY_LIMIT  optional: stop using Resend after this many messages in 24 hours
//   SMTP (a business mailbox such as Hostinger), the backup:
//     SMTP_HOST, SMTP_PORT (465 by default; 465 is implicit TLS, 587 is STARTTLS), SMTP_USER, SMTP_PASS, SMTP_SECURE (1/0 to override)
//     SMTP_FROM           the mailbox's own address as sender (default EMAIL_FROM); most mailboxes refuse any other
//     SMTP_DAILY_LIMIT    messages the mailbox may send in 24 hours; the app stops short of it (default 400)
//   EMAIL_REPLY_TO        where replies go (support); optional, used by both
//   EMAIL_PROVIDER        optional: "smtp" sends through SMTP only, "resend" through Resend only.
//                         Unset: Resend first, and SMTP whenever Resend cannot send (its daily or monthly quota is
//                         used up, it is down, or the key or domain stopped working).
//
// With neither, a demo or development build prints the message (and sign-in shows the code on screen).
// A live site with neither refuses to send, so nothing is silently dropped and a code is never shown on screen.
import nodemailer, { type Transporter } from "nodemailer";
import { allow } from "./ratelimit";
import { isDemo } from "./sms";

const API = "https://api.resend.com";

export type Provider = "resend" | "smtp";
const resendSet = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
const smtpSet = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!(process.env.SMTP_FROM || process.env.EMAIL_FROM);
/** The providers to try, in order. */
export function providers(): Provider[] {
  const only = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (only === "smtp") return smtpSet() ? ["smtp"] : [];
  if (only === "resend") return resendSet() ? ["resend"] : [];
  return [...(resendSet() ? ["resend" as const] : []), ...(smtpSet() ? ["smtp" as const] : [])];
}
export const sendsRealEmail = () => providers().length > 0;
/** Codes may be shown on screen only in development and demo builds, and only without a real mailbox. */
export const showsEmailCodeOnScreen = () => isDemo() && !sendsRealEmail();
/**
 * example.com and .test are reserved (RFC 2606). They can never be a real person's mailbox, so they mark the
 * documented sample accounts. A live site never shows their codes on screen: anyone could type the address,
 * and the sample owner opens the whole staff console.
 */
export const isReservedTestEmail = (email: string) => {
  const host = email.trim().toLowerCase().split("@")[1] ?? "";
  return host === "example.com" || host === "inzira.test" || host.endsWith(".test");
};
/** An email code can reach the person: by email, or on screen in a demo. */
export const canDeliverEmailCodes = () => sendsRealEmail() || showsEmailCodeOnScreen();

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Mail = {
  to: string;
  subject: string;
  /** Plain text. Also what a demo prints. */
  text: string;
  /** Shown big, e.g. a sign-in code. */
  highlight?: string;
  /** A short line under the message, e.g. why they got it. */
  footer?: string;
};

/** The same message as HTML: one column, system fonts, no images, readable with images and styles off. */
function html(m: Mail) {
  const paragraphs = m.text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#0f1626">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const code = m.highlight ? `<p style="margin:8px 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;color:#142850;font-family:ui-monospace,Menlo,Consolas,monospace">${esc(m.highlight)}</p>` : "";
  const foot = m.footer ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#576075">${esc(m.footer)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f4f6f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif"><div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e1e5ec;border-radius:12px;padding:28px"><p style="margin:0 0 20px;font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#142850">inzira</p>${paragraphs}${code}${foot}</div></body></html>`;
}

/** A refusal from Resend, with its error name (validation_error, daily_quota_exceeded, …). */
export class EmailError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = "EmailError"; }
}

/** One call to the Resend API. Answers with the parsed body, or throws an EmailError. */
async function resend<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // A hung request must not hold a sign-in open: fail in seconds, then the caller says so.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new EmailError(`Resend could not be reached: ${e instanceof Error ? e.message : String(e)}`, 0, "network_error");
  }
  const body = (await res.json().catch(() => null)) as { name?: string; message?: string } | null;
  if (res.ok) return body as T;
  const code = body?.name ?? "unknown_error";
  // The outbox (lib/outbox.ts) waits an hour without using up an attempt on this wording.
  if (code === "daily_quota_exceeded" || code === "monthly_quota_exceeded") throw new EmailError(`The ${code.split("_")[0]} email limit was reached (Resend).`, res.status, code);
  throw new EmailError(`Resend refused the request (${res.status} ${code}): ${body?.message ?? res.statusText}`, res.status, code);
}

const retryable = (e: unknown) => e instanceof EmailError && (e.code === "rate_limit_exceeded" || e.code === "concurrent_idempotent_requests" || e.status === 0 || e.status >= 500);
/** Resend failed for a reason that is not about this message, so the backup may send it: a quota, an outage,
 *  a timeout, or a key or domain that stopped working. A bad address (400, 422) would fail there too. */
const backupMaySend = (e: unknown) => !(e instanceof EmailError) || e.status === 0 || e.status === 401 || e.status === 403 || e.status === 429 || e.status >= 500;

// After a quota error Resend is skipped until it resets (daily: midnight UTC; monthly: checked again hourly),
// so every message does not first wait on a refusal. Per server instance; a new one simply asks once.
const g = globalThis as unknown as { __inziraMail?: Transporter; __inziraResendPausedUntil?: number };
function pauseResend(e: unknown) {
  if (!(e instanceof EmailError)) return;
  if (e.code === "daily_quota_exceeded") { const t = new Date(); t.setUTCHours(24, 0, 0, 0); g.__inziraResendPausedUntil = t.getTime(); }
  if (e.code === "monthly_quota_exceeded") g.__inziraResendPausedUntil = Date.now() + 3600e3;
}
const resendPaused = () => (g.__inziraResendPausedUntil ?? 0) > Date.now();

function transporter(): Transporter {
  if (g.__inziraMail) return g.__inziraMail;
  const port = Number(process.env.SMTP_PORT) || 465;
  // Port 465 is implicit TLS; others upgrade with STARTTLS. SMTP_SECURE=1 or 0 overrides that for a provider that differs.
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465;
  g.__inziraMail = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // A STARTTLS connection must upgrade: it never continues in the clear.
    requireTLS: !secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // A hung mail server must not hold a sign-in open: fail in seconds, then the caller says so.
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return g.__inziraMail;
}

// A person asked for this message: it is not bulk mail, and auto-replies must not answer it.
const HEADERS = { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" };
const plain = (m: Mail) => m.highlight ? `${m.text}\n\n${m.highlight}${m.footer ? `\n\n${m.footer}` : ""}` : `${m.text}${m.footer ? `\n\n${m.footer}` : ""}`;

async function viaResend(m: Mail, idempotencyKey?: string) {
  const limit = Number(process.env.RESEND_DAILY_LIMIT);
  if (limit > 0 && !(await allow("email:resend:day", limit, 24 * 60 * 60e3))) throw new EmailError("The daily email limit was reached (RESEND_DAILY_LIMIT).", 429, "daily_quota_exceeded");
  const body = {
    from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, text: plain(m), html: html(m),
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    headers: HEADERS,
  };
  // Resend allows a few requests a second. A burst, a brief outage or a lost answer is tried twice more
  // within a few seconds; a refusal (bad address, unverified domain, quota) is not.
  for (let attempt = 1; ; attempt++) {
    try {
      await resend<{ id: string }>("/emails", { method: "POST", body, idempotencyKey });
      return;
    } catch (e) {
      if (attempt >= 3 || !retryable(e)) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

async function viaSmtp(m: Mail) {
  // Stop a little short of the mailbox's own daily cap, so a burst can never get the mailbox suspended.
  // EMAIL_DAILY_LIMIT is the older name, from before Resend.
  const limit = Number(process.env.SMTP_DAILY_LIMIT || process.env.EMAIL_DAILY_LIMIT) || 400;
  if (!(await allow("email:day", limit, 24 * 60 * 60e3))) throw new Error("The daily email limit was reached (SMTP_DAILY_LIMIT).");
  await transporter().sendMail({
    from: process.env.SMTP_FROM || process.env.EMAIL_FROM, replyTo: process.env.EMAIL_REPLY_TO || undefined, to: m.to,
    subject: m.subject, text: plain(m), html: html(m), headers: HEADERS,
  });
}

/**
 * Sends one message and says which provider took it. Throws when none could (not configured, refused, a timeout),
 * so a caller that must tell the person (a sign-in code) can say so, and one that need not (an update) can log and go on.
 * A message that may be sent again (the outbox retries) passes an idempotencyKey: Resend then sends it once even if
 * an earlier try went through but its answer was lost. `via` forces one provider (npm run check:email).
 */
export async function sendEmail(m: Mail, opts: { idempotencyKey?: string; via?: Provider } = {}): Promise<Provider | "log"> {
  const order = opts.via ? providers().filter((p) => p === opts.via) : providers();
  if (!order.length) {
    if (opts.via) throw new Error(`${opts.via === "smtp" ? "SMTP" : "Resend"} is not configured.`);
    if (!isDemo()) throw new Error("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM, or the SMTP settings (see README).");
    console.log(`[email] to ${m.to}: ${m.subject}\n${m.highlight ? `${m.highlight}\n` : ""}${m.text}`);
    return "log";
  }
  let failure: unknown;
  for (const provider of order) {
    const backup = provider !== order[0];
    if (provider === "resend" && resendPaused() && order.length > 1 && !opts.via) {
      failure ??= new EmailError("The email limit was reached earlier (Resend); waiting for it to reset.", 429, "daily_quota_exceeded");
      continue;
    }
    try {
      if (provider === "resend") await viaResend(m, opts.idempotencyKey); else await viaSmtp(m);
      if (backup) console.warn(`[email] sent through ${provider} because ${order[0]} could not: ${failure instanceof Error ? failure.message : String(failure)}`);
      return provider;
    } catch (e) {
      if (provider === "resend") pauseResend(e);
      // The first error is the one to report: it says why the main provider failed.
      failure ??= e;
      if (provider === "resend" && !backupMaySend(e)) break;
    }
  }
  throw failure ?? new Error("Email could not be sent.");
}

/** The sending domain from EMAIL_FROM ("Inzira <no-reply@inziraservices.com>" → "inziraservices.com"). */
export const sendingDomain = () => (process.env.EMAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? "";

/**
 * Checks Resend's key and sending domain without sending anything: used by `npm run check:email`.
 * A "Sending access" key (the safer kind) cannot read domains, so then only the key itself is confirmed.
 */
export async function verifyResend(): Promise<string> {
  if (!resendSet()) throw new Error("RESEND_API_KEY and EMAIL_FROM must both be set.");
  const domain = sendingDomain();
  if (!domain) throw new Error(`EMAIL_FROM has no address: ${process.env.EMAIL_FROM}`);
  try {
    const { data } = await resend<{ data: { name: string; status: string }[] }>("/domains");
    const found = data.find((d) => d.name.toLowerCase() === domain);
    if (!found) throw new Error(`${domain} is not added in Resend. Add it at resend.com/domains and put its DNS records in place.`);
    if (found.status !== "verified") throw new Error(`${domain} is "${found.status}" in Resend, not verified. Check its DNS records at resend.com/domains.`);
    return `${domain} is verified in Resend.`;
  } catch (e) {
    if (e instanceof EmailError && e.code === "restricted_api_key" && e.status === 401) return `the key is valid and limited to sending (the domain is checked when a message goes out).`;
    throw e;
  }
}

/** Logs in to the SMTP server without sending anything: used by `npm run check:email`. */
export async function verifySmtp(): Promise<void> {
  if (!smtpSet()) throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM (or EMAIL_FROM) must all be set.");
  await transporter().verify();
}
