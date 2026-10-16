// Unit tests for the parts where a mistake costs money or leaks data. Run: npm run test:unit
import assert from "node:assert/strict";
import { base32, codeAt, fromBase32, matchStep, newRecoveryCodes, normaliseRecovery, hashRecovery, otpauthUrl } from "../lib/totp.ts";
import { open, seal, isSealed } from "../lib/crypto.ts";
import { sniffType } from "../lib/storage.ts";
import { safeReturnPath } from "../lib/return-path.ts";
import { amountDue, payStatus } from "../lib/status.ts";

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e); process.exitCode = 1; } };

// ---- authenticator codes: RFC 6238 appendix B vectors (SHA-1; the last six digits of the 8-digit values)
const rfc = base32(Buffer.from("12345678901234567890"));
test("totp matches the RFC 6238 vectors", () => {
  for (const [t, want] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]] as const) {
    assert.equal(codeAt(rfc, Math.floor(t / 30)), want, `t=${t}`);
  }
});
test("totp accepts one step either side and no more", () => {
  assert.equal(matchStep(rfc, "287082", 59_000), 1);
  assert.equal(matchStep(rfc, "287082", 89_000), 1);
  assert.equal(matchStep(rfc, "287082", 149_000), null);
  assert.equal(matchStep(rfc, "12345", 59_000), null);
  assert.equal(matchStep(rfc, "abcdef", 59_000), null);
});
test("base32 round-trips", () => assert.equal(fromBase32(rfc).toString(), "12345678901234567890"));
test("recovery codes: normalised, hashed, distinct", () => {
  const codes = newRecoveryCodes(8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) { assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/); assert.equal(hashRecovery(c.toUpperCase().replace("-", " ")), hashRecovery(c)); }
  assert.equal(normaliseRecovery(" AB CDE-fghjk "), "abcde-fghjk");
});
test("otpauth link carries the secret and issuer", () => assert.match(otpauthUrl("ABCD", "Eric K"), /^otpauth:\/\/totp\/Inzira%3AEric%20K\?secret=ABCD&issuer=Inzira/));
test("return path keeps a console, portal, or admin page and drops the rest", () => {
  assert.equal(safeReturnPath("/console/requests/INZ-2026-04790"), "/console/requests/INZ-2026-04790");
  assert.equal(safeReturnPath("/portal/requests/INZ-2026-04761?x=1"), "/portal/requests/INZ-2026-04761?x=1");
  assert.equal(safeReturnPath("/admin/system"), "/admin/system");
  assert.equal(safeReturnPath("/console"), "/console");
  assert.equal(safeReturnPath("//evil.example/console"), null);
  assert.equal(safeReturnPath("/console.evil.example"), null);
  assert.equal(safeReturnPath("https://evil.example/console"), null);
  assert.equal(safeReturnPath("/services"), null);
  assert.equal(safeReturnPath(null), null);
});

// ---- encryption of ID and TIN numbers
test("crypto: seal and open", () => {
  const a = seal("1199880012345678")!;
  assert.ok(isSealed(a)); assert.ok(!a.includes("1199880012345678"));
  assert.equal(open(a), "1199880012345678");
  assert.notEqual(seal("1199880012345678"), a, "a fresh nonce every time");
  assert.equal(seal(a), a, "never sealed twice");
  assert.equal(seal(""), null); assert.equal(seal(null), null); assert.equal(open(null), null);
  assert.equal(open("123456789"), "123456789", "legacy plain values pass through until encrypted");
});
test("crypto: a tampered value does not open", () => {
  const a = seal("123456789")!;
  const parts = a.split(":"); parts[4] = (parts[4][0] === "A" ? "B" : "A") + parts[4].slice(1);
  const origError = console.error; console.error = () => {};
  try { assert.equal(open(parts.join(":")), null); } finally { console.error = origError; }
});
test("crypto: the previous key still opens old values after a rotation", () => {
  const k1 = "11".repeat(32), k2 = "22".repeat(32);
  process.env.DATA_KEY = k1; const old = seal("999")!;
  process.env.DATA_KEY = k2; process.env.DATA_KEY_PREVIOUS = k1;
  assert.equal(open(old), "999");
  delete process.env.DATA_KEY_PREVIOUS;
  const origError = console.error; console.error = () => {};
  try { assert.equal(open(old), null); } finally { console.error = origError; }
  delete process.env.DATA_KEY;
});
test("crypto: a malformed key is refused", () => {
  process.env.DATA_KEY = "tooshort";
  assert.throws(() => seal("1"), /32 bytes/);
  delete process.env.DATA_KEY;
});

// ---- upload content sniffing
const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(Math.max(0, 16 - b.length)).fill(0)]);
const text = (s: string) => new TextEncoder().encode(s.padEnd(16, " "));
test("sniffType recognises the allowed formats by content", () => {
  assert.equal(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffType(text("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffType(text("\0\0\0\x18ftypheic")), "image/heic");
  assert.equal(sniffType(text("%PDF-1.7\n")), "application/pdf");
});
test("sniffType refuses what is not an allowed format, whatever it is called", () => {
  assert.equal(sniffType(text("<html><script>alert(1)</script>")), null);
  assert.equal(sniffType(text("MZ\x90\0 a Windows program")), null);
  assert.equal(sniffType(text("#!/bin/sh\nrm -rf /")), null);
  assert.equal(sniffType(bytes(1, 2, 3)), null);
});

// ---- money: what is still due, and how a request's payment is described
const base = { invoice: "INZ-R-1", official: 5000, officialLabel: "Fee", ours: 15000, oursStandard: 15000, quote: "confirmed" as const, officialReceipt: "awaiting" as const, transactions: [] as never[] };
const tx = (status: string, official: number, ours: number) => ({ receipt: "r", at: "2026-01-01T00:00:00Z", method: "MTN MoMo", official, ours, status }) as never;
test("amountDue: nothing paid is the whole of both fees", () => assert.equal(amountDue(base as never), 20000));
test("amountDue: only paid payments count", () => {
  assert.equal(amountDue({ ...base, transactions: [tx("paid", 5000, 15000)] } as never), 0);
  assert.equal(amountDue({ ...base, transactions: [tx("paid", 5000, 0)] } as never), 15000);
  assert.equal(amountDue({ ...base, transactions: [tx("pending", 5000, 15000)] } as never), 20000, "a prompt nobody approved is not money");
  assert.equal(amountDue({ ...base, transactions: [tx("failed", 5000, 15000)] } as never), 20000);
  assert.equal(amountDue({ ...base, transactions: [tx("refunded", 5000, 15000)] } as never), 20000, "a refunded payment is due again");
});
test("amountDue: never negative", () => assert.equal(amountDue({ ...base, transactions: [tx("paid", 9000, 99000)] } as never), 0));
test("amountDue: an official fee not yet known counts as nothing", () => assert.equal(amountDue({ ...base, official: null, transactions: [] } as never), 15000));
test("payStatus: quote, unpaid, overdue, part, pending, paid, refunded", () => {
  const now = "2026-06-01T00:00:00Z";
  assert.equal(payStatus({ ...base, quote: "estimate" } as never, now), "quote");
  assert.equal(payStatus({ ...base, dueAt: "2026-07-01T00:00:00Z" } as never, now), "unpaid");
  assert.equal(payStatus({ ...base, dueAt: "2026-05-01T00:00:00Z" } as never, now), "overdue");
  assert.equal(payStatus({ ...base, transactions: [tx("paid", 5000, 0)] } as never, now), "part");
  assert.equal(payStatus({ ...base, transactions: [tx("pending", 5000, 15000)] } as never, now), "pending");
  assert.equal(payStatus({ ...base, transactions: [tx("paid", 5000, 15000)] } as never, now), "paid");
  assert.equal(payStatus({ ...base, transactions: [tx("refunded", 5000, 15000)] } as never, now), "refunded");
});

// ---- IntouchPay: password, status codes, callback identity, and a local stand-in of the published API
const { createHash } = await import("node:crypto");
const { createServer } = await import("node:http");
const intouch = await import("../lib/intouchpay.ts");

const asyncTest = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e); process.exitCode = 1; }
};

await asyncTest("intouch password is sha256 of username, account, partner password and timestamp", async () => {
  const stamp = "20161231115242";
  const want = createHash("sha256").update("bob250160000011pass123456789" + stamp, "utf8").digest("hex");
  assert.equal(intouch.intouchPassword("bob", "250160000011", "pass123456789", stamp), want);
  assert.equal(intouch.intouchTimestamp(new Date("2016-12-31T11:52:42Z")), stamp);
});

await asyncTest("intouch status codes follow the guide, and a denied success is not paid", async () => {
  assert.equal(intouch.paymentOutcome({ success: true, responsecode: "1000", status: "Pending" }), "pending");
  assert.equal(intouch.paymentOutcome({ success: true, responsecode: "01", status: "Successfull" }), "paid");
  assert.equal(intouch.paymentOutcome({ success: false, responsecode: "01", status: "Successfull" }), "pending");
  assert.equal(intouch.paymentOutcome({ success: false, responsecode: "1002" }), "failed");
  assert.equal(intouch.paymentOutcome({ success: false, responsecode: "2400" }), "pending");
  assert.equal(intouch.paymentOutcome({ success: false, responsecode: "3100" }), "missing");
  assert.equal(intouch.paymentOutcome({ success: true, status: "Something new" }), "pending");
});

await asyncTest("intouch callback is only an identifier, and a second transaction id is ignored", async () => {
  assert.equal(intouch.readIntouchCallback({ status: "Successfull", responsecode: "01" }), null);
  const read = intouch.readIntouchCallback({ jsonpayload: { requesttransactionid: "4522233", transactionid: "6004994884", responsecode: "01", status: "Successfull" } });
  assert.deepEqual(read, { requestId: "4522233", transactionId: "6004994884", responsecode: "01" });
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233", "6004994884", "4522233"), "intouch:4522233:6004994884");
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233:6004994884", "111", "4522233"), null);
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233", "6004994884", "999"), null);
  assert.equal(intouch.withIntouchTransactionId("mtn:abc", "6004994884", "abc"), null);
});

await asyncTest("intouch callback basic auth matches only the configured pair", async () => {
  const prevUser = process.env.INTOUCHPAY_CALLBACK_USER;
  const prevPass = process.env.INTOUCHPAY_CALLBACK_PASSWORD;
  delete process.env.INTOUCHPAY_CALLBACK_USER;
  delete process.env.INTOUCHPAY_CALLBACK_PASSWORD;
  assert.equal(intouch.callbackAuthorized(null), true);
  process.env.INTOUCHPAY_CALLBACK_USER = "callback-user";
  process.env.INTOUCHPAY_CALLBACK_PASSWORD = "callback-secret";
  const header = `Basic ${Buffer.from("callback-user:callback-secret").toString("base64")}`;
  assert.equal(intouch.callbackAuthorized(header), true);
  assert.equal(intouch.callbackAuthorized(`Basic ${Buffer.from("callback-user:nope").toString("base64")}`), false);
  assert.equal(intouch.callbackAuthorized(null), false);
  if (prevUser === undefined) delete process.env.INTOUCHPAY_CALLBACK_USER; else process.env.INTOUCHPAY_CALLBACK_USER = prevUser;
  if (prevPass === undefined) delete process.env.INTOUCHPAY_CALLBACK_PASSWORD; else process.env.INTOUCHPAY_CALLBACK_PASSWORD = prevPass;
});

await asyncTest("intouch client speaks the published request and status calls", async () => {
  const seen: { url: string; type: string; body: string }[] = [];
  let statusCode = "1000";
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      seen.push({ url: req.url ?? "", type: req.headers["content-type"] ?? "", body });
      res.setHeader("content-type", "application/json");
      if ((req.url ?? "").includes("requestpayment")) {
        const form = new URLSearchParams(body);
        if (form.get("requesttransactionid") === "dup0000000000001") {
          res.end(JSON.stringify({ success: false, responsecode: "2400", requesttransactionid: "dup0000000000001" }));
          return;
        }
        if (form.get("password") === "wrong") {
          res.end(JSON.stringify({ success: false, responsecode: "0005" }));
          return;
        }
        res.end(JSON.stringify({ status: "Pending", requesttransactionid: form.get("requesttransactionid"), success: true, responsecode: "1000", transactionid: 1425, message: "Transaction Pending" }));
        return;
      }
      res.end(JSON.stringify({ success: true, responsecode: statusCode, status: statusCode === "01" ? "Successfull" : "Pending", message: "Pending" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const prev = {
    provider: process.env.PAYMENT_PROVIDER,
    user: process.env.INTOUCHPAY_USERNAME,
    account: process.env.INTOUCHPAY_ACCOUNT_NO,
    pass: process.env.INTOUCHPAY_PARTNER_PASSWORD,
    base: process.env.INTOUCHPAY_BASE_URL,
    node: process.env.NODE_ENV,
  };
  process.env.INTOUCHPAY_USERNAME = "bob";
  process.env.INTOUCHPAY_ACCOUNT_NO = "250160000011";
  process.env.INTOUCHPAY_PARTNER_PASSWORD = "pass123456789";
  process.env.INTOUCHPAY_BASE_URL = `http://127.0.0.1:${address.port}/api`;
  try {
    const sent = await intouch.requestIntouchPayment({ requestId: "4522233", phone9: "788123456", amount: 1000, callbackUrl: "https://example.test/api/payments/callback?tx=4" });
    assert.equal(sent.transactionId, "1425");
    assert.equal(sent.code, "1000");
    const form = new URLSearchParams(seen[0].body);
    assert.equal(seen[0].type, "application/x-www-form-urlencoded");
    assert.equal(form.get("mobilephone"), "250788123456");
    assert.equal(form.get("accountno"), "250160000011");
    assert.equal(form.get("amount"), "1000");
    assert.equal(form.get("callbackurl"), "https://example.test/api/payments/callback?tx=4");
    assert.equal(form.get("partnerpassword"), null);
    assert.ok(!seen[0].body.includes("pass123456789"));
    const stamp = form.get("timestamp") ?? "";
    assert.equal(form.get("password"), intouch.intouchPassword("bob", "250160000011", "pass123456789", stamp));
    const pending = await intouch.intouchPaymentStatus("4522233", "1425");
    assert.equal(pending.status, "pending");
    assert.match(seen[1].type, /application\/json/);
    const statusBody = JSON.parse(seen[1].body) as { requesttransactionid: string; transactionid: string };
    assert.equal(statusBody.requesttransactionid, "4522233");
    assert.equal(statusBody.transactionid, "1425");
    assert.ok(!seen[1].body.includes("pass123456789"));
    statusCode = "01";
    assert.equal((await intouch.intouchPaymentStatus("4522233", "1425")).status, "paid");
    const duplicate = await intouch.requestIntouchPayment({ requestId: "dup0000000000001", phone9: "788123456", amount: 1000 });
    assert.equal(duplicate.code, "2400");
    assert.equal(duplicate.transactionId, undefined);
    await assert.rejects(() => intouch.requestIntouchPayment({ requestId: "bad", phone9: "788123456", amount: 0 }), /positive number/);
    process.env.NODE_ENV = "production";
    await assert.rejects(() => intouch.requestIntouchPayment({ requestId: "https", phone9: "788123456", amount: 100 }), /HTTPS/);
  } finally {
    server.close();
    const restore = (key: string, value: string | undefined) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
    restore("PAYMENT_PROVIDER", prev.provider);
    restore("INTOUCHPAY_USERNAME", prev.user);
    restore("INTOUCHPAY_ACCOUNT_NO", prev.account);
    restore("INTOUCHPAY_PARTNER_PASSWORD", prev.pass);
    restore("INTOUCHPAY_BASE_URL", prev.base);
    restore("NODE_ENV", prev.node);
  }
});

console.log(process.exitCode ? "unit tests FAILED" : `unit tests ok (${passed})`);
