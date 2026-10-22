// Checks the outside services end to end, through the same code the site uses. Run it on a staging
// environment with the real keys set, before taking real money:
//
//   TEST_PHONE=788123456 npm run check:providers
//
// - Database: answers, and every migration in ./drizzle is applied.
// - SMS: sends one message to TEST_PHONE (SMS_PROVIDER=africastalking).
// - Mobile money: with PAYMENT_PROVIDER=live (IntouchPay), sends a prompt of CHECK_AMOUNT (default 100)
//   to TEST_PHONE and, if set, TEST_AIRTEL_PHONE, then waits up to 2 minutes. The phone owner must
//   approve it, and on a production account the money is real. PAYMENT_PROVIDER=direct uses MTN and Airtel.
//   With IntouchPay it also reads the account balance, sends the prompt with the site's callback address
//   (NEXT_PUBLIC_SITE_URL, so IntouchPay's logs show whether the callback was delivered), and with CHECK_REFUND=1
//   sends CHECK_AMOUNT back to TEST_PHONE through RequestDeposit, the way refunds are sent (real money on a
//   production account).
// - Storage: writes, reads back and deletes a small file (private Vercel Blob).
//
// Nothing is checked unless its keys are set; skipped checks say why. Exits 1 if any check failed.
import { readdirSync } from "node:fs";
import path from "node:path";

type Outcome = "pass" | "fail" | "skip";
const results: { name: string; outcome: Outcome; detail: string }[] = [];
const record = (name: string, outcome: Outcome, detail: string) => {
  results.push({ name, outcome, detail });
  console.log(`${outcome === "pass" ? "  ok  " : outcome === "fail" ? "  FAIL" : "  skip"}  ${name}: ${detail}`);
};
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const nine = (v?: string) => v?.replace(/\D/g, "").replace(/^250/, "").replace(/^0/, "") ?? "";

console.log("Checking outside services…\n");

// ---------------- database ----------------
try {
  const { db } = await import("../lib/db/index.ts");
  const { sql } = await import("drizzle-orm");
  const d = await db();
  await d.execute(sql`select 1`);
  const expected = readdirSync(path.join(process.cwd(), "drizzle")).filter((f) => f.endsWith(".sql")).length;
  let applied: number | null = null;
  try {
    const rows = (await d.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { rows?: { n: number }[] } & { n: number }[];
    applied = Number((rows.rows ?? rows)[0]?.n ?? 0);
  } catch { /* the migrations table lives elsewhere on some setups */ }
  if (applied !== null && applied < expected) record("Database", "fail", `${applied} of ${expected} migrations applied. Run npm run db:migrate.`);
  else record("Database", "pass", `${process.env.DATABASE_URL ? "Postgres" : "local PGlite"} answers${applied !== null ? `, ${applied} of ${expected} migrations applied` : ""}.`);
} catch (e) {
  record("Database", "fail", errorText(e));
}

// ---------------- SMS ----------------
const phone = nine(process.env.TEST_PHONE);
if (process.env.SMS_PROVIDER !== "africastalking") record("SMS", "skip", "SMS_PROVIDER is not africastalking.");
else if (!/^7\d{8}$/.test(phone)) record("SMS", "skip", "Set TEST_PHONE to a Rwandan mobile number that should receive the test.");
else {
  try {
    const { sendSms } = await import("../lib/sms.ts");
    await sendSms(phone, "Inzira provider check: SMS works.");
    record("SMS", "pass", `Accepted by Africa’s Talking for +250${phone}. Check the phone${process.env.AT_USERNAME === "sandbox" ? " (sandbox: check the simulator instead)" : ""}.`);
  } catch (e) {
    record("SMS", "fail", errorText(e));
  }
}

// ---------------- mobile money ----------------
async function checkPayment(name: string, to: string) {
  const { methodFor, newPrompt, providerStatus } = await import("../lib/payments.ts");
  const direct = process.env.PAYMENT_PROVIDER === "direct";
  if (direct) {
    const expected = name === "Airtel Money" ? "Airtel Money" : "MTN MoMo";
    if (methodFor(to) !== expected) { record(name, "skip", `+250${to} is not an ${expected} number.`); return; }
  }
  const amount = Number(process.env.CHECK_AMOUNT) || 100;
  try {
    const prompt = newPrompt(to);
    const site = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ? process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "") : "";
    const callbackUrl = site ? `${site}/api/payments/callback` : undefined;
    const sent = await prompt.provider.requestToPay({ id: prompt.id, phone9: to, amount, reference: `CHECK-${Date.now()}`, callbackUrl });
    if (callbackUrl) console.log(`        ${name}: callback to ${callbackUrl}`);
    const providerRef = sent.providerTxId ? `${prompt.providerRef}:${sent.providerTxId}` : prompt.providerRef;
    console.log(`        ${name}: prompt sent (${providerRef}), waiting for the result…`);
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const { status, providerTxId } = await providerStatus(providerRef);
      if (status === "paid") { record(name, "pass", `Prompt of ${amount} approved${providerTxId ? `, provider id ${providerTxId}` : ""}.`); return; }
      if (status === "failed") { record(name, "fail", "The prompt was declined, expired or rejected. The API works; check the account and the number."); return; }
    }
    record(name, "fail", "No answer after 2 minutes. The prompt went out; approve it faster, or check the callback and status endpoints.");
  } catch (e) {
    record(name, "fail", errorText(e));
  }
}
const live = process.env.PAYMENT_PROVIDER === "live" || process.env.PAYMENT_PROVIDER === "intouchpay" || process.env.PAYMENT_PROVIDER === "direct";
if (!live) record("Mobile money", "skip", "PAYMENT_PROVIDER is not live, intouchpay or direct.");
else {
  if (!/^7\d{8}$/.test(phone)) record("Mobile money", "skip", "Set TEST_PHONE to a Rwandan mobile number.");
  else await checkPayment(process.env.PAYMENT_PROVIDER === "direct" ? "MTN MoMo" : "IntouchPay", phone);
  const airtelPhone = nine(process.env.TEST_AIRTEL_PHONE);
  if (!/^7\d{8}$/.test(airtelPhone)) record("Second number", "skip", "Set TEST_AIRTEL_PHONE to check a second wallet (072/073 for Airtel).");
  else await checkPayment(process.env.PAYMENT_PROVIDER === "direct" ? "Airtel Money" : "IntouchPay (second number)", airtelPhone);
  if (process.env.PAYMENT_PROVIDER !== "direct") await checkRefund();
}

// IntouchPay only: the balance refunds are sent from, and with CHECK_REFUND=1 one refund-style RequestDeposit.
async function checkRefund() {
  const ip = await import("../lib/intouchpay.ts");
  const { newIntouchRequestId } = await import("../lib/payments.ts");
  let before: number | null = null;
  try { before = await ip.intouchBalance(); record("IntouchPay balance", "pass", `RWF ${before.toLocaleString("en-US")} available for refunds.`); }
  catch (e) { record("IntouchPay balance", "fail", errorText(e)); }
  if (process.env.CHECK_REFUND !== "1") { record("Refund (RequestDeposit)", "skip", "Set CHECK_REFUND=1 to send CHECK_AMOUNT to TEST_PHONE the way refunds are sent."); return; }
  if (!/^7\d{8}$/.test(phone)) { record("Refund (RequestDeposit)", "skip", "Set TEST_PHONE to receive it."); return; }
  const amount = Number(process.env.CHECK_AMOUNT) || 100;
  const requestId = newIntouchRequestId();
  try {
    const sent = await ip.requestIntouchDeposit({ requestId, phone9: phone, amount, reason: "Inzira provider check" });
    let status: string = sent.status;
    for (let i = 0; i < 12 && status === "pending" && sent.transactionId; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      status = await ip.intouchDepositStatus(requestId, sent.transactionId);
    }
    if (sent.transactionId && status === "sent") status = await ip.intouchDepositStatus(requestId, sent.transactionId);
    const after = await ip.intouchBalance().catch(() => null);
    if (status === "sent") record("Refund (RequestDeposit)", "pass", `RWF ${amount} sent to +250${phone} (request ${requestId}, IntouchPay ${sent.transactionId ?? "no id"}${sent.reference ? `, ref ${sent.reference}` : ""}); status confirms it${before !== null && after !== null ? `; balance ${before} → ${after}` : ""}.`);
    else record("Refund (RequestDeposit)", "fail", `Request ${requestId} is still ${status}. Look it up in the IntouchPay portal before sending again.`);
  } catch (e) {
    record("Refund (RequestDeposit)", "fail", e instanceof ip.IntouchRejected ? ip.depositRefusalMessage(e.code, `RWF ${amount}`) : errorText(e));
  }
}

// ---------------- storage ----------------
const blob = !!process.env.BLOB_READ_WRITE_TOKEN || (!!process.env.BLOB_STORE_ID && !!process.env.VERCEL_OIDC_TOKEN);
if (!blob) record("Document storage", "skip", "No Vercel Blob credentials (BLOB_READ_WRITE_TOKEN).");
else {
  try {
    const { deleteFile, putFile, readFile } = await import("../lib/storage.ts");
    const key = `provider-check/${Date.now()}.txt`;
    const text = `Inzira storage check ${new Date().toISOString()}`;
    await putFile(key, new TextEncoder().encode(text), "text/plain");
    const back = await readFile(key);
    await deleteFile(key);
    const gone = (await readFile(key)) === null;
    if (back?.toString() !== text) record("Document storage", "fail", "Wrote a file but read back something different.");
    else if (!gone) record("Document storage", "fail", "Wrote and read a file, but it was still there after deleting.");
    else record("Document storage", "pass", "Private Blob: write, read and delete all work.");
  } catch (e) {
    record("Document storage", "fail", errorText(e));
  }
}

const failed = results.filter((r) => r.outcome === "fail").length;
const passed = results.filter((r) => r.outcome === "pass").length;
console.log(`\n${passed} passed, ${failed} failed, ${results.length - passed - failed} skipped.`);
process.exit(failed ? 1 : 0);
