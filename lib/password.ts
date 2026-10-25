// Staff passwords. Stored as scrypt hashes (built into Node, no extra service). The rules follow NIST SP 800-63B: a
// long password beats a complicated one, so it asks for 15 characters (three or four words is easy) and nothing else:
// no forced symbols, pasting and password managers allowed, and a new password is checked against common and leaked
// ones. Server only.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 2 ** 15, R = 8, P = 1, LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD = 15;
export const MAX_PASSWORD = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${Math.log2(N)}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/** A hash computed for nobody, so a wrong username takes as long as a wrong password. */
let dummy: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const target = stored ?? await (dummy ??= hashPassword(randomBytes(12).toString("hex")));
  const [kind, logN, r, p, salt, hash] = target.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: MAXMEM });
  return !!stored && got.length === want.length && timingSafeEqual(got, want);
}

const COMMON = ["password", "inzira", "12345678", "qwerty", "azerty", "rwanda", "kigali", "letmein", "welcome", "iloveyou", "admin"];

/** Why this password is refused, or null. `about` holds the person's own name, username and email. */
export async function passwordProblem(password: string, about: string[] = []): Promise<string | null> {
  const pw = password.normalize("NFKC");
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters. Three or four words are easy to remember, e.g. “green mango river 47”.`;
  if (pw.length > MAX_PASSWORD) return `Use at most ${MAX_PASSWORD} characters.`;
  const plain = pw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (new Set(plain).size < 5) return "That password repeats too few characters. Use a few different words.";
  if (COMMON.some((w) => plain.replace(/\d+/g, "") === w || plain === w.repeat(Math.ceil(plain.length / w.length)).slice(0, plain.length))) return "That password is too common. Use a few words only you would put together.";
  // Each part counts on its own: a first name, a surname, a username, the part of an email before the @.
  const parts = about.flatMap((x) => x.toLowerCase().split("@")[0].split(/[^a-z0-9]+/)).filter((x) => x.length >= 4);
  for (const bit of parts) {
    if (plain.includes(bit)) return "Don’t use your name, username or email in your password.";
  }
  if (await leaked(pw)) return "That password has appeared in a data breach elsewhere. Choose another one.";
  return null;
}

/** Whether the password is in the Have I Been Pwned list. Only the first five characters of its SHA-1 leave the server
 *  (k-anonymity). If the service can't be reached, the password is not refused for it. Live sites only. */
async function leaked(password: string): Promise<boolean> {
  if (process.env.NODE_ENV !== "production" || process.env.INZIRA_DEMO === "1" || process.env.PASSWORD_BREACH_CHECK === "0") return false;
  const sha = createHash("sha1").update(password).digest("hex").toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const rest = sha.slice(5);
    return (await res.text()).split("\n").some((line) => { const [suffix, count] = line.trim().split(":"); return suffix === rest && Number(count) > 0; });
  } catch {
    return false;
  }
}
