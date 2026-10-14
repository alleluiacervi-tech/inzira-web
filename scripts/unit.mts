// Unit tests for the parts where a mistake costs money or leaks data. Run: npm run test:unit
import assert from "node:assert/strict";
import { base32, codeAt, fromBase32, matchStep, newRecoveryCodes, normaliseRecovery, hashRecovery, otpauthUrl } from "../lib/totp.ts";
import { open, seal, isSealed } from "../lib/crypto.ts";
import { sniffType } from "../lib/storage.ts";
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

console.log(process.exitCode ? "unit tests FAILED" : `unit tests ok (${passed})`);
