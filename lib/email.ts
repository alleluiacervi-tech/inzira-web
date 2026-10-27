// Outgoing email, through Resend's HTTP API (resend.com). Server only.
//
//   RESEND_API_KEY    a key from resend.com/api-keys; on the live site a "Sending access" key for this domain only
//   EMAIL_FROM        "Inzira <no-reply@your-domain>", on a domain verified in Resend (its SPF and DKIM records added)
//   EMAIL_REPLY_TO    where replies go (support); optional
//   EMAIL_DAILY_LIMIT optional: stop at this many messages in 24 hours, below the plan's own quota
//
// Without RESEND_API_KEY a demo or development build prints the message (and sign-in shows the code on screen).
// A live site without it refuses to send, so nothing is silently dropped and a code is never shown on screen.
import { allow } from "./ratelimit";
import { isDemo } from "./sms";

const API = "https://api.resend.com";

export const sendsRealEmail = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
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

/**
 * Sends one message. Throws when it cannot (not configured, Resend refused, a timeout), so a caller that
 * must tell the person (a sign-in code) can say so, and one that need not (an update) can log and go on.
 * A message that may be sent again (the outbox retries) passes an idempotencyKey: Resend then sends it once
 * even if an earlier try went through but its answer was lost.
 */
export async function sendEmail(m: Mail, opts: { idempotencyKey?: string } = {}): Promise<void> {
  if (!sendsRealEmail()) {
    if (!isDemo()) throw new Error("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (see README).");
    console.log(`[email] to ${m.to}: ${m.subject}\n${m.highlight ? `${m.highlight}\n` : ""}${m.text}`);
    return;
  }
  const limit = Number(process.env.EMAIL_DAILY_LIMIT);
  if (limit > 0 && !(await allow("email:day", limit, 24 * 60 * 60e3))) throw new Error("The daily email limit was reached.");
  const text = m.highlight ? `${m.text}\n\n${m.highlight}${m.footer ? `\n\n${m.footer}` : ""}` : `${m.text}${m.footer ? `\n\n${m.footer}` : ""}`;
  const body = {
    from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, text, html: html(m),
    ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
    // A person asked for this message: it is not bulk mail, and auto-replies must not answer it.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  };
  // Resend allows a few requests a second. A burst, a brief outage or a lost answer is tried twice more
  // within a few seconds; a refusal (bad address, unverified domain, quota) is not.
  for (let attempt = 1; ; attempt++) {
    try {
      await resend<{ id: string }>("/emails", { method: "POST", body, idempotencyKey: opts.idempotencyKey });
      return;
    } catch (e) {
      if (attempt >= 3 || !retryable(e)) throw e;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

/** The sending domain from EMAIL_FROM ("Inzira <no-reply@inziraservices.com>" → "inziraservices.com"). */
export const sendingDomain = () => (process.env.EMAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? "";

/**
 * Checks the key and the sending domain without sending anything: used by `npm run check:email`.
 * A "Sending access" key (the safer kind) cannot read domains, so then only the key itself is confirmed.
 */
export async function verifyEmailSettings(): Promise<string> {
  if (!sendsRealEmail()) throw new Error("RESEND_API_KEY and EMAIL_FROM must both be set.");
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
