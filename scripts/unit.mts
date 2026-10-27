// Unit tests for the parts where a mistake costs money or leaks data. Run: npm run test:unit
import assert from "node:assert/strict";
import { base32, codeAt, fromBase32, matchStep, newRecoveryCodes, normaliseRecovery, hashRecovery, otpauthUrl } from "../lib/totp.ts";
import { open, seal, isSealed } from "../lib/crypto.ts";
import { sniffType } from "../lib/storage.ts";
import { safeReturnPath } from "../lib/return-path.ts";
import { amountDue, payableNow, payStatus, refundSplit } from "../lib/status.ts";
import { canDeliverEmailCodes, isReservedTestEmail, sendEmail, sendingDomain, showsEmailCodeOnScreen } from "../lib/email.ts";
import { idAsk, idPolicyOf, mentionsNationalId, nationalIdDigits, nationalIdError } from "../lib/identity.ts";
import { cleanTaxRef, periodsBetween, taxPhase, weekdayOnOrBefore } from "../lib/tax-calendar.ts";
import { providerFor } from "../lib/payments.ts";
import { GATED_STAGES, PAYMENT_LOCK, isGated, lockMessage, paymentLock } from "../lib/payment-gate.ts";
import { checkoutPrice, optionRange, quoteRefusal, reviewFeeFor, withOption } from "../lib/pricing.ts";
import { cleanAnswer, isAsked } from "../lib/identifiers.ts";
import { hashPassword, passwordProblem, verifyPassword } from "../lib/password.ts";
import catalogueEn from "../lib/i18n/catalogue-en.json" with { type: "json" };
import catalogueRw from "../lib/i18n/catalogue-rw.json" with { type: "json" };
import { SERVICES } from "../lib/mock/catalogue.ts";
import { barePath, blockedHost, isIndexable, isSharedPage, languageAlternates, withLocale } from "../lib/seo.ts";
import { customerWhatsAppUrl, defaultFollowUpAt, deskChecks, fromKigaliDateTime, handoverRequired, kigaliDateTimeParts, nextKind, nextSentence, stageTargetRows } from "../lib/desk.ts";
import { text as i18nText } from "../lib/i18n/messages.ts";

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (e) { console.error(`FAIL ${name}\n`, e); process.exitCode = 1; } };

// ---- authenticator codes: RFC 6238 appendix B vectors (SHA-1; the last six digits of the 8-digit values)
const rfc = base32(Buffer.from("12345678901234567890"));
test("refunds return the official fee only while we still hold it", () => {
  const transactions = [{ status: "paid", official: 500, ours: 2000 }, { status: "failed", official: 500, ours: 2000 }];
  assert.deepEqual(refundSplit({ transactions, officialReceipt: "awaiting" }), { official: 500, ours: 2000, total: 2500 });
  assert.deepEqual(refundSplit({ transactions, officialReceipt: "attached" }), { official: 0, ours: 2000, total: 2000 });
  assert.equal(refundSplit({ transactions: [], officialReceipt: "awaiting" }).total, 0);
});
test("the catalogue's one-payment services carry a checked Irembo fee in the checkout total", () => {
  const birth = SERVICES.find((s) => s.slug === "birth-certificate")!;
  assert.deepEqual(checkoutPrice(birth), { official: 500, ours: 2000, total: 2500, direct: false });
  const spouse = SERVICES.find((s) => s.slug === "land-spouse-update")!;
  assert.deepEqual(checkoutPrice(spouse), { official: 0, ours: 5000, total: 5000, direct: false });
  for (const s of SERVICES) for (const q of s.questions ?? []) assert.match(q.key, /^[a-z]+$/, `${s.slug} question key`);
  assert.ok(!SERVICES.some((s) => s.documents.some((d) => d.required && d.name === "National ID")), "no service asks for an ID photo the number replaces");
});
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
test("pay at checkout: only a settled price skips the quote", () => {
  const svc = (o: { amount?: number | null; mode?: "none" | "direct"; verified?: boolean; ours?: number; unit?: string; visible?: boolean }) =>
    ({ official: { amount: o.amount ?? null, mode: o.mode, verifiedAt: o.verified ? "2026-10-01T00:00:00Z" : undefined }, ours: o.ours ?? 5000, oursUnit: o.unit, visible: o.visible ?? true }) as never;
  // Nothing passes through us: our fee is the whole price.
  assert.deepEqual(checkoutPrice(svc({ mode: "direct", ours: 2000 })), { official: 0, ours: 2000, total: 2000, direct: true });
  assert.deepEqual(checkoutPrice(svc({ amount: 0, mode: "none", ours: 20000 })), { official: 0, ours: 20000, total: 20000, direct: false });
  // A known official fee counts only once Inzira has checked it; then it is added.
  assert.equal(checkoutPrice(svc({ amount: 12000, ours: 8000 })), null, "an unchecked official fee is quoted by an agent");
  assert.deepEqual(checkoutPrice(svc({ amount: 12000, verified: true, ours: 8000 })), { official: 12000, ours: 8000, total: 20000, direct: false });
  assert.equal(checkoutPrice(svc({ amount: null, verified: true, ours: 8000 })), null, "an official fee still to be confirmed is not settled");
  // A fee that depends on a count (per year, month, property) needs an agent to count it.
  assert.equal(checkoutPrice(svc({ mode: "direct", ours: 10000, unit: "per year" })), null);
  assert.equal(checkoutPrice(svc({ mode: "direct", ours: 1000, unit: "per UPI, per year" })), null);
  // No price of ours, or a hidden service: no checkout.
  assert.equal(checkoutPrice(svc({ mode: "none", ours: 0 })), null);
  assert.equal(checkoutPrice(svc({ mode: "direct", ours: 3000, visible: false })), null);
});
test("review fee: a quoted service starts with it, a settled price never does, and it is never more than our fee", () => {
  const svc = (o: { amount?: number | null; mode?: "none" | "direct"; verified?: boolean; ours?: number; unit?: string }) =>
    ({ official: { amount: o.amount ?? null, mode: o.mode, verifiedAt: o.verified ? "2026-10-01T00:00:00Z" : undefined }, ours: o.ours ?? 5000, oursUnit: o.unit, visible: true }) as never;
  assert.equal(reviewFeeFor(svc({ amount: 12000, ours: 8000 }), 1000), 1000, "quoted: an unchecked official fee");
  assert.equal(reviewFeeFor(svc({ mode: "direct", ours: 10000, unit: "per year" }), 1000), 1000, "quoted: counted per year");
  assert.equal(reviewFeeFor(svc({ mode: "direct", ours: 2000 }), 1000), null, "a settled price is paid in full instead");
  assert.equal(reviewFeeFor(svc({ amount: 12000, ours: 500 }), 1000), 500, "capped at our fee, since it is taken off it");
  assert.equal(reviewFeeFor(svc({ amount: 12000, ours: 8000 }), 0), null, "a fee of 0 turns it off");
});
test("review fee: what the pay screen charges, and that it counts toward the quote", () => {
  const quoted = { ...base, official: null, ours: 8000, quote: "estimate" as const, reviewFee: 1000 };
  assert.deepEqual(payableNow(quoted as never, true), { amount: 1000, review: true }, "at checkout: the review fee");
  assert.deepEqual(payableNow({ ...quoted, transactions: [tx("paid", 0, 1000)] } as never, true), { amount: 0, review: true }, "paid: nothing more at checkout");
  assert.deepEqual(payableNow({ ...quoted, transactions: [tx("paid", 0, 1000)] } as never, false), { amount: 0, review: false }, "being quoted: nothing to pay yet");
  assert.equal(payStatus({ ...quoted, transactions: [tx("paid", 0, 1000)] } as never, "2026-10-02T00:00:00Z"), "quote", "a paid review fee still reads as fees to be confirmed");
  const confirmed = { ...quoted, official: 2000, quote: "confirmed" as const, transactions: [tx("paid", 0, 1000)] };
  assert.deepEqual(payableNow(confirmed as never, false), { amount: 9000, review: false }, "the quote asks for the rest: 2,000 + 8,000 − 1,000");
  assert.deepEqual(payableNow({ ...base, quote: "confirmed" } as never, true), { amount: 20000, review: false }, "a full-price checkout charges the whole price");
});
test("review fee: staff can quote a request sent with one, not one paid in full or not paid yet", () => {
  assert.equal(quoteRefusal({ checkout: "none", reviewFee: null }), null);
  assert.equal(quoteRefusal({ checkout: "paid", reviewFee: 1000 }), null);
  assert.match(quoteRefusal({ checkout: "paid", reviewFee: null }) ?? "", /paid at checkout/);
  assert.match(quoteRefusal({ checkout: "open", reviewFee: 1000 }) ?? "", /not paid/);
});
test("payment lock: preparing, submitting and completing wait for payment in full", () => {
  const tx = (status: "pending" | "paid" | "failed" | "refunded", official: number, ours: number) => ({ receipt: "R", at: "2026-10-01T10:00:00Z", method: "MTN MoMo" as const, official, ours, status });
  const bill = (o: { official: number | null; mode?: "none" | "direct"; ours: number; txs?: ReturnType<typeof tx>[] }) =>
    ({ invoice: "I-1", official: o.official, officialLabel: "", officialMode: o.mode, ours: o.ours, oursStandard: o.ours, quote: "confirmed", officialReceipt: "na", transactions: o.txs ?? [] }) as never;
  assert.deepEqual([...GATED_STAGES], ["preparing", "institution", "completed"]);
  assert.equal(isGated("checking"), false);
  assert.equal(isGated("received"), false);
  assert.equal(isGated("institution"), true);
  // Nothing paid: locked, and what is due is the official fee plus ours.
  const unpaid = paymentLock(bill({ official: 12000, ours: 8000 }));
  assert.deepEqual(unpaid, { locked: true, due: 20000, feesKnown: true });
  // Part paid is still locked; a prompt that has not been approved is not payment; a failed or refunded one is not either.
  assert.equal(paymentLock(bill({ official: 12000, ours: 8000, txs: [tx("paid", 0, 8000)] })).due, 12000);
  assert.equal(paymentLock(bill({ official: 12000, ours: 8000, txs: [tx("pending", 12000, 8000)] })).locked, true);
  assert.equal(paymentLock(bill({ official: 12000, ours: 8000, txs: [tx("failed", 12000, 8000), tx("refunded", 12000, 8000)] })).locked, true);
  // Paid in full: open. Paying the institution direct, or no official fee, leaves only our fee.
  assert.equal(paymentLock(bill({ official: 12000, ours: 8000, txs: [tx("paid", 12000, 8000)] })).locked, false);
  assert.equal(paymentLock(bill({ official: null, mode: "direct", ours: 10000, txs: [tx("paid", 0, 10000)] })).locked, false);
  assert.equal(paymentLock(bill({ official: 0, ours: 5000, txs: [tx("paid", 0, 5000)] })).locked, false);
  // Fees not confirmed yet: locked even though nothing is owed on paper.
  const unknown = paymentLock(bill({ official: null, ours: 0 }));
  assert.deepEqual(unknown, { locked: true, due: 0, feesKnown: false });
  // A free service (no official fee, nothing of ours) is not locked.
  assert.equal(paymentLock(bill({ official: null, mode: "none", ours: 0 })).locked, false);
  // The refusal starts with the marker a screen looks for, and says who can lift it.
  assert.ok(lockMessage(unpaid, false).startsWith(PAYMENT_LOCK));
  assert.ok(lockMessage(unpaid, false).includes("Ask a supervisor"));
  assert.ok(!lockMessage(unpaid, true).includes("Ask a supervisor"));
  assert.ok(lockMessage(unpaid, true).includes("20,000"));
  assert.ok(lockMessage(unknown, true).includes("fees have not been confirmed"));
});
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
  assert.equal(intouch.paymentOutcome({ success: true, status: "TimedOut" }), "failed", "the sandbox's timed-out prompt is closed, not left waiting");
  assert.equal(intouch.paymentOutcome({ status: "Timed Out" }), "failed");
  assert.equal(intouch.paymentOutcome({ success: true, status: "Successful", responsecode: "01" }), "paid");
});

await asyncTest("intouch callback is only an identifier, and a second transaction id is ignored", async () => {
  assert.equal(intouch.readIntouchCallback({ status: "Successfull", responsecode: "01" }), null);
  const read = intouch.readIntouchCallback({ jsonpayload: { requesttransactionid: "4522233", transactionid: "6004994884", responsecode: "01", status: "Successfull" } });
  assert.deepEqual(read, { requestId: "4522233", transactionId: "6004994884", responsecode: "01", outcome: "paid" });
  assert.equal(intouch.readIntouchCallback({ jsonpayload: { requesttransactionid: "1", transactionid: "2", responsecode: "1005", status: "Failed" } })?.outcome, "failed");
  assert.equal(intouch.readIntouchCallback({ jsonpayload: { requesttransactionid: "1", transactionid: "2", status: "Something new" } })?.outcome, "pending");
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233", "6004994884", "4522233"), "intouch:4522233:6004994884");
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233:6004994884", "111", "4522233"), null);
  assert.equal(intouch.withIntouchTransactionId("intouch:4522233", "6004994884", "999"), null);
  assert.equal(intouch.withIntouchTransactionId("mtn:abc", "6004994884", "abc"), null);
});

await asyncTest("intouch request ids are sixteen digits and differ within a millisecond", async () => {
  const { newIntouchRequestId } = await import("../lib/payments.ts");
  const ids = Array.from({ length: 50 }, () => newIntouchRequestId());
  for (const id of ids) assert.match(id, /^\d{16}$/);
  assert.ok(Number.isSafeInteger(Number(ids[0])));
  assert.ok(new Set(ids).size > 40, "ids made back to back do not collide");
  assert.ok(intouch.parseIntouchRef(`intouch:${ids[0]}`), "and they pass our own reference check");
});

await asyncTest("intouch refusal codes become advice the customer can act on", async () => {
  assert.equal(intouch.refusalKind("1002"), "notRegistered");
  assert.equal(intouch.refusalKind("1100"), "network");
  assert.equal(intouch.refusalKind("1200"), "badNumber");
  assert.equal(intouch.refusalKind("2200"), "amount");
  assert.equal(intouch.refusalKind("0005"), "other", "our own credentials failing is not the customer's to fix");
  assert.equal(intouch.refusalKind("config"), "other");
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
      if ((req.url ?? "").includes("requestdeposit")) {
        const form = new URLSearchParams(body);
        if (form.get("requesttransactionid") === "broke0000000001") {
          res.statusCode = 422;
          res.end(JSON.stringify({ success: false, responsecode: "1108", requesttransactionid: "broke0000000001" }));
          return;
        }
        res.end(JSON.stringify({ status: "Successfull", requesttransactionid: form.get("requesttransactionid"), referenceid: "75859766829", success: true, responsecode: "2001", transactionid: "014HBDTR0TT29N5CDMTQ1374S6" }));
        return;
      }
      if ((req.url ?? "").includes("getbalance")) {
        res.end(JSON.stringify({ balance: "11250.00", success: true }));
        return;
      }
      if ((req.url ?? "").includes("requestpayment")) {
        const form = new URLSearchParams(body);
        if (form.get("requesttransactionid") === "unreg0000000001") {
          res.statusCode = 422;
          res.end(JSON.stringify({ success: false, responsecode: "1002", requesttransactionid: "unreg0000000001" }));
          return;
        }
        if (form.get("requesttransactionid") === "conflict0000001") {
          res.statusCode = 409;
          res.end(JSON.stringify({ detail: "exists" }));
          return;
        }
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
    // A refusal that comes as an HTTP error keeps its reason code from the body; without one, the HTTP status stands in.
    await assert.rejects(() => intouch.requestIntouchPayment({ requestId: "unreg0000000001", phone9: "788123456", amount: 100 }),
      (e: unknown) => e instanceof intouch.IntouchRejected && e.code === "1002" && intouch.refusalKind(e.code) === "notRegistered");
    await assert.rejects(() => intouch.requestIntouchPayment({ requestId: "conflict0000001", phone9: "788123456", amount: 100 }),
      (e: unknown) => e instanceof intouch.IntouchRejected && e.code === "409" && intouch.refusalKind(e.code) === "other");
    await assert.rejects(() => intouch.requestIntouchPayment({ requestId: "bad", phone9: "788123456", amount: 0 }), /positive number/);
    // RequestDeposit (refunds): form-encoded, signed like a payment, and 2001 means the money was sent.
    const before = seen.length;
    const deposit = await intouch.requestIntouchDeposit({ requestId: "7700001", phone9: "788123456", amount: 5000, reason: "Inzira refund INZ-1" });
    assert.deepEqual(deposit, { status: "sent", transactionId: "014HBDTR0TT29N5CDMTQ1374S6", reference: "75859766829", code: "2001" });
    const depositForm = new URLSearchParams(seen[before].body);
    assert.equal(seen[before].type, "application/x-www-form-urlencoded");
    assert.equal(depositForm.get("mobilephone"), "250788123456");
    assert.equal(depositForm.get("amount"), "5000");
    assert.equal(depositForm.get("sid"), "1");
    assert.equal(depositForm.get("withdrawcharge"), "0");
    assert.equal(depositForm.get("password"), intouch.intouchPassword("bob", "250160000011", "pass123456789", depositForm.get("timestamp") ?? ""));
    assert.ok(!seen[before].body.includes("pass123456789"));
    await assert.rejects(() => intouch.requestIntouchDeposit({ requestId: "broke0000000001", phone9: "788123456", amount: 5000, reason: "x" }),
      (e: unknown) => e instanceof intouch.IntouchRejected && e.code === "1108" && /balance is too low to send RWF 5,000/.test(intouch.depositRefusalMessage(e.code, "RWF 5,000")));
    statusCode = "2001";
    assert.equal(await intouch.intouchDepositStatus("7700001", "014HBDTR0TT29N5CDMTQ1374S6"), "sent");
    assert.equal(await intouch.intouchBalance(), 11250);
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

test("intouch deposit: sent, refused (nothing left), or unclear (checked later, never sent twice)", () => {
  assert.equal(intouch.depositDecision({ success: true, responsecode: "2001", status: "Successfull" }).outcome, "sent");
  assert.equal(intouch.depositDecision({ success: false, responsecode: "1108" }).outcome, "refused");
  assert.equal(intouch.depositDecision({ success: false, responsecode: "1110" }).outcome, "refused", "a duplicate id is never a second payout");
  assert.equal(intouch.depositDecision({ success: false, responsecode: "2600" }).outcome, "pending", "a network timeout may have sent it");
  assert.equal(intouch.depositDecision({ success: false, responsecode: "2001" }).outcome, "pending", "success:false is not sent");
  assert.equal(intouch.depositDecision({}).outcome, "pending");
});
test("national ID: exactly 16 digits, and a formatted paste counts", () => {
  assert.equal(nationalIdDigits("1 1995 8 0045123 0 17"), "1199580045123017");
  assert.equal(nationalIdError("1199580045123017"), null);
  assert.equal(nationalIdError(""), "empty");
  assert.equal(nationalIdError("12345"), "short");
  assert.equal(nationalIdError("12345678901234567890"), "long");
  assert.equal(nationalIdError(nationalIdDigits("1199580045123017abc")), null);
});
test("national ID: a valid format is not a verification status", () => {
  assert.equal(nationalIdError("1199580045123017"), null);
  assert.equal(mentionsNationalId("the number is 1 1995 8 0045123 0 17"), true);
  assert.equal(mentionsNationalId("reference INZ-2026-04790"), false);
});
test("ID policy: required, hidden, or optional — uncertain stays optional", () => {
  assert.equal(idPolicyOf({ idPolicy: "required" }), "required");
  assert.equal(idPolicyOf({ noId: true }), "none");
  assert.equal(idPolicyOf({}), "unsure");
  assert.equal(idAsk({ idPolicy: "required" }, "me"), "required");
  assert.equal(idAsk({ idPolicy: "required" }, "business"), "hidden");
  assert.equal(idAsk({ idPolicy: "none" }, "me"), "hidden");
  assert.equal(idAsk({ idPolicy: "unsure" }, "family"), "optional");
  assert.equal(idAsk(null, "me"), "optional");
});

test("sample sign-in: a live site shows no code on screen, not even for a reserved address", () => {
  const prev = { node: process.env.NODE_ENV, demo: process.env.INZIRA_DEMO, key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  const restore = () => {
    const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    set("NODE_ENV", prev.node); set("INZIRA_DEMO", prev.demo); set("RESEND_API_KEY", prev.key); set("EMAIL_FROM", prev.from);
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.INZIRA_DEMO;
    delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    assert.equal(isReservedTestEmail("admin@inzira.test"), true);
    assert.equal(isReservedTestEmail("aline.uwase@example.com"), true);
    assert.equal(isReservedTestEmail("person@gmail.com"), false);
    assert.equal(showsEmailCodeOnScreen(), false);
    assert.equal(canDeliverEmailCodes(), false, "with no mailbox a live site refuses to send a code");
    process.env.RESEND_API_KEY = "re_test"; process.env.EMAIL_FROM = "Inzira <no-reply@inziraservices.com>";
    assert.equal(showsEmailCodeOnScreen(), false, "a real mailbox sends the code instead of showing it");
    assert.equal(canDeliverEmailCodes(), true);
  } finally { restore(); }
});
test("sample payment: the simulator is only for a reserved account when no provider is set", () => {
  const prev = { node: process.env.NODE_ENV, demo: process.env.INZIRA_DEMO, provider: process.env.PAYMENT_PROVIDER };
  const restore = () => {
    const set = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    set("NODE_ENV", prev.node); set("INZIRA_DEMO", prev.demo); set("PAYMENT_PROVIDER", prev.provider);
  };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.INZIRA_DEMO;
    delete process.env.PAYMENT_PROVIDER;
    assert.equal(providerFor("788123456", true).key, "sim");
    assert.throws(() => providerFor("788123456", false), /not configured/);
  } finally { restore(); }
});

test("tax dates: the 15th, and a weekend is pulled back to Friday", () => {
  const vat = periodsBetween("vat-monthly", "2026-10-01", "2026-11-30");
  const october = vat.find((p) => p.periodKey === "2026-10");
  assert.equal(october?.legalDue, "2026-11-15");
  assert.equal(october?.workBy, "2026-11-13");
  assert.equal(weekdayOnOrBefore("2026-11-15"), "2026-11-13");
  const licence = periodsBetween("trading-quarterly", "2026-10-01", "2026-10-31");
  assert.equal(licence[0]?.legalDue, "2026-10-31");
  assert.equal(licence[0]?.workBy, "2026-10-30");
  assert.equal(periodsBetween("property", "2026-01-01", "2026-12-31").at(-1)?.legalDue, "2026-12-31");
  assert.equal(periodsBetween("rental", "2027-01-01", "2027-01-31")[0]?.periodLabel, "2026 rental income");
  assert.equal(periodsBetween("income-annual", "2027-03-01", "2027-03-31")[0]?.legalDue, "2027-03-31");
  const paye = periodsBetween("paye-quarterly", "2026-06-01", "2026-06-30");
  assert.equal(paye[0]?.legalDue, "2026-06-15");
  assert.equal(paye[0]?.periodLabel, "March–May 2026");
});
test("tax state: RRA is paid only when the reference is saved", () => {
  const base = { workBy: "2026-11-13", recordsBy: "2026-11-06", payRoute: "through_us" as const };
  assert.equal(taxPhase({ ...base, paymentRef: "PAY-190334", moneyReceipt: "INZ-R-22140" }, "2026-11-01"), "paid");
  assert.equal(taxPhase({ ...base, moneyReceipt: "INZ-R-22140" }, "2026-11-01"), "money_in");
  assert.equal(taxPhase({ ...base, moneyReceipt: "INZ-R-22140" }, "2026-11-14"), "late");
  assert.equal(taxPhase({ ...base, payRoute: "themselves" }, "2026-11-10"), "awaiting_receipt");
  assert.equal(taxPhase({ ...base, payRoute: "themselves", paymentRef: "PAY-1" }, "2026-11-20"), "paid");
  assert.equal(cleanTaxRef("1 1995 8 0045123 0 17"), null);
  assert.equal(cleanTaxRef("PAY-190334"), "PAY-190334");
});

// ---- staff desk: next action, checklist, handover, Kigali follow-up, WhatsApp
const t = (path: string, vars?: Record<string, string | number>) => i18nText("en", path, vars);
const caseOf = (over: Record<string, unknown> = {}) => ({
  closed: undefined, stage: "checking", hold: undefined, idReview: undefined, documents: [],
  billing: { ...base }, officialRef: undefined, next: "An agent checks your documents.",
  flow: ["received", "checking", "preparing", "institution", "completed"],
  ...over,
});
test("nextKind: hold, ID, documents, fees, then the stage", () => {
  assert.deepEqual(nextKind(caseOf({ closed: { kind: "cancelled", at: "2026-01-01T00:00:00Z" } }) as never), { kind: "closed" });
  assert.deepEqual(nextKind(caseOf({ stage: "completed" }) as never), { kind: "completed" });
  assert.deepEqual(nextKind(caseOf({ hold: { reason: "document" } }) as never), { kind: "hold", reason: "document" });
  assert.deepEqual(nextKind(caseOf({ idReview: "correction" }) as never), { kind: "id_correction" });
  assert.deepEqual(nextKind(caseOf({ documents: [{ name: "Passport photo", status: "rejected" }] }) as never), { kind: "docs_rejected", name: "Passport photo" });
  assert.deepEqual(nextKind(caseOf({ documents: [{ required: true, status: "required", name: "Lease" }] }) as never), { kind: "docs_needed", n: 1 });
  assert.deepEqual(nextKind(caseOf({ billing: { ...base, quote: "confirmed" } }) as never), { kind: "pay", amount: 20000 });
  assert.deepEqual(nextKind(caseOf({ billing: { ...base, transactions: [tx("paid", 5000, 15000)] }, stage: "institution", officialRef: "RDB-1" }) as never), { kind: "institution", officialRef: "RDB-1" });
  assert.deepEqual(nextKind(caseOf({ billing: { ...base, quote: "estimate" } }) as never), { kind: "stage", stage: "checking" });
});
test("nextSentence: customer copy follows nextKind, and Kinyarwanda keeps the same keys", () => {
  assert.equal(nextSentence(caseOf({ hold: { reason: "payment" }, next: "ignored" }) as never, t), "Pay the confirmed fees so we can continue.");
  assert.equal(nextSentence(caseOf({ documents: [{ required: true, status: "required" }] }) as never, t), "Upload 1 required document(s).");
  assert.equal(nextSentence(caseOf({ billing: { ...base } }) as never, t), "Pay RWF 20,000 in the portal.");
  assert.equal(nextSentence(caseOf({ billing: { ...base, transactions: [tx("paid", 5000, 15000)] }, stage: "institution", officialRef: "X-9" }) as never, t), "We filed it. Waiting on the institution (ref X-9).");
  assert.equal(nextSentence(caseOf({ billing: { ...base, quote: "estimate" }, stage: "received" }) as never, t), "An agent will take this within two working hours.");
  assert.equal(nextSentence(caseOf({ closed: { kind: "cancelled" }, next: "Closed." }) as never, t), "Closed.");
  const rw = (path: string, vars?: Record<string, string | number>) => i18nText("rw", path, vars);
  assert.equal(nextSentence(caseOf({ hold: { reason: "information" } }) as never, rw), "Subiza umukozi wawe.");
});
test("deskChecks: documents, quote, our fee, official reference, official receipt", () => {
  const now = "2026-06-01T00:00:00Z";
  const open = deskChecks(caseOf({
    documents: [{ required: true, status: "required" }, { required: true, status: "approved" }],
    billing: { ...base, quote: "estimate", officialReceipt: "awaiting" },
    stage: "preparing",
  }) as never, now);
  assert.equal(open.find((c) => c.id === "docs")?.done, false);
  assert.equal(open.find((c) => c.id === "quote")?.done, false);
  assert.equal(open.find((c) => c.id === "pay")?.done, false);
  assert.equal(open.find((c) => c.id === "officialRef")?.done, false);
  assert.equal(open.find((c) => c.id === "receipt")?.done, false);
  const done = deskChecks(caseOf({
    documents: [{ required: true, status: "approved" }],
    billing: { ...base, quote: "confirmed", officialReceipt: "attached", transactions: [tx("paid", 5000, 15000)] },
    officialRef: "RDB-22",
    stage: "institution",
  }) as never, now);
  assert.ok(done.every((c) => c.done));
  const free = deskChecks(caseOf({ billing: { ...base, ours: 0, quote: "confirmed", officialMode: "none" }, flow: ["received", "completed"], stage: "received" }) as never, now);
  assert.equal(free.find((c) => c.id === "pay")?.done, true);
  assert.equal(free.find((c) => c.id === "officialRef")?.done, true);
  assert.equal(free.find((c) => c.id === "receipt")?.done, true);
  const checking = deskChecks(caseOf({ billing: { ...base, quote: "estimate" }, stage: "checking" }) as never, now);
  assert.equal(checking.find((c) => c.id === "officialRef")?.done, true);
  assert.equal(checking.find((c) => c.id === "officialRef")?.detail, "Not needed yet");
});
test("handover is only required when a named agent hands to a different named agent", () => {
  assert.equal(handoverRequired(null, "s2"), false);
  assert.equal(handoverRequired("s1", null), false);
  assert.equal(handoverRequired("s1", "s1"), false);
  assert.equal(handoverRequired("s1", "s2"), true);
});
test("follow-up times are tomorrow 10:00 Kigali and round-trip", () => {
  assert.equal(defaultFollowUpAt(Date.parse("2026-06-01T08:00:00Z")), "2026-06-02T08:00:00.000Z");
  assert.deepEqual(kigaliDateTimeParts("2026-06-02T08:00:00.000Z"), { date: "2026-06-02", time: "10:00" });
  assert.equal(fromKigaliDateTime("2026-06-02", "10:00"), "2026-06-02T08:00:00.000Z");
  assert.equal(fromKigaliDateTime("bad", "10:00"), null);
  assert.equal(fromKigaliDateTime("2026-06-02", "99:99"), null);
});
test("customer WhatsApp link is a Rwanda mobile number with the case reference", () => {
  assert.equal(customerWhatsAppUrl("788123456", "INZ-1"), "https://wa.me/250788123456?text=" + encodeURIComponent("Hello, this is Inzira about INZ-1."));
  assert.equal(customerWhatsAppUrl("+250 788 123 456", "INZ-1"), customerWhatsAppUrl("0788123456", "INZ-1"));
  assert.equal(customerWhatsAppUrl("123", "INZ-1"), null);
  assert.deepEqual(stageTargetRows({ received: 2, checking: 4, preparing: 24, institution: 72, completed: 0 }).map((r) => r.stage), ["received", "checking", "preparing", "institution", "completed"]);
});

test("the vercel.app address is refused once the real domain is set", () => {
  const base = { host: "inzira-web.vercel.app", pathname: "/services", origin: "https://inziraservices.com", production: true };
  assert.equal(blockedHost(base), true);
  assert.equal(blockedHost({ ...base, host: "inzira-web.vercel.app:443" }), true);
  assert.equal(blockedHost({ ...base, host: "inziraservices.com" }), false, "the real domain works");
  assert.equal(blockedHost({ ...base, production: false }), false, "previews keep their address");
  assert.equal(blockedHost({ ...base, origin: null }), false, "no lock-out before the domain is set");
  assert.equal(blockedHost({ ...base, origin: "https://inzira-web.vercel.app" }), false, "site address is still vercel.app");
  assert.equal(blockedHost({ ...base, pathname: "/api/cron" }), false, "scheduler stays reachable");
  assert.equal(blockedHost({ ...base, pathname: "/api/health" }), false);
});

test("only pages that read nothing about the visitor are shared by the CDN", () => {
  for (const p of ["/", "/en", "/services", "/en/services", "/services/company-registration", "/en/services/company-registration", "/about", "/privacy", "/en/terms"]) assert.equal(isSharedPage(p), true, p);
  for (const p of ["/track", "/start", "/start/company-registration", "/sign-in", "/portal", "/console", "/staff", "/r/abc", "/api/locale", "/services/a/b", "/aboutx"]) assert.equal(isSharedPage(p), false, p);
});

test("english pages live under /en and private pages stay put", () => {
  assert.equal(barePath("/en/services/criminal-record"), "/services/criminal-record");
  assert.equal(barePath("/en"), "/");
  assert.equal(withLocale("en", "/services?category=police"), "/en/services?category=police");
  assert.equal(withLocale("en", "/#prices"), "/en#prices");
  assert.equal(withLocale("rw", "/en/about"), "/about");
  assert.equal(withLocale("en", "/sign-in"), "/sign-in");
  assert.equal(withLocale("en", "/console/taxes"), "/console/taxes");
  assert.equal(isIndexable("/sign-in"), false);
  assert.equal(isIndexable("/en/services"), true);
  const alt = languageAlternates("https://example.rw", "/services/criminal-record", "en");
  assert.equal(alt.canonical, "https://example.rw/en/services/criminal-record");
  assert.equal(alt.languages?.rw, "https://example.rw/services/criminal-record");
  assert.equal(alt.languages?.["x-default"], "https://example.rw/services/criminal-record");
});

test("plate numbers, TINs, UPIs and tickets are cleaned into one format", () => {
  assert.equal(cleanAnswer("plate", "rad123a"), "RAD 123 A");
  assert.equal(cleanAnswer("plate", " RC 456 B "), "RC 456 B");
  assert.equal(cleanAnswer("plate", "GR 1234"), "GR 1234");
  assert.equal(cleanAnswer("plate", "123"), null);
  assert.equal(cleanAnswer("tin", "123 456 789"), "123456789");
  assert.equal(cleanAnswer("tin", "12345678"), null);
  assert.equal(cleanAnswer("code9", "108-123-456"), "108123456");
  assert.equal(cleanAnswer("upi", "1/2/3/4/1234"), "1/02/03/04/1234");
  assert.equal(cleanAnswer("upi", "1/02/03/04"), null);
  assert.equal(cleanAnswer("upis", "1/02/03/04/1234, 1/02/03/04/1235"), "1/02/03/04/1234, 1/02/03/04/1235");
  assert.equal(cleanAnswer("upis", "1/02/03/04/1234, nope"), null);
  assert.equal(cleanAnswer("ticket", "2026-0123456"), "2026-0123456");
  assert.equal(cleanAnswer("date", "2026-02-30"), null);
  assert.equal(cleanAnswer("date", "2026-11-30"), "2026-11-30");
  assert.equal(cleanAnswer(undefined, "  Remera  "), "Remera");
  assert.equal(cleanAnswer("text", "   "), null);
});
test("a traffic fine asks for the ticket, or for the plate and TIN, by the purpose picked", () => {
  const fine = SERVICES.find((s) => s.slug === "traffic-fine")!;
  const asked = (i: number) => (fine.questions ?? []).filter((q) => isAsked(q, i)).map((q) => q.key);
  assert.deepEqual(asked(0), ["ticket"]);
  assert.deepEqual(asked(1), ["plate", "tin"]);
  assert.deepEqual(asked(-1), []);
});
test("a service priced by option is paid in full once an option is picked, never with a review fee", () => {
  const passport = SERVICES.find((s) => s.slug === "passport-application")!;
  assert.equal(checkoutPrice(passport), null);
  assert.equal(reviewFeeFor(passport), null);
  assert.deepEqual(optionRange(passport), { from: 25000 + passport.ours, to: 100000 + passport.ours });
  assert.deepEqual(checkoutPrice(withOption(passport, 1)!), { official: 100000, ours: passport.ours, total: 100000 + passport.ours, direct: false });
  assert.equal(withOption(passport, 9), null);
  assert.equal(withOption(passport, null), null);
  const birth = SERVICES.find((s) => s.slug === "birth-certificate")!;
  assert.equal(withOption(birth, null), birth);
  for (const s of SERVICES) if (s.feeOptions?.length) assert.ok(optionRange(s), `${s.slug} has checked fees for every option`);
});
test("every Kinyarwanda catalogue entry lines up with the English one", () => {
  const en = catalogueEn.services as Record<string, Record<string, unknown>>, rw = catalogueRw.services as Record<string, Record<string, unknown>>;
  for (const s of SERVICES) {
    assert.ok(rw[s.slug], `${s.slug} has a Kinyarwanda entry`);
    for (const f of ["who", "documents", "notes", "questions", "purposes", "feeOptions", "requirements", "steps"]) {
      const a = (en[s.slug]?.[f] as unknown[] | undefined)?.length ?? 0, b = (rw[s.slug][f] as unknown[] | undefined)?.length ?? 0;
      assert.equal(b, a, `${s.slug}.${f}`);
    }
    for (const f of ["inPerson", "feeOptionLabel", "purposeLabel"]) assert.equal(!!rw[s.slug][f], !!en[s.slug]?.[f], `${s.slug}.${f}`);
  }
});

// ---- staff passwords (async, so checked here rather than in test())
{
  const hash = await hashPassword("green mango river 47");
  try {
    assert.match(hash, /^scrypt\$15\$8\$1\$/);
    assert.equal(await verifyPassword("green mango river 47", hash), true);
    assert.equal(await verifyPassword("green mango river 48", hash), false);
    assert.equal(await verifyPassword("anything", null), false, "no stored password never matches");
    assert.notEqual(await hashPassword("green mango river 47"), hash, "each hash has its own salt");
    assert.match((await passwordProblem("short one")) ?? "", /at least 15/);
    assert.match((await passwordProblem("aaaaaaaaaaaaaaaaaaaa")) ?? "", /too few/);
    assert.match((await passwordProblem("password12345678")) ?? "", /too common/);
    assert.match((await passwordProblem("diane goes to the market", ["Diane Uwera"])) ?? "", /name/);
    assert.equal(await passwordProblem("green mango river 47", ["Diane Uwera", "diane", "admin@inzira.test"]), null);
    passed++;
  } catch (e) { console.error("FAIL staff passwords are hashed with scrypt and checked against simple rules\n", e); process.exitCode = 1; }
}

await asyncTest("resend: one request per message, retried only when it may succeed", async () => {
  const keep = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM, reply: process.env.EMAIL_REPLY_TO, limit: process.env.RESEND_DAILY_LIMIT, fetch: globalThis.fetch };
  const calls: { url: string; init: RequestInit }[] = [];
  let answers: { status: number; body: unknown }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift() ?? { status: 200, body: { id: "e1" } };
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    process.env.RESEND_API_KEY = "re_test"; process.env.EMAIL_FROM = "Inzira <no-reply@inziraservices.com>";
    process.env.EMAIL_REPLY_TO = "contact@inziraservices.com"; delete process.env.RESEND_DAILY_LIMIT;
    for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "EMAIL_PROVIDER"]) delete process.env[k];
    assert.equal(sendingDomain(), "inziraservices.com");

    await sendEmail({ to: "a@b.rw", subject: "Code", text: "Your code", highlight: "123456" }, { idempotencyKey: "outbox-7" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    const h = calls[0].init.headers as Record<string, string>;
    assert.equal(h.Authorization, "Bearer re_test");
    assert.equal(h["Idempotency-Key"], "outbox-7");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body.to, ["a@b.rw"]);
    assert.equal(body.from, "Inzira <no-reply@inziraservices.com>");
    assert.equal(body.reply_to, "contact@inziraservices.com");
    assert.ok(body.text.includes("123456") && body.html.includes("123456"), "the code is in both parts");

    calls.length = 0; answers = [{ status: 429, body: { name: "rate_limit_exceeded", message: "Too many requests" } }];
    await sendEmail({ to: "a@b.rw", subject: "s", text: "t" });
    assert.equal(calls.length, 2, "a rate limit is tried again");

    calls.length = 0; answers = [{ status: 403, body: { name: "validation_error", message: "The inziraservices.com domain is not verified." } }];
    await assert.rejects(sendEmail({ to: "a@b.rw", subject: "s", text: "t" }), /not verified/);
    assert.equal(calls.length, 1, "a refusal is not tried again");

    calls.length = 0; answers = [{ status: 429, body: { name: "daily_quota_exceeded", message: "quota" } }];
    await assert.rejects(sendEmail({ to: "a@b.rw", subject: "s", text: "t" }), /daily email limit/, "the outbox waits an hour on this wording");
    assert.equal(calls.length, 1);

    calls.length = 0; answers = [{ status: 500, body: {} }, { status: 503, body: {} }, { status: 500, body: {} }];
    await assert.rejects(sendEmail({ to: "a@b.rw", subject: "s", text: "t" }), /500/);
    assert.equal(calls.length, 3, "an outage is tried three times, then reported");
  } finally {
    globalThis.fetch = keep.fetch;
    delete (globalThis as { __inziraResendPausedUntil?: number }).__inziraResendPausedUntil;
    for (const [k, v] of [["RESEND_API_KEY", keep.key], ["EMAIL_FROM", keep.from], ["EMAIL_REPLY_TO", keep.reply], ["RESEND_DAILY_LIMIT", keep.limit]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

console.log(process.exitCode ? "unit tests FAILED" : `unit tests ok (${passed})`);
