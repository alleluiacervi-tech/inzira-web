// Checks that this machine can send email through the mailbox the site will use. Run it from where the app will run
// (a Vercel preview deployment's shell is not available, so run it on the server or a staging build), with the real
// settings in the environment:
//
//   SMTP_HOST=smtp.hostinger.com SMTP_USER=no-reply@your-domain SMTP_PASS=… EMAIL_FROM="Inzira <no-reply@your-domain>" \
//   TEST_EMAIL=you@gmail.com npm run check:email
//
// 1. Network: can this machine open a connection to the mail server on 465, 587 and 25? A provider that blocks
//    outbound mail ports shows up here, before anything else.
// 2. Login: does the server accept SMTP_USER and SMTP_PASS on the port the site will use (SMTP_PORT, default 465)?
// 3. Delivery: with TEST_EMAIL, sends one real message through the same code the site uses. Check the inbox AND the
//    spam folder, then look at the message headers for "spf=pass" and "dkim=pass": without both, codes will land in spam.
//
// Exits 1 if anything failed.
import net from "node:net";

const host = process.env.SMTP_HOST ?? "";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
let failed = false;
const line = (ok: boolean | null, name: string, detail: string) => {
  if (ok === false) failed = true;
  console.log(`${ok === true ? "  ok  " : ok === false ? "  FAIL" : "  skip"}  ${name}: ${detail}`);
};

const connect = (port: number) => new Promise<string>((resolve) => {
  const socket = net.connect({ host, port, timeout: 6000 });
  socket.once("connect", () => { socket.destroy(); resolve("open"); });
  socket.once("timeout", () => { socket.destroy(); resolve("timed out (blocked, or the server is not answering)"); });
  socket.once("error", (e) => resolve(errorText(e)));
});

console.log("Checking email…\n");
if (!host) { line(false, "Settings", "SMTP_HOST is not set"); process.exit(1); }

for (const port of [465, 587, 25]) {
  const r = await connect(port);
  line(port === 25 ? null : r === "open", `Network, ${host}:${port}`, r === "open" ? "connects" : r);
}

const { sendsRealEmail, sendEmail, verifyEmailSettings } = await import("../lib/email.ts");
if (!sendsRealEmail()) {
  line(false, "Settings", "SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM must all be set");
  process.exit(1);
}
try {
  const started = Date.now();
  await verifyEmailSettings();
  line(true, `Login, port ${process.env.SMTP_PORT || 465}`, `the server accepted the login in ${Date.now() - started} ms`);
} catch (e) {
  line(false, `Login, port ${process.env.SMTP_PORT || 465}`, errorText(e));
}

const to = process.env.TEST_EMAIL;
if (!to) line(null, "Delivery", "set TEST_EMAIL to send one real message");
else {
  try {
    const started = Date.now();
    await sendEmail({
      to, subject: "Inzira email check", text: "This message was sent by npm run check:email. If you can read it, the mailbox settings work.", highlight: "123456",
      footer: "Open the message headers and look for spf=pass and dkim=pass. If either is missing, set up SPF, DKIM and DMARC for the sending domain.",
    });
    line(true, "Delivery", `sent to ${to} in ${Date.now() - started} ms. Check the inbox and the spam folder.`);
  } catch (e) {
    line(false, "Delivery", errorText(e));
  }
}
console.log(failed ? "\nSomething failed. Fix it before using this mailbox for sign-in codes." : "\nDone.");
process.exit(failed ? 1 : 0);
