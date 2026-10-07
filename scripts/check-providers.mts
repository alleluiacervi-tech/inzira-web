// Checks the outside services end to end, through the same code the site uses. Run it on a staging
// environment with the real keys set, before taking real money:
//
//   TEST_EMAIL=you@example.com TEST_PHONE=788123456 npm run check:providers
//
// - Database: answers, and every migration in ./drizzle is applied.
// - Email: sends one message to TEST_EMAIL through Resend (RESEND_API_KEY, EMAIL_FROM).
// - Private links: signs a link for an existing request and checks it (ACCESS_SECRET).
// - Mobile money: with PAYMENT_PROVIDER=live, sends a prompt of CHECK_AMOUNT (default 100) to
//   TEST_PHONE for MTN and, if set, TEST_AIRTEL_PHONE for Airtel, then waits up to 2 minutes for the
//   result. In the MTN sandbox no phone rings and the prompt succeeds on its own; on a live account
//   the phone owner must approve it, and the money is real.
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

// ---------------- email ----------------
const to = process.env.TEST_EMAIL?.trim().toLowerCase();
if (!process.env.RESEND_API_KEY) record("Email", "skip", "RESEND_API_KEY is not set.");
else if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) record("Email", "skip", "Set TEST_EMAIL to an address that should receive the test.");
else {
  try {
    const { sendEmail } = await import("../lib/email.ts");
    const { testMail } = await import("../lib/mail.ts");
    await sendEmail(testMail(to));
    record("Email", "pass", `Accepted by Resend for ${to}. Check the inbox (and spam)${/@resend\.dev>?$/i.test(process.env.EMAIL_FROM ?? "") ? "; sending from resend.dev only reaches your own Resend account address" : ""}.`);
  } catch (e) {
    record("Email", "fail", errorText(e));
  }
}

// ---------------- private links ----------------
try {
  const { accessPath, verifyAccess } = await import("../lib/access.ts");
  const { db, schema } = await import("../lib/db/index.ts");
  const [row] = await (await db()).select({ ref: schema.requests.ref, version: schema.requests.accessVersion }).from(schema.requests).limit(1);
  if (!process.env.ACCESS_SECRET) record("Private links", "skip", "ACCESS_SECRET is not set.");
  else if (!row) record("Private links", "skip", "No request in the database to sign a link for.");
  else {
    const [, , , ref, token] = accessPath(row.ref, row.version).split("/");
    const good = await verifyAccess(decodeURIComponent(ref), token);
    const bad = await verifyAccess(decodeURIComponent(ref), token.replace(/.$/, (c) => (c === "a" ? "b" : "a")));
    record("Private links", good && !bad ? "pass" : "fail", good && !bad ? "A link verifies, and a tampered one is refused." : "Link signing and checking disagree.");
  }
} catch (e) {
  record("Private links", "fail", errorText(e));
}

// ---------------- mobile money ----------------
async function checkPayment(name: string, to: string) {
  const { methodFor, providerFor, providerStatus } = await import("../lib/payments.ts");
  const expected = name === "Airtel Money" ? "Airtel Money" : "MTN MoMo";
  if (methodFor(to) !== expected) { record(name, "skip", `+250${to} is not an ${expected} number.`); return; }
  const amount = Number(process.env.CHECK_AMOUNT) || 100;
  try {
    const { providerRef } = await providerFor(to).requestToPay({ phone9: to, amount, reference: `CHECK-${Date.now()}` });
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
if (process.env.PAYMENT_PROVIDER !== "live") record("Mobile money", "skip", "PAYMENT_PROVIDER is not live.");
else {
  if (!/^7\d{8}$/.test(phone)) record("MTN MoMo", "skip", "Set TEST_PHONE to an MTN number.");
  else await checkPayment("MTN MoMo", phone);
  const airtelPhone = nine(process.env.TEST_AIRTEL_PHONE);
  if (!/^7\d{8}$/.test(airtelPhone)) record("Airtel Money", "skip", "Set TEST_AIRTEL_PHONE to an Airtel number (072/073).");
  else await checkPayment("Airtel Money", airtelPhone);
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
