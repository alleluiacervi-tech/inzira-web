// Outgoing email. Nodemailer sends through any SMTP server (the host’s own mail,
// or a relay such as Resend, Postmark or Amazon SES in SMTP mode).
//
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, MAIL_FROM
//   SMTP_SECURE=1 for implicit TLS on port 465. MAIL_REPLY_TO defaults to the company address.
//
// With no SMTP settings, development and INZIRA_DEMO=1 print the message and sign-in
// shows the code on screen. A live site without SMTP refuses to send.
import nodemailer, { type Transporter } from "nodemailer";
import { normaliseEmail } from "./email";
import { isDemo } from "./runtime";
import { isSet, SITE, siteOrigin } from "./site";

export type Mail = {
  to: string;
  subject: string;
  preheader: string;
  title: string;
  paragraphs: string[];
  /** A one-time code, set in its own block so it is easy to read and to copy. */
  code?: string;
  cta?: { href: string; label: string };
};

export const mailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function absolute(href: string) {
  if (/^https?:\/\//.test(href)) return href;
  const origin = siteOrigin();
  return origin ? `${origin}${href.startsWith("/") ? href : `/${href}`}` : null;
}

/** Plain text and HTML for one message. HTML is escaped; nothing in `mail` is treated as markup. */
export function renderMail(mail: Mail): { text: string; html: string } {
  const lines = [mail.title, "", ...mail.paragraphs];
  if (mail.code) lines.push("", `Code: ${mail.code}`, "It expires in 10 minutes. Never share it.");
  const cta = mail.cta ? absolute(mail.cta.href) : null;
  if (cta && mail.cta) lines.push("", `${mail.cta.label}: ${cta}`);
  lines.push("", "—", SITE.legalName, isSet(SITE.address) ? `${SITE.address}, ${SITE.city}` : SITE.city, SITE.email);
  lines.push("", "You received this because you have an account or a request with Inzira.");

  const paragraphs = mail.paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#2b3446;">${esc(p)}</p>`).join("");
  const code = mail.code
    ? `<p style="margin:8px 0 20px;padding:18px 16px;background:#f8eed6;border-radius:8px;text-align:center;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:32px;letter-spacing:8px;color:#0f1626;font-weight:700;">${esc(mail.code)}</p>
       <p style="margin:0 0 20px;font-size:13px;line-height:1.5;color:#576075;">It expires in 10 minutes. Never share it with anyone, including someone who says they are from Inzira.</p>`
    : "";
  const button = cta && mail.cta
    ? `<p style="margin:8px 0 24px;"><a href="${esc(cta)}" style="display:inline-block;background:#142850;color:#fafbfc;text-decoration:none;font-weight:700;font-size:15px;padding:12px 18px;border-radius:8px;">${esc(mail.cta.label)}</a></p>`
    : "";
  const where = isSet(SITE.address) ? `${esc(SITE.address)}, ${esc(SITE.city)}` : esc(SITE.city);

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(mail.subject)}</title></head>
<body style="margin:0;padding:0;background:#fafbfc;">
  <div style="display:none;max-height:0;overflow:hidden;color:#fafbfc;">${esc(mail.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafbfc;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e1e5ec;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#142850;padding:22px 28px;">
          <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#fafbfc;letter-spacing:0.2px;">Inzira</p>
          <p style="margin:6px 0 0;height:3px;width:36px;background:#c9962e;font-size:0;line-height:0;">&nbsp;</p>
        </td></tr>
        <tr><td style="padding:28px 28px 8px;font-family:Georgia,'Times New Roman',serif;">
          <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:500;color:#0f1626;">${esc(mail.title)}</h1>
        </td></tr>
        <tr><td style="padding:0 28px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          ${paragraphs}
          ${code}
          ${button}
        </td></tr>
        <tr><td style="padding:8px 28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;border-top:1px solid #e1e5ec;">
          <p style="margin:16px 0 0;font-size:12.5px;line-height:1.5;color:#576075;">${esc(SITE.legalName)} · ${where}<br>${esc(SITE.email)}</p>
          <p style="margin:8px 0 0;font-size:12.5px;line-height:1.5;color:#576075;">You received this because you have an account or a request with Inzira. We email instead of texting, so this does not use your airtime.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { text: lines.join("\n"), html };
}

let cached: Transporter | null = null;
function transporter() {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });
  return cached;
}

/** Sends one message. Throws when the address is bad, or when a live site has no SMTP settings. */
export async function sendMail(mail: Mail): Promise<void> {
  const to = normaliseEmail(mail.to);
  if (!to) throw new Error("That is not an email address; message not sent.");
  const rendered = renderMail(mail);
  if (!mailConfigured()) {
    if (!isDemo()) throw new Error("Email is not configured. Set SMTP_HOST and MAIL_FROM.");
    console.log(`[mail] to ${to}: ${mail.subject}\n${rendered.text}`);
    return;
  }
  await transporter().sendMail({
    from: process.env.MAIL_FROM,
    to,
    replyTo: process.env.MAIL_REPLY_TO || SITE.email,
    subject: mail.subject,
    text: rendered.text,
    html: rendered.html,
  });
}

/** The sign-in and request-confirmation code. */
export function codeMail(input: { to: string; name: string; code: string }): Mail {
  return {
    to: input.to,
    subject: `${input.code} is your Inzira code`,
    preheader: `Your code is ${input.code}. It expires in 10 minutes.`,
    title: "Your sign-in code",
    paragraphs: [`Hello ${input.name}, use this code to continue. If you didn’t ask for it, you can ignore this email.`],
    code: input.code,
  };
}
