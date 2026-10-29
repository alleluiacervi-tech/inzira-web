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
await check("sms: Africa's Talking answering 201 but refusing the recipient is a failure, not a send", async () => {
  process.env.SMS_PROVIDER = "africastalking"; process.env.AT_USERNAME = "x"; process.env.AT_API_KEY = "x";
  const { sendSms } = await import("../lib/sms.ts");
  const realFetch = globalThis.fetch;
  const answer = (statusCode: number, status: string) => (async () => Response.json({ SMSMessageData: { Recipients: [{ statusCode, status }] } }, { status: 201 })) as typeof fetch;
  try {
    globalThis.fetch = answer(405, "InsufficientBalance");
    await assert.rejects(sendSms("788123456", "test"), /InsufficientBalance/);
    globalThis.fetch = (async () => new Response("{}", { status: 201 })) as typeof fetch;
    await assert.rejects(sendSms("788123456", "test"), /did not send/);
    globalThis.fetch = answer(101, "Success");
    await sendSms("788123456", "test");
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
    const { handlePaymentCallback, acknowledgeCallback, parseCallbackBody } = await import("../lib/payment-callback.ts");
    const [r] = await d.select({ ref: s.requests.ref }).from(s.requests).limit(1);
    const before = await d.select({ id: s.events.id }).from(s.events).where(eq(s.events.ref, r.ref));
    const [row] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH", method: "MTN MoMo", official: 0, ours: 100, status: "pending", payer: "788123456", providerRef: "intouch:reqabc" }).returning({ id: s.transactions.id });
    const payload = { jsonpayload: { requesttransactionid: "reqabc", transactionid: "1425", responsecode: "01", status: "Successfull", statusdesc: "Successfully Processed Transaction", referenceno: "312333883" } };
    const waiting = await handlePaymentCallback({ txId: row.id, body: payload, authorization: null });
    assert.equal(waiting.status, 200);
    assert.deepEqual(await waiting.json(), { message: "success", success: true, request_id: "reqabc" }, "IntouchPay gets the acknowledgement it expects");
    const [still] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(still.status, "pending", "a callback that says successful does not mark the payment paid");
    assert.equal(still.providerRef, "intouch:reqabc:1425");
    const mismatch = await handlePaymentCallback({ txId: row.id, body: { jsonpayload: { requesttransactionid: "other", transactionid: "9999", responsecode: "01", status: "Successfull" } }, authorization: null });
    assert.equal(mismatch.status, 200);
    const [untouched] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(untouched.providerRef, "intouch:reqabc:1425");
    process.env.INTOUCHPAY_CALLBACK_USER = "callback-user";
    process.env.INTOUCHPAY_CALLBACK_PASSWORD = "callback-secret";
    // IntouchPay does not send the login: the callback is still acknowledged, and only makes us ask (still pending).
    const noLogin = await handlePaymentCallback({ txId: row.id, body: payload, authorization: null });
    assert.equal(noLogin.status, 200);
    assert.deepEqual(await noLogin.json(), { message: "success", success: true, request_id: "reqabc" });
    const [locked] = await d.select().from(s.transactions).where(eq(s.transactions.id, row.id));
    assert.equal(locked.status, "pending");
    // Whatever arrives is acknowledged the same way, and the body is read however IntouchPay encodes it.
    for (const junk of [null, "nonsense", { jsonpayload: { requesttransactionid: "x y" } }]) {
      const ack = acknowledgeCallback(junk);
      assert.equal(ack.status, 200); assert.deepEqual(await ack.json(), { message: "success", success: true, request_id: "" });
    }
    const unknown = await handlePaymentCallback({ txId: null, body: { jsonpayload: { requesttransactionid: "nosuchprompt", transactionid: "1", status: "Successfull" } }, authorization: null });
    assert.deepEqual(await unknown.json(), { message: "success", success: true, request_id: "nosuchprompt" }, "an unknown prompt is acknowledged too");
    const inner = JSON.stringify({ requesttransactionid: "reqabc", transactionid: "1425", status: "Pending" });
    assert.deepEqual(await acknowledgeCallback(parseCallbackBody(`jsonpayload=${encodeURIComponent(inner)}`)).json(), { message: "success", success: true, request_id: "reqabc" }, "a form-encoded callback is read");
    assert.deepEqual(await acknowledgeCallback(parseCallbackBody(JSON.stringify({ jsonpayload: inner }))).json(), { message: "success", success: true, request_id: "reqabc" }, "and a jsonpayload sent as a string");
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
    // A prompt we closed as failed is approved on the phone afterwards: the callback finds it, and only a callback does.
    code = "01";
    const { reconcilePayment } = await import("../lib/billing.ts");
    const [lateRow] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-LATE", method: "MTN MoMo", official: 0, ours: 60, status: "failed", payer: "788123456", providerRef: "intouch:reqlate:88" }).returning({ id: s.transactions.id });
    assert.equal(await reconcilePayment(lateRow.id), "failed", "a failed prompt stays failed when nothing asks again");
    const [unlisted] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-REFUSED", method: "MTN MoMo", official: 0, ours: 60, status: "failed", payer: "788123456", providerRef: "intouch:reqrefused" }).returning({ id: s.transactions.id });
    assert.equal(await reconcilePayment(unlisted.id, { late: true }), "failed", "a refused prompt has no provider id to ask about");
    const lateCall = await handlePaymentCallback({ txId: lateRow.id, body: { jsonpayload: { requesttransactionid: "reqlate", transactionid: "88", responsecode: "01", status: "Successfull" } }, authorization: header });
    assert.equal(lateCall.status, 200);
    const [lateDone] = await d.select().from(s.transactions).where(eq(s.transactions.id, lateRow.id));
    assert.equal(lateDone.status, "paid", "a late approval is recorded as paid");
    const lateAudit = await d.select({ id: s.audit.id }).from(s.audit).where(sql`${s.audit.action} like 'Payment reconciled after%' and ${s.audit.entity} like 'T-INTOUCH-LATE%'`);
    assert.equal(lateAudit.length, 1, "and noted for staff");
    await handlePaymentCallback({ txId: lateRow.id, body: { jsonpayload: { requesttransactionid: "reqlate", transactionid: "88", responsecode: "01", status: "Successfull" } }, authorization: header });
    const lateAgain = await d.select({ id: s.audit.id }).from(s.audit).where(sql`${s.audit.entity} like 'T-INTOUCH-LATE%'`);
    assert.equal(lateAgain.length, 1, "a repeated callback records it once");
    // A declined prompt: IntouchPay still says pending, but its authenticated callback says failed.
    code = "1000";
    const [declRow] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-DECL", method: "MTN MoMo", official: 0, ours: 40, status: "pending", payer: "788123456", providerRef: "intouch:reqdecl:99" }).returning({ id: s.transactions.id });
    const declined = (requestId: string) => ({ jsonpayload: { requesttransactionid: requestId, transactionid: "99", responsecode: "1005", status: "Failed" } });
    const statusOf = async () => (await d.select().from(s.transactions).where(eq(s.transactions.id, declRow.id)))[0].status;
    delete process.env.INTOUCHPAY_CALLBACK_USER;
    delete process.env.INTOUCHPAY_CALLBACK_PASSWORD;
    await handlePaymentCallback({ txId: declRow.id, body: declined("reqdecl"), authorization: null });
    assert.equal(await statusOf(), "pending", "a failure claim from an unauthenticated callback is not believed");
    process.env.INTOUCHPAY_CALLBACK_USER = "callback-user";
    process.env.INTOUCHPAY_CALLBACK_PASSWORD = "callback-secret";
    await handlePaymentCallback({ txId: declRow.id, body: declined("someoneelse"), authorization: header });
    assert.equal(await statusOf(), "pending", "nor one that names a different prompt");
    await handlePaymentCallback({ txId: declRow.id, body: declined("reqdecl"), authorization: header });
    assert.equal(await statusOf(), "failed", "an authenticated callback that names the prompt closes it at once");
    const [paidNever] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-DECL2", method: "MTN MoMo", official: 0, ours: 40, status: "pending", payer: "788123456", providerRef: "intouch:reqdecl2:98" }).returning({ id: s.transactions.id });
    code = "01";
    await handlePaymentCallback({ txId: paidNever.id, body: { jsonpayload: { requesttransactionid: "reqdecl2", transactionid: "98", responsecode: "1005", status: "Failed" } }, authorization: header });
    assert.equal((await d.select().from(s.transactions).where(eq(s.transactions.id, paidNever.id)))[0].status, "paid", "a failure claim never beats a provider answer of paid");
    await d.delete(s.transactions).where(sql`${s.transactions.id} in (${declRow.id}, ${paidNever.id})`);
    // A customer's screen polling is limited to one provider call per interval; the callback is not.
    code = "1000";
    const { reconcileForScreen } = await import("../lib/billing.ts");
    const [pollRow] = await d.insert(s.transactions).values({ ref: r.ref, receipt: "T-INTOUCH-POLL", method: "MTN MoMo", official: 0, ours: 30, status: "pending", payer: "788123456", providerRef: "intouch:reqpoll:55" }).returning({ id: s.transactions.id });
    const callsBefore = seen.length;
    for (let i = 0; i < 5; i++) assert.equal(await reconcileForScreen(pollRow.id), "pending");
    assert.equal(seen.length - callsBefore, 1, "five quick polls from screens make one call to IntouchPay");
    await handlePaymentCallback({ txId: pollRow.id, body: { jsonpayload: { requesttransactionid: "reqpoll", transactionid: "55", responsecode: "01", status: "Successfull" } }, authorization: header });
    assert.equal(seen.length - callsBefore, 2, "a callback still asks at once");
    // A callback finds its prompt by the whole request id, not the start of it.
    const lookup = await handlePaymentCallback({ txId: null, body: { jsonpayload: { requesttransactionid: "reqpo", transactionid: "55", responsecode: "01", status: "Successfull" } }, authorization: header });
    assert.equal(lookup.status, 200);
    assert.equal(seen.length - callsBefore, 2, "a shorter id does not reach another prompt");
    await d.delete(s.transactions).where(eq(s.transactions.id, pollRow.id));
    await d.delete(s.transactions).where(sql`${s.transactions.id} in (${lateRow.id}, ${unlisted.id})`);
    await d.delete(s.transactions).where(eq(s.transactions.id, failRow.id));
    await d.delete(s.transactions).where(eq(s.transactions.id, row.id));
  } finally {
    server.close();
    for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

await check("live site: the sample admin gets no code, and sample sessions are closed", async () => {
  const { issueEmailCode } = await import("../lib/auth.ts");
  const { linkSampleSignIns } = await import("../lib/db/seed.ts");
  const [diane] = await d.select({ email: s.staff.email }).from(s.staff).where(eq(s.staff.id, "s-diane"));
  assert.equal(diane.email, "admin@inzira.test", "the demo links the sample address");
  const until = new Date(Date.now() + 3600e3).toISOString();
  await d.insert(s.sessions).values([
    { id: "sess-sample-staff", kind: "staff", subjectId: "s-diane", expiresAt: until },
    { id: "sess-sample-customer", kind: "customer", subjectId: "acc-aline", expiresAt: until },
    { id: "sess-real-staff", kind: "staff", subjectId: "s-eric", expiresAt: until },
  ]);
  const keep = ["NODE_ENV", "INZIRA_DEMO", "RESEND_API_KEY"].map((k) => [k, process.env[k]] as const);
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  delete process.env.INZIRA_DEMO;
  delete process.env.RESEND_API_KEY;
  try {
    const r = await issueEmailCode("admin@inzira.test", "en");
    assert.equal(r.ok, false, "no code for the sample admin on a live site");
    assert.ok(!("demoCode" in r && r.demoCode), "and nothing printed");
    await linkSampleSignIns(d);
    const left = (await d.select({ id: s.sessions.id }).from(s.sessions).where(sql`${s.sessions.id} like 'sess-%'`)).map((x) => x.id).sort();
    assert.deepEqual(left, ["sess-real-staff"], "sample sessions are ended, a real one is kept");
  } finally {
    for (const [k, v] of keep) { if (v === undefined) delete process.env[k]; else (process.env as Record<string, string | undefined>)[k] = v; }
    await d.delete(s.sessions).where(sql`${s.sessions.id} like 'sess-%'`);
  }
});

await check("owner login: applied once per hash, never undone by a restart, no email kept", async () => {
  const { setOwnerLogin, applyOwnerLoginFromEnv } = await import("../lib/db/owner.ts");
  const { hashPassword, verifyPassword } = await import("../lib/password.ts");
  const [before] = await d.select().from(s.staff).where(eq(s.staff.id, "s-diane"));
  assert.equal(before.role, "Owner");
  await d.insert(s.sessions).values({ id: "sess-owner-old", kind: "staff", subjectId: "s-diane", expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  try {
    await d.update(s.staff).set({ passwordHash: null }).where(eq(s.staff.id, "s-diane"));
    const first = await hashPassword("first-password-1");
    assert.equal(await setOwnerLogin(d, { username: " Admin@InziraServices.com ", passwordHash: first }), "set");
    const [row] = await d.select().from(s.staff).where(eq(s.staff.id, "s-diane"));
    assert.equal(row.username, "admin@inziraservices.com", "the username is stored in lower case");
    assert.equal(row.email, null, "no email, so no alert or reset link goes to an unread mailbox");
    assert.equal(await verifyPassword("first-password-1", row.passwordHash), true);
    assert.equal(await verifyPassword("something-else", row.passwordHash), false);
    assert.equal((await d.select({ id: s.sessions.id }).from(s.sessions).where(eq(s.sessions.id, "sess-owner-old"))).length, 0, "old sessions end");

    process.env.OWNER_USERNAME = "admin@inziraservices.com";
    process.env.OWNER_PASSWORD_HASH = await hashPassword("second-password-2");
    await applyOwnerLoginFromEnv(d);
    const [replaced] = await d.select().from(s.staff).where(eq(s.staff.id, "s-diane"));
    assert.equal(await verifyPassword("second-password-2", replaced.passwordHash), true, "a new hash in the settings replaces the password the owner had");

    await d.update(s.staff).set({ passwordHash: await hashPassword("changed-by-owner-3") }).where(eq(s.staff.id, "s-diane"));
    await applyOwnerLoginFromEnv(d);
    const [kept] = await d.select().from(s.staff).where(eq(s.staff.id, "s-diane"));
    assert.equal(await verifyPassword("changed-by-owner-3", kept.passwordHash), true, "a restart with the same hash does not undo the owner's own change");

    process.env.OWNER_PASSWORD_HASH = await hashPassword("fourth-password-4");
    await applyOwnerLoginFromEnv(d);
    const [again] = await d.select().from(s.staff).where(eq(s.staff.id, "s-diane"));
    assert.equal(await verifyPassword("fourth-password-4", again.passwordHash), true, "another new hash is another reset");

    const [eric] = await d.select().from(s.staff).where(eq(s.staff.id, "s-eric"));
    await d.update(s.staff).set({ username: "taken.name" }).where(eq(s.staff.id, "s-eric"));
    assert.equal(await setOwnerLogin(d, { username: "Taken.Name", passwordHash: first }, { replace: true }), "username-taken");
    await d.update(s.staff).set({ username: eric.username }).where(eq(s.staff.id, "s-eric"));
  } finally {
    delete process.env.OWNER_USERNAME;
    delete process.env.OWNER_PASSWORD_HASH;
    await d.delete(s.sessions).where(eq(s.sessions.id, "sess-owner-old"));
    await d.delete(s.audit).where(eq(s.audit.action, "Owner login set from settings"));
    await d.update(s.staff).set({ username: before.username, email: before.email, passwordHash: before.passwordHash, passwordSetAt: before.passwordSetAt, failedLogins: before.failedLogins, lockedUntil: before.lockedUntil }).where(eq(s.staff.id, "s-diane"));
  }
});

await check("authenticator: asked once per session, so once in 30 days on a trusted device", async () => {
  const { stepUpWindow, STAFF_IDLE_LOCK } = await import("../lib/auth.ts");
  assert.equal(stepUpWindow(true), 30 * 864e5);
  assert.equal(stepUpWindow(false), 12 * 36e5);
  assert.ok(STAFF_IDLE_LOCK < stepUpWindow(false), "the idle lock asks for the password only, not the code");
  const { STAFF_IDLE_LOCK_TRUSTED, DEVICE_VERIFIED_FOR } = await import("../lib/auth.ts");
  assert.ok(STAFF_IDLE_LOCK < STAFF_IDLE_LOCK_TRUSTED && STAFF_IDLE_LOCK_TRUSTED < stepUpWindow(true), "a trusted device locks later, not never");
  assert.equal(DEVICE_VERIFIED_FOR, 30 * 864e5);
});

await check("messages: progress is shown in the portal only; money, questions and outcomes are also sent", async () => {
  const { notify } = await import("../lib/mutate.ts");
  const { msg, sms } = await import("../lib/i18n/stored.ts");
  const ref = "INZ-2026-04741";
  const sent = async () => Number((await d.execute(sql.raw(`select count(*) n from outbox where ref = '${ref}'`))).rows[0].n);
  const before = await sent();
  await d.transaction((tx) => notify(tx, ref, { icon: "user", title: msg("nt.taken", { agent: "Eric", ref }) }));
  assert.equal(await sent(), before, "an agent taking the case is not texted or emailed");
  await d.transaction((tx) => notify(tx, ref, { icon: "alert", title: msg("nt.declined", { ref }), sms: sms("declined", { ref, reason: "test" }) }));
  assert.equal(await sent(), before + 1, "a decline still reaches the customer");
  await d.execute(sql.raw(`delete from outbox where ref = '${ref}' and id > 0 and created_at > now() - interval '1 minute'`));
});

await check("unpaid quotes: one reminder, then the request is closed a week after the fees were sent", async () => {
  const { remindUnpaidQuotes, expireUnpaidQuotes } = await import("../lib/jobs.ts");
  const [{ cols }] = (await d.execute(sql.raw(`select string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_name = 'requests'`))).rows as { cols: string }[];
  const copyOf = async (ref: string, stage: string, dueIn: number, quote = "confirmed") => {
    const pick = cols.split(", ").map((c) => c === "ref" ? `'${ref}'` : c === "invoice" ? `'INV-${ref}'` : c === "stage" ? `'${stage}'` : c === "quote" ? `'${quote}'` : c === "closed" ? "null" : c === "hold" ? "null"
      : c === "due_at" ? `now() + interval '${dueIn} hours'` : c === "agent_id" ? "null" : c).join(", ");
    await d.execute(sql.raw(`insert into requests (${cols}) select ${pick} from requests where ref = 'INZ-2026-04741'`));
  };
  const notified = async (ref: string) => Number((await d.execute(sql.raw(`select count(*) n from notifications where key = 'nt.fees' and href = '/portal/requests/${ref}'`))).rows[0].n);
  const closedOf = async (ref: string) => (await d.execute(sql.raw(`select closed from requests where ref = '${ref}'`))).rows[0].closed as { kind: string } | null;
  const refs = ["INZ-T-DUE1D", "INZ-T-OVER5D", "INZ-T-WORK", "INZ-T-PAID", "INZ-T-NEW"];
  try {
    await copyOf("INZ-T-DUE1D", "checking", 30);       // fees sent about two days ago, due in 30 hours
    await copyOf("INZ-T-OVER5D", "checking", -5 * 24); // fell due five days ago: a week since the fees
    await copyOf("INZ-T-WORK", "preparing", -5 * 24);  // work already started (past the lock): never closed by this job
    await copyOf("INZ-T-PAID", "checking", -5 * 24);   // paid in full: never closed
    await d.execute(sql.raw(`insert into transactions (ref, receipt, method, official, ours, status) select 'INZ-T-PAID', 'T-PAID', 'MTN MoMo', coalesce(official, 0), ours, 'paid' from requests where ref = 'INZ-T-PAID'`));
    await copyOf("INZ-T-NEW", "checking", 60);         // just sent: nothing yet
    const before = await notified("INZ-T-DUE1D");
    const first = await remindUnpaidQuotes();
    assert.ok(first.reminded >= 1);
    assert.equal(await notified("INZ-T-DUE1D"), before + 1, "a request due within two days is reminded");
    assert.equal(await notified("INZ-T-NEW"), 0, "one just sent is not");
    assert.equal(await notified("INZ-T-OVER5D"), 0, "one already overdue is handled by the hold, not a reminder");
    await remindUnpaidQuotes();
    assert.equal(await notified("INZ-T-DUE1D"), before + 1, "and only once");
    const result = await expireUnpaidQuotes();
    assert.ok(result.expired >= 1);
    assert.equal((await closedOf("INZ-T-OVER5D"))?.kind, "cancelled", "unpaid a week after the fees: closed");
    assert.equal(await closedOf("INZ-T-DUE1D"), null, "not yet due: left open");
    assert.equal(await closedOf("INZ-T-WORK"), null, "work already started: left open");
    assert.equal(await closedOf("INZ-T-PAID"), null, "paid: left open");
    const events = Number((await d.execute(sql.raw(`select count(*) n from events where ref = 'INZ-T-OVER5D' and key = 'ev.quoteExpired'`))).rows[0].n);
    assert.equal(events, 1);
    await expireUnpaidQuotes();
    assert.equal(Number((await d.execute(sql.raw(`select count(*) n from events where ref = 'INZ-T-OVER5D' and key = 'ev.quoteExpired'`))).rows[0].n), 1, "closing is not repeated");
  } finally {
    const list = refs.map((r) => `'${r}'`).join(", ");
    await d.execute(sql.raw(`delete from events where ref in (${list})`));
    await d.execute(sql.raw(`delete from transactions where ref in (${list})`));
    await d.execute(sql.raw(`delete from requests where ref in (${list})`));
    await d.execute(sql.raw(`delete from audit where entity like 'INZ-T-%'`));
    await d.execute(sql.raw(`delete from notifications where href like '%/INZ-T-%'`));
    await d.execute(sql.raw(`delete from outbox where ref like 'INZ-T-%'`));
    await d.execute(sql.raw(`delete from rate_limits where key like 'quote-nudge:INZ-T-%'`));
  }
});

await check("pay to submit: an unpaid checkout is reminded once, closes after three days, and paying hands it to staff", async () => {
  const { remindOpenCheckouts, expireOpenCheckouts, expireUnpaidQuotes } = await import("../lib/jobs.ts");
  const { reconcilePayment } = await import("../lib/billing.ts");
  const [{ cols }] = (await d.execute(sql.raw(`select string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_name = 'requests'`))).rows as { cols: string }[];
  const hold = JSON.stringify({ reason: "payment", title: "Pay to send your request", detail: "Pay RWF 5,000", since: new Date().toISOString(), msg: { key: "hold.checkout", vars: { total: "RWF 5,000" } } });
  // A copy of a sample request, started at checkout `hoursAgo` hours ago for RWF 5,000 and not paid.
  const checkoutOf = async (ref: string, hoursAgo: number, dueHoursAgo = hoursAgo - 72) => {
    const pick = cols.split(", ").map((c) => c === "ref" ? `'${ref}'` : c === "invoice" ? `'INV-${ref}'` : c === "stage" ? "'received'" : c === "quote" ? "'confirmed'" : c === "closed" ? "null"
      : c === "hold" ? `'${hold}'::jsonb` : c === "checkout" ? "'open'" : c === "agent_id" ? "null" : c === "official" ? "0" : c === "official_mode" ? "null" : c === "ours" ? "5000"
      : c === "opened_at" ? `now() - interval '${hoursAgo} hours'` : c === "due_at" ? `now() - interval '${dueHoursAgo} hours'` : c).join(", ");
    await d.execute(sql.raw(`insert into requests (${cols}) select ${pick} from requests where ref = 'INZ-2026-04741'`));
  };
  const count = async (q: string) => Number((await d.execute(sql.raw(q))).rows[0].n);
  const notified = (ref: string, key: string) => count(`select count(*) n from notifications where key = '${key}' and href = '/portal/requests/${ref}'`);
  const row = async (ref: string) => (await d.execute(sql.raw(`select checkout, closed, hold, summary from requests where ref = '${ref}'`))).rows[0] as { checkout: string; closed: { msg?: { key: string } } | null; hold: unknown; summary: { msg?: { key: string } } };
  const prompt = async (ref: string) => (await d.insert(s.transactions).values({ ref, receipt: `R-${ref}`, method: "MTN MoMo", official: 0, ours: 5000, status: "pending", payer: "788123456", providerRef: `sim:${Date.now() - 5000}:788123456` }).returning({ id: s.transactions.id }))[0].id;
  const refs = ["INZ-T-CO-NEW", "INZ-T-CO-LEFT", "INZ-T-CO-STALE"];
  try {
    await checkoutOf("INZ-T-CO-NEW", 1);            // still on the payment screen, probably
    await checkoutOf("INZ-T-CO-LEFT", 3, 5 * 24);   // left three hours ago; due date long past, as a quote would read it
    await checkoutOf("INZ-T-CO-STALE", 80);         // started more than three days ago
    await remindOpenCheckouts();
    assert.equal(await notified("INZ-T-CO-NEW", "nt.checkoutReminder"), 0, "not reminded within two hours");
    assert.equal(await notified("INZ-T-CO-LEFT", "nt.checkoutReminder"), 1, "reminded once it has been left");
    assert.equal(await notified("INZ-T-CO-STALE", "nt.checkoutReminder"), 0, "not one about to be closed");
    await remindOpenCheckouts();
    assert.equal(await notified("INZ-T-CO-LEFT", "nt.checkoutReminder"), 1, "and only once");
    assert.ok(await count(`select count(*) n from outbox where ref = 'INZ-T-CO-LEFT'`) >= 1, "the reminder goes out by email");
    await expireUnpaidQuotes();
    assert.equal((await row("INZ-T-CO-LEFT")).closed, null, "the quote expiry does not touch checkouts");
    await expireOpenCheckouts();
    assert.equal((await row("INZ-T-CO-STALE")).closed?.msg?.key, "closed.checkoutExpired", "three days unpaid: closed");
    assert.equal((await row("INZ-T-CO-LEFT")).closed, null, "younger ones stay open");
    assert.equal(await notified("INZ-T-CO-STALE", "nt.checkoutExpired"), 1);
    assert.equal(await count(`select count(*) n from staff_notifications where ref in ('INZ-T-CO-LEFT', 'INZ-T-CO-STALE')`), 0, "staff hear nothing about unpaid checkouts");

    assert.equal(await reconcilePayment(await prompt("INZ-T-CO-LEFT")), "paid");
    const paid = await row("INZ-T-CO-LEFT");
    assert.equal(paid.checkout, "paid"); assert.equal(paid.hold, null); assert.equal(paid.summary.msg?.key, "sum.received");
    assert.equal(await notified("INZ-T-CO-LEFT", "nt.checkoutPaid"), 1, "the customer is told it was sent");
    assert.equal(await notified("INZ-T-CO-LEFT", "nt.paymentReceived"), 0, "once, not twice");
    assert.ok(await count(`select count(*) n from staff_notifications where ref = 'INZ-T-CO-LEFT' and title = 'New paid request INZ-T-CO-LEFT'`) >= 1, "staff are told a paid request arrived");
    assert.equal(await count(`select count(*) n from events where ref = 'INZ-T-CO-LEFT' and key = 'ev.sentToTeam'`), 1);

    // A prompt approved after the checkout was closed: the money is in, so the request is opened again and handed over.
    assert.equal(await reconcilePayment(await prompt("INZ-T-CO-STALE")), "paid");
    const late = await row("INZ-T-CO-STALE");
    assert.equal(late.closed, null); assert.equal(late.checkout, "paid");
  } finally {
    const list = refs.map((r) => `'${r}'`).join(", ");
    await d.execute(sql.raw(`delete from events where ref in (${list})`));
    await d.execute(sql.raw(`delete from transactions where ref in (${list})`));
    await d.execute(sql.raw(`delete from staff_notifications where ref in (${list})`));
    await d.execute(sql.raw(`delete from outbox where ref in (${list})`));
    await d.execute(sql.raw(`delete from requests where ref in (${list})`));
    await d.execute(sql.raw(`delete from audit where entity like '%INZ-T-CO-%'`));
    await d.execute(sql.raw(`delete from notifications where href like '%/INZ-T-CO-%'`));
    await d.execute(sql.raw(`delete from rate_limits where key like '%INZ-T-CO-%'`));
  }
});

await check("review fee: paying it sends a quoted request to staff, the quote counts it, and declining asks for a refund", async () => {
  const { remindOpenCheckouts, expireUnpaidQuotes } = await import("../lib/jobs.ts");
  const { reconcilePayment, noteRefundDue } = await import("../lib/billing.ts");
  const [{ cols }] = (await d.execute(sql.raw(`select string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_name = 'requests'`))).rows as { cols: string }[];
  const hold = JSON.stringify({ reason: "payment", title: "Pay the review fee to send your request", detail: "Pay RWF 1,000", since: new Date().toISOString(), msg: { key: "hold.reviewFee", vars: { fee: "RWF 1,000" } } });
  const ref = "INZ-T-RV-1";
  const pick = cols.split(", ").map((c) => c === "ref" ? `'${ref}'` : c === "invoice" ? `'INV-${ref}'` : c === "stage" ? "'received'" : c === "quote" ? "'estimate'" : c === "closed" ? "null"
    : c === "hold" ? `'${hold}'::jsonb` : c === "checkout" ? "'open'" : c === "review_fee" ? "1000" : c === "agent_id" ? "null" : c === "official" ? "null" : c === "official_mode" ? "null" : c === "ours" ? "8000"
    : c === "opened_at" ? "now() - interval '3 hours'" : c === "due_at" ? "null" : c).join(", ");
  const row = async () => (await d.execute(sql.raw(`select checkout, quote, closed, hold, summary from requests where ref = '${ref}'`))).rows[0] as { checkout: string; quote: string; closed: { msg?: { key: string } } | null; hold: unknown; summary: { msg?: { key: string } } };
  const count = async (q: string) => Number((await d.execute(sql.raw(q))).rows[0].n);
  try {
    await d.execute(sql.raw(`insert into requests (${cols}) select ${pick} from requests where ref = 'INZ-2026-04741'`));
    await remindOpenCheckouts();
    const [reminder] = (await d.execute(sql.raw(`select vars from notifications where key = 'nt.checkoutReminder' and href = '/portal/requests/${ref}'`))).rows as { vars: { total: string } }[];
    assert.equal(reminder?.vars.total, "RWF 1,000", "the reminder asks for the review fee, not the whole fee");

    const [p] = await d.insert(s.transactions).values({ ref, receipt: `R-${ref}`, method: "MTN MoMo", official: 0, ours: 1000, status: "pending", payer: "788123456", providerRef: `sim:${Date.now() - 5000}:788123456` }).returning({ id: s.transactions.id });
    assert.equal(await reconcilePayment(p.id), "paid");
    const sent = await row();
    assert.equal(sent.checkout, "paid"); assert.equal(sent.hold, null);
    assert.equal(sent.quote, "estimate", "paying the review fee does not approve fees nobody has sent yet");
    assert.equal(sent.summary.msg?.key, "sum.reviewPaid");
    assert.ok(await count(`select count(*) n from staff_notifications where ref = '${ref}' and title = 'New request ${ref} · review fee paid'`) >= 1, "staff are told it needs a quote");

    const by = { id: "s-diane", name: "Diane", role: "Owner" };
    await d.transaction((tx) => noteRefundDue(tx, ref, by));
    assert.equal(await count(`select count(*) n from notes where ref = '${ref}' and body like 'Refund due: the customer paid a RWF 1,000 review fee%'`), 1, "declined before a quote: staff are told to refund it");

    // Quoted and then not paid within a week: closed, and the customer is not told "nothing was charged".
    await d.execute(sql.raw(`update requests set quote = 'confirmed', official = 2000, due_at = now() - interval '5 days' where ref = '${ref}'`));
    await d.transaction((tx) => noteRefundDue(tx, ref, by));
    assert.equal(await count(`select count(*) n from notes where ref = '${ref}' and body like 'Refund due%'`), 1, "once quoted, closing it does not ask for a refund");
    // A paid quote closed before it was filed: everything beyond the review fee is owed back.
    const [q] = await d.insert(s.transactions).values({ ref, receipt: `R-${ref}-2`, method: "MTN MoMo", official: 2000, ours: 7000, status: "paid", payer: "788123456", providerRef: `R-${ref}-2` }).returning({ id: s.transactions.id });
    await d.transaction((tx) => noteRefundDue(tx, ref, by));
    assert.equal(await count(`select count(*) n from notes where ref = '${ref}' and body like 'Refund due: the customer paid RWF 9,000 and the request was closed before it was filed%'`), 1, "a paid request closed before filing asks for the money back");
    await d.delete(s.transactions).where(eq(s.transactions.id, q.id));
    await expireUnpaidQuotes();
    const closed = await row();
    assert.ok(closed.closed, "unpaid a week after the quote: closed");
    assert.equal(closed.summary.msg?.key, "sum.quoteExpiredReview");
  } finally {
    for (const t of ["events", "transactions", "staff_notifications", "outbox", "notes"]) await d.execute(sql.raw(`delete from ${t} where ref = '${ref}'`));
    await d.execute(sql.raw(`delete from requests where ref = '${ref}'`));
    await d.execute(sql.raw(`delete from audit where entity like '%${ref}%'`));
    await d.execute(sql.raw(`delete from notifications where href like '%/${ref}'`));
    await d.execute(sql.raw(`delete from rate_limits where key like '%${ref}%'`));
  }
});

await check("refunds: sent back through RequestDeposit, recorded once confirmed, never sent twice", async () => {
  const { sendRefund, reconcilePayout, closeUnclearPayout, PayoutRefused } = await import("../lib/payouts.ts");
  const { createServer } = await import("node:http");
  const [{ cols }] = (await d.execute(sql.raw(`select string_agg(column_name, ', ' order by ordinal_position) cols from information_schema.columns where table_name = 'requests'`))).rows as { cols: string }[];
  // "attached": the official fee was paid to the institution (its receipt is on file), so only our fee comes back.
  const copy = async (ref: string, payer: string, officialReceipt = "attached") => {
    const pick = cols.split(", ").map((c) => c === "ref" ? `'${ref}'` : c === "invoice" ? `'INV-${ref}'` : c === "closed" ? "null" : c === "hold" ? "null" : c === "official_receipt" ? `'${officialReceipt}'` : c).join(", ");
    await d.execute(sql.raw(`insert into requests (${cols}) select ${pick} from requests where ref = 'INZ-2026-04741'`));
    await d.insert(s.transactions).values({ ref, receipt: `R-${ref}`, method: "MTN MoMo", official: 2000, ours: 5000, status: "paid", payer, providerRef: "sim:1:788123456" });
  };
  const txStatus = async (ref: string) => (await d.select({ status: s.transactions.status }).from(s.transactions).where(eq(s.transactions.ref, ref)))[0]?.status;
  const payout = async (ref: string) => (await d.select().from(s.payouts).where(eq(s.payouts.ref, ref)).orderBy(s.payouts.id)).at(-1)!;
  const by = { id: "s-diane", name: "Diane", role: "Owner" };
  const refs = ["INZ-T-PO-SIM", "INZ-T-PO-HELD", "INZ-T-PO-LOW", "INZ-T-PO-LIVE"];
  const prev = ["PAYMENT_PROVIDER", "INTOUCHPAY_USERNAME", "INTOUCHPAY_ACCOUNT_NO", "INTOUCHPAY_PARTNER_PASSWORD", "INTOUCHPAY_BASE_URL"].map((k) => [k, process.env[k]] as const);
  let mode: "silent" | "pending" | "sent" = "silent";
  const server = createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if ((req.url ?? "").includes("requestdeposit")) {
        if (mode === "silent") { res.statusCode = 502; res.end("{}"); return; }
        res.end(JSON.stringify({ success: true, responsecode: "1000", status: "Pending", transactionid: "DEP1", requesttransactionid: new URLSearchParams(body).get("requesttransactionid") }));
        return;
      }
      res.end(JSON.stringify(mode === "sent" ? { success: true, responsecode: "2001", status: "Successfull" } : { success: true, responsecode: "1000", status: "Pending" }));
    });
  });
  try {
    // The demo's simulator: sent at once, and the request reads as refunded.
    await copy("INZ-T-PO-SIM", "788123456");
    assert.equal((await quiet(() => sendRefund("INZ-T-PO-SIM", by))).status, "sent");
    assert.equal(await txStatus("INZ-T-PO-SIM"), "refunded");
    assert.equal((await payout("INZ-T-PO-SIM")).amount, 5000, "our fee only: the official fee was already paid to the institution");
    // One payment: the official fee we took and have not paid to the institution yet goes back too.
    await copy("INZ-T-PO-HELD", "788123456", "awaiting");
    assert.equal((await quiet(() => sendRefund("INZ-T-PO-HELD", by))).amount, 7000, "our fee and the official fee not yet paid out");
    assert.equal(Number((await d.execute(sql.raw(`select count(*) n from notifications where key = 'nt.refund' and href = '/portal/requests/INZ-T-PO-SIM'`))).rows[0].n), 1, "the customer is told");
    await assert.rejects(() => sendRefund("INZ-T-PO-SIM", by), /Nothing to refund/, "a refunded request cannot be refunded again");
    // Refused (balance too low): nothing recorded as refunded, and staff are told why.
    await copy("INZ-T-PO-LOW", "788120000");
    await assert.rejects(() => quiet(() => sendRefund("INZ-T-PO-LOW", by)), (e: unknown) => e instanceof PayoutRefused && /balance is too low/.test((e as Error).message));
    assert.equal(await txStatus("INZ-T-PO-LOW"), "paid");
    assert.equal((await payout("INZ-T-PO-LOW")).status, "failed");

    // IntouchPay, through a stand-in: no answer, then an answer that is still pending, then confirmed.
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    Object.assign(process.env, { PAYMENT_PROVIDER: "live", INTOUCHPAY_USERNAME: "bob", INTOUCHPAY_ACCOUNT_NO: "250160000011", INTOUCHPAY_PARTNER_PASSWORD: "x", INTOUCHPAY_BASE_URL: `http://127.0.0.1:${address.port}/api` });
    await copy("INZ-T-PO-LIVE", "788123456");
    assert.equal((await quiet(() => sendRefund("INZ-T-PO-LIVE", by))).status, "pending", "no answer: it may have been sent, so it waits");
    assert.equal(await txStatus("INZ-T-PO-LIVE"), "paid", "and nothing is recorded as refunded yet");
    await assert.rejects(() => sendRefund("INZ-T-PO-LIVE", by), /already being sent/, "a second click does not send it again");
    const silent = await payout("INZ-T-PO-LIVE");
    assert.equal(await reconcilePayout(silent.id), "pending", "with no IntouchPay id it cannot be asked about");
    assert.equal(await closeUnclearPayout(silent.id, by), true, "staff close it after checking the IntouchPay portal");
    mode = "pending";
    assert.equal((await quiet(() => sendRefund("INZ-T-PO-LIVE", by))).status, "pending");
    const waiting = await payout("INZ-T-PO-LIVE");
    assert.match(waiting.providerRef ?? "", /^intouch:\d+:DEP1$/);
    assert.equal(await quiet(() => reconcilePayout(waiting.id)), "pending");
    mode = "sent";
    assert.equal(await quiet(() => reconcilePayout(waiting.id)), "sent", "confirmed by its status");
    assert.equal(await txStatus("INZ-T-PO-LIVE"), "refunded");
    assert.equal(await quiet(() => reconcilePayout(waiting.id)), "sent", "and recorded once");
    assert.equal(Number((await d.execute(sql.raw(`select count(*) n from audit where action = 'Refund sent' and entity like 'INZ-T-PO-LIVE%'`))).rows[0].n), 1);
  } finally {
    server.close();
    for (const [k, v] of prev) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    const list = refs.map((r) => `'${r}'`).join(", ");
    for (const t of ["payouts", "events", "transactions", "outbox", "notes"]) await d.execute(sql.raw(`delete from ${t} where ref in (${list})`));
    await d.execute(sql.raw(`delete from requests where ref in (${list})`));
    await d.execute(sql.raw(`delete from audit where entity like 'INZ-T-PO-%'`));
    await d.execute(sql.raw(`delete from notifications where href like '%/INZ-T-PO-%'`));
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

await check("email: Resend first; SMTP takes over when Resend's quota is used up or it is down, not for a bad address", async () => {
  const { sendEmail } = await import("../lib/email.ts");
  const names = ["RESEND_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "EMAIL_PROVIDER", "SMTP_DAILY_LIMIT", "RESEND_DAILY_LIMIT"];
  const keep = Object.fromEntries(names.map((k) => [k, process.env[k]]));
  const g = globalThis as unknown as { __inziraMail?: unknown; __inziraResendPausedUntil?: number };
  const realFetch = globalThis.fetch;
  let answers: { status: number; body: unknown }[] = [];
  let fetches = 0;
  const smtp: { from?: string; to?: string }[] = [];
  globalThis.fetch = (async () => {
    fetches++;
    const a = answers.shift() ?? { status: 200, body: { id: "e1" } };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  g.__inziraMail = { sendMail: async (o: { from?: string; to?: string }) => { smtp.push(o); return {}; } };
  const mail = { to: "a@b.rw", subject: "s", text: "t" };
  try {
    Object.assign(process.env, { RESEND_API_KEY: "re_test", EMAIL_FROM: "Inzira <no-reply@inziraservices.com>", SMTP_HOST: "smtp.example", SMTP_USER: "box@old.rw", SMTP_PASS: "p", SMTP_FROM: "Inzira <box@old.rw>" });
    delete process.env.EMAIL_PROVIDER; delete process.env.SMTP_DAILY_LIMIT; delete process.env.RESEND_DAILY_LIMIT;
    delete g.__inziraResendPausedUntil;

    assert.equal(await sendEmail(mail), "resend");
    assert.equal(smtp.length, 0, "SMTP is not used while Resend works");

    answers = [{ status: 429, body: { name: "daily_quota_exceeded", message: "quota" } }];
    assert.equal(await sendEmail(mail), "smtp", "quota used up: SMTP sends it");
    assert.equal(smtp.at(-1)?.from, "Inzira <box@old.rw>", "SMTP sends as its own mailbox");
    fetches = 0;
    assert.equal(await quiet(() => sendEmail(mail)), "smtp");
    assert.equal(fetches, 0, "until midnight UTC, Resend is not asked again");

    delete g.__inziraResendPausedUntil;
    answers = [{ status: 500, body: {} }, { status: 500, body: {} }, { status: 500, body: {} }];
    assert.equal(await quiet(() => sendEmail(mail)), "smtp", "Resend down: SMTP sends it");

    smtp.length = 0;
    answers = [{ status: 422, body: { name: "validation_error", message: "Invalid `to` field." } }];
    await assert.rejects(sendEmail(mail), /Invalid `to`/);
    assert.equal(smtp.length, 0, "a bad address is not tried again on SMTP");

    process.env.EMAIL_PROVIDER = "smtp"; fetches = 0;
    assert.equal(await sendEmail(mail), "smtp", "EMAIL_PROVIDER=smtp switches Resend off");
    assert.equal(fetches, 0);

    delete process.env.EMAIL_PROVIDER; process.env.SMTP_DAILY_LIMIT = "1";
    answers = [{ status: 429, body: { name: "daily_quota_exceeded", message: "quota" } }];
    await assert.rejects(quiet(() => sendEmail(mail)), /daily email limit/, "both used up: the outbox waits an hour");
  } finally {
    globalThis.fetch = realFetch;
    delete g.__inziraMail; delete g.__inziraResendPausedUntil;
    for (const k of names) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
  }
});

await check("Kinyarwanda text: saved all together or not at all, served over the shipped text, restorable", async () => {
  const { saveContent, restoreContent, lastEdits } = await import("../lib/content-admin.ts");
  const { primeContent, contentEntries } = await import("../lib/content.ts");
  const { text } = await import("../lib/i18n/messages.ts");
  const { localizeService } = await import("../lib/i18n/present.ts");
  const { SERVICES } = await import("../lib/mock/catalogue.ts");
  const who = { name: "Diane", role: "Administrator" };
  const rows = () => d.select().from(s.content);
  const shipped = text("rw", "home.lead");
  const audited = async () => (await d.select().from(s.audit)).filter((a) => /Kinyarwanda text/.test(a.action));
  try {
    const refused = await quiet(() => saveContent(who, [{ key: "ui:home.lead", value: "Nshya" }, { key: "ui:nope.x", value: "x" }], SERVICES));
    assert.ok("errors" in refused && "ui:nope.x" in refused.errors && !("ui:home.lead" in refused.errors), "the unknown text is refused by name");
    assert.equal((await rows()).length, 0, "nothing was saved when one text was refused");
    assert.equal(text("rw", "home.lead"), shipped);

    assert.ok("errors" in await saveContent(who, [{ key: "ui:home.lead", value: "" }], SERVICES), "a text with shipped Kinyarwanda cannot be emptied");
    assert.ok("errors" in await saveContent(who, [{ key: "ui:stored.fee.amount", value: "Nta mubare" }], SERVICES), "a {placeholder} cannot be dropped");

    assert.deepEqual(await saveContent(who, [{ key: "ui:home.lead", value: "  Ibishya  " }, { key: `cat:services.${SERVICES[0].slug}.steps.0.title`, value: "Intambwe nshya" }], SERVICES), { saved: 2, restored: 0 });
    assert.equal(text("rw", "home.lead"), "Ibishya", "served at once on this server");
    assert.equal(localizeService(SERVICES[0], "rw").steps[0].title, "Intambwe nshya");
    assert.equal(text("en", "home.lead").includes("Ibishya"), false, "English is untouched");

    // Another server reads the same rows.
    const g = globalThis as unknown as { __inziraContent?: { loadedAt: number; entries: Record<string, string> } };
    g.__inziraContent = undefined;
    await primeContent(true);
    assert.equal(contentEntries()["ui:home.lead"], "Ibishya");
    assert.equal(text("rw", "home.lead"), "Ibishya");
    assert.equal((await lastEdits(["ui:home.lead"]))["ui:home.lead"].by, "Diane");
    assert.equal((await audited()).length, 1, "one audit line per save");

    assert.deepEqual(await saveContent(who, [{ key: "ui:home.lead", value: shipped }], SERVICES), { saved: 0, restored: 1 }, "writing the shipped text again removes the edit");
    assert.equal(text("rw", "home.lead"), shipped);
    assert.equal((await rows()).length, 1);

    assert.equal(await restoreContent(who, [`cat:services.${SERVICES[0].slug}.steps.0.title`, "ui:home.lead", "other:x"]), 1);
    assert.equal((await rows()).length, 0);
    assert.equal(localizeService(SERVICES[0], "rw").steps[0].title, "Utangira ubusabe");

    // A service added in the console gets Kinyarwanda from nothing.
    const fresh = { ...SERVICES[0], slug: "brand-new-service", name: "Brand new" };
    assert.deepEqual(await saveContent(who, [{ key: "cat:services.brand-new-service.name", value: "Serivisi nshya" }], [...SERVICES, fresh]), { saved: 1, restored: 0 });
    assert.equal(localizeService(fresh, "rw").name, "Serivisi nshya");
    assert.ok("errors" in await saveContent(who, [{ key: "cat:services.brand-new-service.name", value: "x" }], SERVICES), "a service that does not exist has no text to edit");
  } finally {
    await d.delete(s.content);
    await d.delete(s.audit).where(sql`${s.audit.action} like '%Kinyarwanda text%'`);
    await primeContent(true);
  }
  assert.equal(text("rw", "home.lead"), shipped, "no edits left: the shipped text again");
});
await check("a service saved with its Kinyarwanda: both are stored together, a refused line undoes the whole save", async () => {
  const { saveServiceText, serviceRwNow, ServiceTextRefused } = await import("../lib/content-admin.ts");
  const { primeContent } = await import("../lib/content.ts");
  const { localizeService } = await import("../lib/i18n/present.ts");
  const { shiftList, pathInService, serviceFields } = await import("../lib/service-text.ts");
  const { SERVICES } = await import("../lib/mock/catalogue.ts");
  const who = { name: "Diane", role: "Administrator" };
  const svc = SERVICES.find((x) => x.documents.length >= 3)!;
  const marker = `cat:services.${svc.slug}.managed`;
  const rows = () => d.select().from(s.content);
  try {
    // The English loses its first document: the editor moves the Kinyarwanda up with it.
    const now = serviceRwNow(svc);
    const english = { ...svc, documents: svc.documents.slice(1) };
    const rw = { ...shiftList(now, "documents", 0), name: "Izina ryahinduwe" };
    await d.transaction((tx) => saveServiceText(tx, who, english, rw));
    const stored = await rows();
    assert.ok(stored.some((r) => r.key === marker), "the service is marked as written in the console");
    assert.equal(stored.find((r) => r.key === `cat:services.${svc.slug}.name`)?.value, "Izina ryahinduwe");
    await primeContent(true);
    assert.equal(localizeService(english, "rw").documents[0].name, now["documents.1.name"], "the document kept its own Kinyarwanda");
    assert.equal(localizeService(english, "rw").name, "Izina ryahinduwe");
    const audited = (await d.select().from(s.audit)).filter((a) => /Kinyarwanda text/.test(a.action) && /with the service/.test(a.entity));
    assert.equal(audited.length, 1);

    // The same Kinyarwanda again: nothing changes and nothing is logged.
    await d.transaction((tx) => saveServiceText(tx, who, english, rw));
    assert.equal((await d.select().from(s.audit)).filter((a) => /with the service/.test(a.entity)).length, 1);

    // A refused line undoes the service change made in the same transaction.
    const before = (await d.select({ name: s.services.name }).from(s.services).where(eq(s.services.slug, svc.slug)))[0].name;
    await assert.rejects(quiet(() => d.transaction(async (tx) => {
      await tx.update(s.services).set({ name: "Changed in the same save" }).where(eq(s.services.slug, svc.slug));
      await saveServiceText(tx, who, english, { ...rw, name: "x".repeat(4001) });
    })), ServiceTextRefused);
    assert.equal((await d.select({ name: s.services.name }).from(s.services).where(eq(s.services.slug, svc.slug)))[0].name, before, "the English change was undone too");
    assert.equal((await rows()).find((r) => r.key === `cat:services.${svc.slug}.name`)?.value, "Izina ryahinduwe", "and the earlier Kinyarwanda is as it was");
    assert.equal(serviceFields(english).length > 10, true);
    void pathInService;
  } finally {
    await d.delete(s.content);
    await d.delete(s.audit).where(sql`${s.audit.action} like '%Kinyarwanda text%'`);
    await primeContent(true);
  }
});
await check("a permission added in a later release is given to the roles that database already has, once", async () => {
  const { ensureCatalogue } = await import("../lib/db/seed.ts");
  const has = async () => d.select().from(s.rolePermissions).where(eq(s.rolePermissions.permission, "editContent"));
  assert.equal((await has()).length, 6, "a new database has it from the start");
  await d.delete(s.rolePermissions).where(eq(s.rolePermissions.permission, "editContent"));
  await d.update(s.rolePermissions).set({ allowed: false }).where(sql`${s.rolePermissions.permission} = 'editServices' and ${s.rolePermissions.role} = 'Administrator'`);
  await ensureCatalogue(d);
  const rows = await has();
  assert.equal(rows.length, 6);
  assert.equal(rows.find((r) => r.role === "Owner")?.allowed, true);
  assert.equal(rows.find((r) => r.role === "Administrator")?.allowed, true);
  assert.equal(rows.find((r) => r.role === "Agent")?.allowed, false);
  const [kept] = await d.select().from(s.rolePermissions).where(sql`${s.rolePermissions.permission} = 'editServices' and ${s.rolePermissions.role} = 'Administrator'`);
  assert.equal(kept.allowed, false, "an existing row, changed by the owner, is left as it is");
  await d.update(s.rolePermissions).set({ allowed: true }).where(sql`${s.rolePermissions.permission} = 'editServices' and ${s.rolePermissions.role} = 'Administrator'`);
});

await check("categories: the Courts category ships hidden-until-priced, administrators own the order, hidden ones leave the site", async () => {
  const { ensureCatalogue } = await import("../lib/db/seed.ts");
  const { getCategoryMark, getService, listCategories, listNavCategories, listServices, markUrl } = await import("../lib/repo.ts");
  const { officesFor } = await import("../lib/institutions.ts");
  const { saveCategoryText, categoryRwNow } = await import("../lib/content-admin.ts");
  const { primeContent } = await import("../lib/content.ts");
  const { localizeCategory } = await import("../lib/i18n/present.ts");
  const ids = async (includeHidden = false) => (await listCategories({ includeHidden })).map((c) => c.id);
  const order = await ids();
  assert.ok(order.includes("iecms"), "the Courts category is there");
  assert.equal(order.indexOf("iecms") < order.indexOf("other"), true, "and sits before the catch-all");
  const courts = (await listServices({ includeHidden: true })).filter((x) => x.category === "iecms");
  assert.equal(courts.length, 4);
  assert.ok(courts.every((x) => !x.visible), "the court services start as drafts until someone sets their prices");
  assert.equal((await listServices()).some((x) => x.category === "iecms"), false);
  assert.equal((await listNavCategories()).some((c) => c.id === "iecms"), false, "a category with no visible service is not in the menu");

  // An administrator's edits to a category survive a restart (ensureCatalogue runs on every start).
  await d.update(s.categories).set({ desc: "Edited by an administrator", position: 41 }).where(eq(s.categories.id, "tax"));
  await d.update(s.services).set({ visible: true }).where(eq(s.services.slug, "judgment-copy"));
  await ensureCatalogue(d);
  const tax = (await listCategories()).find((c) => c.id === "tax")!;
  assert.equal(tax.desc, "Edited by an administrator");
  assert.equal((await ids()).at(-1), "tax", "and so does the order they set");
  assert.equal((await listNavCategories()).some((c) => c.id === "iecms"), true, "one visible service puts the category in the menu");

  // Institution and logo: a category with either is an office of its own.
  assert.equal(officesFor(await listCategories()).some((o) => o.code === "iecms" && o.name === "Rwanda Judiciary" && o.fromCategory), true);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await d.update(s.categories).set({ markData: png.toString("base64"), markType: "image/png", markRev: 3 }).where(eq(s.categories.id, "iecms"));
  assert.equal((await listCategories()).find((c) => c.id === "iecms")!.mark, markUrl("iecms", 3));
  assert.deepEqual((await getCategoryMark("iecms"))?.bytes, png);
  assert.equal(await getCategoryMark("tax"), null);

  // Hiding a category takes its services and its office off the site, but not out of the console.
  await d.update(s.categories).set({ visible: false }).where(eq(s.categories.id, "iecms"));
  assert.equal((await ids()).includes("iecms"), false);
  assert.equal((await ids(true)).includes("iecms"), true);
  assert.equal((await listServices()).some((x) => x.slug === "judgment-copy"), false);
  assert.equal((await getService("judgment-copy"))?.visible, false, "customers cannot start a request for it");
  assert.equal((await listServices({ includeHidden: true })).find((x) => x.slug === "judgment-copy")?.visible, true, "the console still sees its own setting");
  assert.equal(officesFor(await listCategories()).some((o) => o.code === "iecms"), false);

  // The Kinyarwanda of a category is stored with it and read back over the shipped text.
  const who = { name: "Diane", role: "Administrator" };
  try {
    await d.transaction((tx) => saveCategoryText(tx, who, "iecms", { name: "Inkiko nshya", institution: "" }));
    await primeContent(true);
    assert.equal(localizeCategory({ id: "iecms", icon: "c-court", name: "Courts / IECMS", short: "Courts", desc: "d", institution: "Rwanda Judiciary" }, "rw").name, "Inkiko nshya");
    assert.equal(categoryRwNow("iecms").institution, "Urwego rw'Ubucamanza", "an empty text leaves the shipped Kinyarwanda");
    await d.transaction((tx) => saveCategoryText(tx, who, "iecms", { name: "" }));
    await primeContent(true);
    assert.equal(categoryRwNow("iecms").name, "Inkiko / IECMS", "emptying it brings the shipped text back");
  } finally {
    await d.delete(s.content);
    await d.delete(s.audit).where(sql`${s.audit.action} like '%Kinyarwanda text%'`);
    await primeContent(true);
    await d.update(s.categories).set({ visible: true, markData: null, markType: null, desc: "x" }).where(eq(s.categories.id, "iecms"));
    await d.update(s.services).set({ visible: false }).where(eq(s.services.slug, "judgment-copy"));
  }
});

console.log(process.exitCode ? "backend checks FAILED" : `backend checks ok (${passed})`);
process.exit(process.exitCode ?? 0);
