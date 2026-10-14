// Time-based one-time codes (RFC 6238) for the authenticator-app second step staff can turn on: 6 digits, 30-second
// steps, HMAC-SHA1 (what Google Authenticator, Microsoft Authenticator, Authy and 1Password all expect).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

export function base32(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
export function fromBase32(text: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/[\s=-]/g, "").toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 secret.");
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new random secret, as the text an authenticator app is given (160 bits). */
export const newSecret = () => base32(randomBytes(20));

/** The 6-digit code for a 30-second step. */
export function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}
export const stepNow = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / STEP_SECONDS);

/**
 * Checks a code against the current step and one either side (a phone clock a little off). Returns the step that
 * matched, or null. The caller must refuse a step it has already accepted, so a code works once.
 */
export function matchStep(secret: string, code: string, nowMs = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepNow(nowMs);
  let found: number | null = null;
  // Every candidate is compared, so timing does not reveal which step matched.
  for (const step of [now - 1, now, now + 1]) {
    const a = Buffer.from(codeAt(secret, step)), b = Buffer.from(code);
    if (timingSafeEqual(a, b)) found = step;
  }
  return found;
}

/** The link an authenticator app on the same phone opens to add the account. */
export const otpauthUrl = (secret: string, account: string, issuer = "Inzira") =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;

// ---- recovery codes: for a lost phone. Each works once; only their hashes are stored.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const pick = () => Array.from({ length: 5 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return `${pick()}-${pick()}`;
  });
}
export const normaliseRecovery = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^(.{5})(.{5})$/, "$1-$2");
export const hashRecovery = (code: string) => createHash("sha256").update(`recovery:${normaliseRecovery(code)}`).digest("hex");
