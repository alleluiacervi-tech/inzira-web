// Application-level encryption for the few fields that identify a person (national ID, TIN), so a database
// dump, backup or SQL export does not expose them. AES-256-GCM; the key lives in DATA_KEY, outside the database.
// A stored value reads "enc:v1:<iv>:<tag>:<ciphertext>" (base64url). Values written before this existed have no
// prefix and are returned as they are until the next start encrypts them (see protectIdentity in lib/db/protect.ts).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

/** A 32-byte key from 64 hex characters or base64; throws on anything else, so a typo never weakens the key. */
function parseKey(raw: string, name: string): Buffer {
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error(`${name} must be 32 bytes: 64 hex characters (openssl rand -hex 32) or 44 base64 characters.`);
  return k;
}

const live = () => process.env.NODE_ENV === "production" && process.env.INZIRA_DEMO !== "1";

/** True when the key needed to protect identity numbers is available. Development and demos use a fixed local key. */
export const hasDataKey = () => !!process.env.DATA_KEY || !live();

function currentKey(): Buffer {
  if (process.env.DATA_KEY) return parseKey(process.env.DATA_KEY, "DATA_KEY");
  if (live()) throw new Error("DATA_KEY is not set. ID and TIN numbers can’t be stored without it (openssl rand -hex 32).");
  return createHash("sha256").update("inzira-development-data-key").digest();
}
/** The key used before the last rotation, tried when the current one does not open a value. */
const previousKey = () => (process.env.DATA_KEY_PREVIOUS ? parseKey(process.env.DATA_KEY_PREVIOUS, "DATA_KEY_PREVIOUS") : null);

export const isSealed = (v: string | null | undefined): v is string => !!v && v.startsWith(PREFIX);

/** Encrypts a value. Null and empty stay as they are. A value that is already sealed is not sealed twice. */
export function seal(plain: string | null | undefined): string | null {
  if (!plain) return null;
  if (isSealed(plain)) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", currentKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `${PREFIX}${iv.toString("base64url")}:${c.getAuthTag().toString("base64url")}:${ct.toString("base64url")}`;
}

function openWith(key: Buffer, value: string): string {
  const [iv, tag, ct] = value.slice(PREFIX.length).split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Decrypts a stored value. Legacy plain values pass through. Returns null if the value cannot be opened with
 *  the current or the previous key (the caller shows the masked version instead). */
export function open(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!isSealed(stored)) return stored;
  const keys = [currentKey(), previousKey()].filter((k): k is Buffer => !!k);
  for (const k of keys) {
    try { return openWith(k, stored); } catch { /* try the next key */ }
  }
  console.error("[crypto] a stored value could not be decrypted with DATA_KEY or DATA_KEY_PREVIOUS");
  return null;
}
