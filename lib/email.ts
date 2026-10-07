// Outgoing email through Resend (https://resend.com). Needs RESEND_API_KEY and EMAIL_FROM
// (e.g. "Inzira <hello@inzira.rw>", on a domain verified in Resend).
// Without a key, development and demo builds print the message to the server log and sign-in
// shows the code on screen. A live site without a key fails loudly instead of pretending.
import { isDemo } from "./demo";
import { SITE } from "./site";

export type Mail = { to: string; subject: string; text: string; html: string };

/** True when a real email provider is connected. Otherwise the sign-in code is shown on screen. */
export const sendsRealEmail = () => !!process.env.RESEND_API_KEY;

export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!isDemo()) throw new Error("Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (see README).");
    console.log(`[email] to ${mail.to}\n[email] subject: ${mail.subject}\n${mail.text.split("\n").map((l) => `[email] ${l}`).join("\n")}`);
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set. Use an address on a domain verified in Resend, e.g. Inzira <hello@inzira.rw>.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html, reply_to: SITE.email }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.json().then((j: { message?: string }) => j.message, () => undefined);
    throw new Error(`Email provider answered ${res.status}${detail ? `: ${detail}` : ""}`);
  }
}
