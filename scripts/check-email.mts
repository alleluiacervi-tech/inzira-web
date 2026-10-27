// Checks that the site can send email through Resend, with the real settings in the environment:
//
//   RESEND_API_KEY=re_… EMAIL_FROM="Inzira <no-reply@your-domain>" TEST_EMAIL=you@gmail.com npm run check:email
//
// 1. Settings: are RESEND_API_KEY and EMAIL_FROM set, and does EMAIL_FROM have an address?
// 2. Key and domain: does Resend accept the key, and is the sending domain verified? A "Sending access" key cannot
//    read domains, so with one only the key is confirmed here, and the domain by the delivery below.
// 3. Delivery: with TEST_EMAIL, sends one real message through the same code the site uses. Check the inbox AND the
//    spam folder, then look at the message headers for "spf=pass", "dkim=pass" and "dmarc=pass".
//    TEST_EMAIL=delivered@resend.dev is Resend's own test inbox: it checks the key and domain without a real mailbox.
//
// Exits 1 if anything failed.
import { sendEmail, sendingDomain, sendsRealEmail, verifyEmailSettings } from "../lib/email.ts";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
let failed = false;
const line = (ok: boolean | null, name: string, detail: string) => {
  if (ok === false) failed = true;
  console.log(`${ok === true ? "  ok  " : ok === false ? "  FAIL" : "  skip"}  ${name}: ${detail}`);
};

console.log("Checking email…\n");
if (!sendsRealEmail()) {
  line(false, "Settings", "RESEND_API_KEY and EMAIL_FROM must both be set");
  process.exit(1);
}
if (!process.env.RESEND_API_KEY!.startsWith("re_")) line(false, "Settings", "RESEND_API_KEY does not look like a Resend key (they start with re_)");
line(sendingDomain() ? true : false, "Settings", sendingDomain() ? `sending as ${process.env.EMAIL_FROM}` : `EMAIL_FROM has no address: ${process.env.EMAIL_FROM}`);

try {
  line(true, "Key and domain", await verifyEmailSettings());
} catch (e) {
  line(false, "Key and domain", errorText(e));
}

const to = process.env.TEST_EMAIL;
if (!to) line(null, "Delivery", "set TEST_EMAIL to send one real message (delivered@resend.dev needs no mailbox)");
else {
  try {
    const started = Date.now();
    await sendEmail({
      to, subject: "Inzira email check", text: "This message was sent by npm run check:email. If you can read it, the email settings work.", highlight: "123456",
      footer: "Open the message headers and look for spf=pass, dkim=pass and dmarc=pass. If one is missing, check the domain's DNS records at resend.com/domains.",
    });
    line(true, "Delivery", `Resend accepted it for ${to} in ${Date.now() - started} ms. Check the inbox and the spam folder, and the log at resend.com/emails.`);
  } catch (e) {
    line(false, "Delivery", errorText(e));
  }
}
console.log(failed ? "\nSomething failed. Fix it before relying on email for sign-in codes." : "\nDone.");
process.exit(failed ? 1 : 0);
