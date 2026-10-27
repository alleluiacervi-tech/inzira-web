// Checks that the site can send email, through each provider that is set, with the real settings in the environment:
//
//   RESEND_API_KEY=re_… EMAIL_FROM="Inzira <no-reply@your-domain>" \
//   SMTP_HOST=smtp.hostinger.com SMTP_USER=no-reply@your-domain SMTP_PASS=… \
//   TEST_EMAIL=you@gmail.com npm run check:email
//
// 1. Order: which provider sends first, and which one takes over when it cannot.
// 2. Resend: is the key accepted, and is the sending domain verified? A "Sending access" key cannot read domains,
//    so with one only the key is confirmed here, and the domain by the delivery below.
// 3. SMTP: does the server accept SMTP_USER and SMTP_PASS on SMTP_PORT (default 465)?
// 4. Delivery: with TEST_EMAIL, sends one real message through EACH provider, using the same code the site uses.
//    Check the inbox AND the spam folder, then look at the message headers for "spf=pass", "dkim=pass" and "dmarc=pass".
//
// Exits 1 if anything failed.
import { providers, sendEmail, verifyResend, verifySmtp, type Provider } from "../lib/email.ts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
let failed = false;
const line = (ok: boolean | null, name: string, detail: string) => {
  if (ok === false) failed = true;
  console.log(`${ok === true ? "  ok  " : ok === false ? "  FAIL" : "  skip"}  ${name}: ${detail}`);
};
const label = (p: Provider) => (p === "resend" ? "Resend" : "SMTP");

console.log("Checking email…\n");
const order = providers();
if (!order.length) {
  line(false, "Settings", "set RESEND_API_KEY and EMAIL_FROM, or SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM");
  process.exit(1);
}
line(true, "Order", order.map(label).join(", then ") + (order.length === 1 ? " (no backup)" : ""));

if (order.includes("resend")) {
  if (!process.env.RESEND_API_KEY!.startsWith("re_")) line(false, "Resend", "RESEND_API_KEY does not look like a Resend key (they start with re_)");
  try { line(true, "Resend", await verifyResend()); } catch (e) { line(false, "Resend", errorText(e)); }
}
if (order.includes("smtp")) {
  try {
    const started = Date.now();
    await verifySmtp();
    line(true, "SMTP", `${process.env.SMTP_HOST} accepted the login on port ${process.env.SMTP_PORT || 465} in ${Date.now() - started} ms`);
  } catch (e) { line(false, "SMTP", errorText(e)); }
}

const to = process.env.TEST_EMAIL;
if (!to) line(null, "Delivery", "set TEST_EMAIL to send one real message through each provider");
else for (const via of order) {
  try {
    const started = Date.now();
    await sendEmail({
      to, subject: `Inzira email check (${label(via)})`, text: `This message was sent through ${label(via)} by npm run check:email. If you can read it, those settings work.`, highlight: "123456",
      footer: "Open the message headers and look for spf=pass, dkim=pass and dmarc=pass. If one is missing, check the sending domain's DNS records.",
    }, { via });
    line(true, `Delivery, ${label(via)}`, `accepted for ${to} in ${Date.now() - started} ms. Check the inbox and the spam folder.`);
  } catch (e) {
    line(false, `Delivery, ${label(via)}`, errorText(e));
  }
}
console.log(failed ? "\nSomething failed. Fix it before relying on email for sign-in codes." : "\nDone.");
process.exit(failed ? 1 : 0);
