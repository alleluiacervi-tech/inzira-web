// Outgoing email, through Nodemailer over SMTP: a business mailbox (Hostinger, Google Workspace, Microsoft 365 …)
// or any transactional provider that offers SMTP. Server only.
//
//   SMTP_HOST, SMTP_PORT (465 by default; 465 is implicit TLS, 587 is STARTTLS), SMTP_USER, SMTP_PASS, SMTP_SECURE (1 or 0, only to override)
//   EMAIL_FROM        "Inzira <no-reply@your-domain>", an address on the domain whose SPF, DKIM and DMARC are set
//   EMAIL_REPLY_TO    where replies go (support); optional
//   EMAIL_DAILY_LIMIT messages the mailbox may send in 24 hours; the app stops a little short of it (default 400)
//
// Without SMTP settings a demo or development build prints the message (and sign-in shows the code on screen).
// A live site without them refuses to send, so nothing is silently dropped and a code is never shown on screen.
import nodemailer, { type Transporter } from "nodemailer";
import { allow } from "./ratelimit";
import { isDemo } from "./sms";

export const sendsRealEmail = () => !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.EMAIL_FROM;
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

const g = globalThis as unknown as { __inziraMail?: Transporter };
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

/**
 * Sends one message. Throws when it cannot (not configured, the server refused, a timeout), so a caller that
 * must tell the person (a sign-in code) can say so, and one that need not (an update) can log and go on.
 */
export async function sendEmail(m: Mail): Promise<void> {
  if (!sendsRealEmail()) {
    if (!isDemo()) throw new Error("Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM (see README).");
    console.log(`[email] to ${m.to}: ${m.subject}\n${m.highlight ? `${m.highlight}\n` : ""}${m.text}`);
    return;
  }
  // Stop a little short of the mailbox's own daily cap, so a burst can never get the mailbox suspended.
  const limit = Number(process.env.EMAIL_DAILY_LIMIT) || 400;
  if (!(await allow("email:day", limit, 24 * 60 * 60e3))) throw new Error("The daily email limit was reached.");
  const text = m.highlight ? `${m.text}\n\n${m.highlight}${m.footer ? `\n\n${m.footer}` : ""}` : `${m.text}${m.footer ? `\n\n${m.footer}` : ""}`;
  await transporter().sendMail({
    from: process.env.EMAIL_FROM, replyTo: process.env.EMAIL_REPLY_TO || undefined, to: m.to,
    subject: m.subject, text, html: html(m),
    // A person asked for this message: it is not bulk mail, and auto-replies must not answer it.
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
  });
}

/** Checks the mailbox settings without sending anything: used by `npm run check:email`. */
export async function verifyEmailSettings(): Promise<void> {
  if (!sendsRealEmail()) throw new Error("SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM must all be set.");
  await transporter().verify();
}
