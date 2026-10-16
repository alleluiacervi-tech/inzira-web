// Checks the database-level guarantees the screens rely on, against a throwaway in-memory database:
// identity numbers are encrypted at rest, the message outbox sends and retries, one payment prompt per request,
// authenticator codes work once. Run: npm run check:backend
process.env.PGLITE_DIR = "memory://";
process.env.INZIRA_DEMO = "1";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

const { db, schema: s } = await import("../lib/db/index.ts");
const { protectIdentity, rekeyIdentity } = await import("../lib/db/protect.ts");
const { isUniqueViolation } = await import("../lib/db/errors.ts");
const { open } = await import("../lib/crypto.ts");
const { enqueue, deliverDue, counts, sendNow } = await import("../lib/outbox.ts");
const { checkSecondStep } = await import("../lib/second-step.ts");
const { seal } = await import("../lib/crypto.ts");
const { codeAt, hashRecovery, newSecret, stepNow } = await import("../lib/totp.ts");

const d = await db();
let passed = 0;
const check = async (name: string, fn: () => Promise<void>) => { try { await fn(); passed++; console.log("  ok  ", name); } catch (e) { console.error("  FAIL", name, "\n", e); process.exitCode = 1; } };
const quiet = async <T,>(fn: () => Promise<T>) => { const e = console.error, l = console.log; console.error = () => {}; console.log = () => {}; try { return await fn(); } finally { console.error = e; console.log = l; } };

await check("ID and TIN numbers are encrypted at rest", async () => {
  const rows = await d.select({ nationalId: s.profiles.nationalId, tin: s.profiles.tin }).from(s.profiles);
  const withId = rows.filter((r) => r.nationalId);
  assert.ok(withId.length > 0, "the sample data has ID numbers");
  for (const r of withId) assert.match(r.nationalId!, /^enc:v1:/);
  for (const r of rows.filter((x) => x.tin)) assert.match(r.tin!, /^enc:v1:/);
  const [p] = await d.select().from(s.profiles).where(eq(s.profiles.id, "p-aline"));
  assert.equal(open(p.nationalId), "1 1995 8 0045123 0 17");
});
await check("a plain value left over from before is encrypted on the next start, once", async () => {
  await d.update(s.profiles).set({ nationalId: "1199880012345678", tin: "123456789" }).where(eq(s.profiles.id, "p-jc"));
  assert.equal(await protectIdentity(d), 1);
  assert.equal(await protectIdentity(d), 0);
  const [p] = await d.select().from(s.profiles).where(eq(s.profiles.id, "p-jc"));
  assert.equal(open(p.nationalId), "1199880012345678"); assert.equal(open(p.tin), "123456789");
});
await check("rekey moves every value to a new key, and refuses when it can't read them", async () => {
  const dev = createHash("sha256").update("inzira-development-data-key").digest("hex");
  const k1 = "aa".repeat(32), k2 = "bb".repeat(32);
  process.env.DATA_KEY = k1; process.env.DATA_KEY_PREVIOUS = dev;
  assert.ok((await rekeyIdentity(d)) > 0);
  process.env.DATA_KEY = k2; process.env.DATA_KEY_PREVIOUS = "cc".repeat(32);
  await assert.rejects(quiet(() => rekeyIdentity(d)), /Could not open/);
  process.env.DATA_KEY_PREVIOUS = k1;
  assert.ok((await rekeyIdentity(d)) > 0);
  delete process.env.DATA_KEY_PREVIOUS;
  const [p] = await d.select().from(s.profiles).where(eq(s.profiles.id, "p-jc"));
  assert.equal(open(p.nationalId), "1199880012345678");
  process.env.DATA_KEY = dev; process.env.DATA_KEY_PREVIOUS = k2;
  await rekeyIdentity(d);
  delete process.env.DATA_KEY; delete process.env.DATA_KEY_PREVIOUS;
});

await check("outbox: a message is sent once, then its text is dropped", async () => {
  const id = await enqueue(d, { channel: "email", to: "x@example.com", mail: { to: "x@example.com", subject: "Hi", text: "Hello" } });
  const [before] = await d.select().from(s.outbox).where(eq(s.outbox.id, id));
  assert.equal(before.status, "pending");
  const r = await quiet(() => deliverDue());
  assert.ok(r.sent >= 1);
  const [after] = await d.select().from(s.outbox).where(eq(s.outbox.id, id));
  assert.equal(after.status, "sent"); assert.deepEqual(after.payload, {}); assert.equal(after.attempts, 1);
  assert.equal(await quiet(() => sendNow(id)), false, "a sent message is not sent again");
});
await check("outbox: a failure is retried later with a pause, and given up on after five tries", async () => {
  process.env.SMS_PROVIDER = "africastalking"; process.env.AT_USERNAME = "x"; process.env.AT_API_KEY = "x";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
  try {
    const id = await enqueue(d, { channel: "sms", to: "788123456", message: "test" });
    for (let i = 1; i <= 5; i++) {
      await d.update(s.outbox).set({ nextAttemptAt: new Date(Date.now() - 1000).toISOString() }).where(eq(s.outbox.id, id));
      assert.equal(await quiet(() => sendNow(id)), false);
      const [row] = await d.select().from(s.outbox).where(eq(s.outbox.id, id));
      assert.equal(row.attempts, i);
      if (i < 5) { assert.equal(row.status, "pending"); assert.ok(Date.parse(row.nextAttemptAt) > Date.now(), "waits before the next try"); }
      else { assert.equal(row.status, "failed"); assert.deepEqual(row.payload, {}); }
    }
    assert.ok((await counts()).failed >= 1);
  } finally { globalThis.fetch = realFetch; delete process.env.SMS_PROVIDER; }
});
await check("outbox: two workers cannot both take the same message", async () => {
  const id = await enqueue(d, { channel: "email", to: "y@example.com", mail: { to: "y@example.com", subject: "Hi", text: "Hello" } });
  const results = await quiet(() => Promise.all([sendNow(id), sendNow(id), sendNow(id)]));
  assert.equal(results.filter(Boolean).length, 1);
});
await check("outbox: a message written in a transaction that rolls back is never sent", async () => {
  await d.transaction(async (tx) => {
    await enqueue(tx, { channel: "email", to: "ghost@example.com", mail: { to: "ghost@example.com", subject: "x", text: "x" } });
    tx.rollback();
  }).catch(() => {});
  const rows = await d.select().from(s.outbox).where(eq(s.outbox.recipient, "ghost@example.com"));
  assert.equal(rows.length, 0);
});

await check("payments: the database allows one waiting prompt per request", async () => {
  const [r] = await d.select({ ref: s.requests.ref }).from(s.requests).limit(1);
  const row = { ref: r.ref, receipt: "T-1", method: "MTN MoMo" as const, official: 0, ours: 100, status: "pending" as const, payer: "788123456", providerRef: "sim:1" };
  await d.insert(s.transactions).values(row);
  const second = await d.insert(s.transactions).values({ ...row, receipt: "T-2" }).then(() => null, (e) => e);
  assert.ok(isUniqueViolation(second), "a second pending prompt is refused");
  await d.update(s.transactions).set({ status: "failed" }).where(eq(s.transactions.receipt, "T-1"));
  await d.insert(s.transactions).values({ ...row, receipt: "T-3" });
  await d.delete(s.transactions).where(sql`${s.transactions.receipt} in ('T-1','T-3')`);
});

await check("payments: IntouchPay is paid only after status says so, and a repeated callback does not pay twice", async () => {
  const { createServer } = await import("node:http");
  const { createHash } = await import("node:crypto");
  let code = "1000";
  const seen: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push(Buffer.concat(chunks).toString("utf8"));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ success: true, responsecode: code, status: code === "01" ? "Successfull" : "Pending", referenceno: "312333883" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const prev = ["PAYMENT_PROVIDER", "INTOUCHPAY_USERNAME", "INTOUCHPAY_ACCOUNT_NO", "INTOUCHPAY_PARTNER_PASSWORD", "INTOUCHPAY_BASE_URL", "INTOUCHPAY_CALLBACK_USER", "INTOUCHPAY_CALLBACK_PASSWORD"].map((k) => [k, process.env[k]] as const);
  process.env.PAYMENT_PROVIDER = "live";
  process.env.INTOUCHPAY_USERNAME = "bob";
  process.env.INTOUCHPAY_ACCOUNT_NO = "250160000011";
  process.env.INTOUCHPAY_PARTNER_PASSWORD = "secret-partner";
  process.env.INTOUCHPAY_BASE_URL = `http://127.0.0.1:${address.port}/api`;
  delete process.env.INTOUCHPAY_CALLBACK_USER;
  delete process.env.INTOUCHPAY_CALLBACK_PASSWORD;
  try {
    const { handlePaymentCallback } = await import("../lib/payment-callback.ts");
    const [r] = await d.select({ ref: s.requests.ref }).from(s.requests).limit(1);
    const before = await d.select({ id: s.events.id }).from(s.events).where(eq(s.events.ref, r.ref));
    const [row] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH", method: "MTN MoMo", official: 0, ours: 100, status: "pending", payer: "788123456", providerRef: "intouch:reqabc" }).returning({ id: s.transactions.id });
    const payload = { jsonpayload: { requesttransactionid: "reqabc", transactionid: "1425", responsecode: "01", status: "Successfull", statusdesc: "Successfully Processed Transaction", referenceno: "312333883" } };
    const waiting = await handlePaymentCallback({ txId: row.id, body: payload, authorization: null });
    assert.equal(waiting.status, 200);
    const [still] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(still.status, "pending", "a callback that says successful does not mark the payment paid");
    assert.equal(still.providerRef, "intouch:reqabc:1425");
    const mismatch = await handlePaymentCallback({ txId: row.id, body: { jsonpayload: { requesttransactionid: "other", transactionid: "9999", responsecode: "01", status: "Successfull" } }, authorization: null });
    assert.equal(mismatch.status, 200);
    const [untouched] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(untouched.providerRef, "intouch:reqabc:1425");
    process.env.INTOUCHPAY_CALLBACK_USER = "callback-user";
    process.env.INTOUCHPAY_CALLBACK_PASSWORD = "callback-secret";
    const denied = await handlePaymentCallback({ txId: row.id, body: payload, authorization: null });
    assert.equal(denied.status, 401);
    const [locked] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(locked.status, "pending");
    code = "01";
    const header = `Basic ${Buffer.from("callback-user:callback-secret").toString("base64")}`;
    const paid = await handlePaymentCallback({ txId: row.id, body: payload, authorization: header });
    assert.equal(paid.status, 200);
    const again = await handlePaymentCallback({ txId: row.id, body: payload, authorization: header });
    assert.equal(again.status, 200);
    const [done] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(done.status, "paid");
    assert.match(done.providerRef ?? "", /^intouch:reqabc:1425\|312333883$/);
    const after = await d.select({ id: s.events.id }).from(s.events).where(eq(s.events.ref, r.ref));
    assert.equal(after.length, before.length + 1, "a repeated callback records the payment once");
    const statusCall = JSON.parse(seen.at(-1) ?? "{}") as { password?: string; transactionid?: string; timestamp?: string };
    assert.equal(statusCall.transactionid, "1425");
    assert.notEqual(statusCall.password, "secret-partner");
    assert.equal(statusCall.password, createHash("sha256").update(`bob250160000011secret-partner${statusCall.timestamp}`, "utf8").digest("hex"));
    code = "1002";
    const [failRow] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-FAIL", method: "Airtel Money", official: 0, ours: 50, status: "pending", payer: "728123456", providerRef: "intouch:reqfail:77" }).returning({ id: s.transactions.id });
    const lied = await handlePaymentCallback({ txId: failRow.id, body: { jsonpayload: { requesttransactionid: "reqfail", transactionid: "77", responsecode: "01", status: "Successfull" } }, authorization: header });
    assert.equal(lied.status, 200);
    const [failed] = await d.select().from(s.transactions).where(eq(s.transactions.id, failRow.id));
    assert.equal(failed.status, "failed", "a callback that says paid is still failed when the status call says so");
    await d.delete(s.transactions).where(eq(s.transactions.id, failRow.id));
    await d.delete(s.transactions).where(eq(s.transactions.id, row.id));
  } finally {
    server.close();
    for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

await check("authenticator: a code works once; recovery codes work once", async () => {
  const secret = newSecret();
  const rec = "abcde-fghjk";
  await d.update(s.staff).set({ totpSecret: seal(secret), totpEnabledAt: new Date().toISOString(), totpLastStep: null, totpRecovery: [hashRecovery(rec), hashRecovery("zzzzz-22222")] }).where(eq(s.staff.id, "s-eric"));
  const code = codeAt(secret, stepNow());
  const [a, b] = await Promise.all([checkSecondStep("s-eric", code), checkSecondStep("s-eric", code)]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "of two requests with the same code only one gets in");
  assert.equal((await checkSecondStep("s-eric", code)).ok, false, "and it stays spent");
  assert.equal((await checkSecondStep("s-eric", "123456")).ok, false);
  const used = await checkSecondStep("s-eric", "ABCDE FGHJK");
  assert.ok(used.ok && used.usedRecovery);
  assert.equal((await checkSecondStep("s-eric", rec)).ok, false, "a recovery code is gone after one use");
  const [p] = await d.select({ left: s.staff.totpRecovery }).from(s.staff).where(eq(s.staff.id, "s-eric"));
  assert.equal(p.left?.length, 1);
});

console.log(process.exitCode ? "backend checks FAILED" : `backend checks ok (${passed})`);
process.exit(process.exitCode ?? 0);
