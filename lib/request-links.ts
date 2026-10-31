// Private links to one request, for people who send a request without an account (the way most people use Irembo).
//
// A link is https://site/r/INZ-2026-04817#k=<secret>. The secret sits after "#", so browsers never send it to a server
// or to another site: the page reads it and trades it for a private cookie (openRequestLink), then removes it from the
// address bar. Only the SHA-256 of a secret is stored. A browser holds the secrets of its last few requests in one
// HttpOnly cookie, so the person who sent a request can come back to it without signing in.
//
// "view" links open one request: progress, documents, messages, payment, the result. "claim" links go to an email
// address only and save the request to the account with that address: clicking one proves the address.
// Server only.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema as s, type Db } from "./db";

type Queryable = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
import { SITE } from "./site";

const COOKIE = "inzira_req";
/** How many requests one browser keeps open at once; the oldest falls off. */
const KEEP = 8;
const DAY = 864e5;
/** A view link works for a year, and stops 90 days after its request is closed. A claim link works for 30 days, once. */
const VIEW_DAYS = 365;
const CLAIM_DAYS = 30;
const AFTER_CLOSE_DAYS = 90;

const sha = (token: string) => createHash("sha256").update(token).digest("hex");
const REF = /^INZ-\d{4}-\d{3,7}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A new secret for this request, stored as a hash. Returns the secret, which only the link carries. */
export async function issueLink(tx: Queryable, ref: string, kind: "view" | "claim" = "view", email?: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const days = kind === "claim" ? CLAIM_DAYS : VIEW_DAYS;
  await tx.insert(s.requestLinks).values({ id: sha(token), ref, kind, email: email ?? null, expiresAt: new Date(Date.now() + days * DAY).toISOString() });
  return token;
}

/** The full address of a link. Relative ("/r/…") when the site address is not set, as in development. */
export function linkUrl(ref: string, token: string, page: "" | "/save" = ""): string {
  const origin = SITE.url.startsWith("http") ? SITE.url.replace(/\/$/, "") : "";
  return `${origin}/r/${ref}${page}#k=${token}`;
}

type Held = { ref: string; token: string };
async function held(): Promise<Held[]> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  return raw.split("|").map((x) => { const [ref, token] = x.split("."); return { ref, token }; }).filter((x) => REF.test(x.ref ?? "") && TOKEN.test(x.token ?? ""));
}
async function hold(list: Held[]) {
  const value = list.slice(0, KEEP).map((x) => `${x.ref}.${x.token}`).join("|");
  const jar = await cookies();
  if (!value) { jar.delete(COOKIE); return; }
  jar.set(COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: VIEW_DAYS * 86400 });
}

/** Whether a view secret opens this request now: not revoked, not expired, and its request not closed for 90 days. */
async function validView(ref: string, token: string, database?: Queryable): Promise<boolean> {
  const d = database ?? await db();
  const [row] = await d.select({ closed: s.requests.closed, privacyStartedAt: s.requests.privacyStartedAt }).from(s.requestLinks)
    .innerJoin(s.requests, eq(s.requests.ref, s.requestLinks.ref))
    .where(and(eq(s.requestLinks.id, sha(token)), eq(s.requestLinks.ref, ref), eq(s.requestLinks.kind, "view"), isNull(s.requestLinks.revokedAt), gt(s.requestLinks.expiresAt, new Date().toISOString())));
  if (!row || row.privacyStartedAt) return false;
  return !row.closed || Date.parse(row.closed.at) + AFTER_CLOSE_DAYS * DAY > Date.now();
}

/** Keeps this request's secret in the browser (after sending a request, or after opening a link). */
export async function keepLink(ref: string, token: string) {
  await hold([{ ref, token }, ...(await held()).filter((x) => x.ref !== ref)]);
}

/** Trades the secret from a link for the cookie. False when the link is wrong, revoked or too old. */
export async function openLink(ref: string, token: string): Promise<boolean> {
  if (!REF.test(ref) || !TOKEN.test(token) || !(await validView(ref, token))) return false;
  await keepLink(ref, token);
  return true;
}

/** Whether this browser holds a working link to the request. */
export async function hasLink(ref: string): Promise<boolean> {
  const mine = (await held()).find((x) => x.ref === ref);
  return !!mine && validView(ref, mine.token);
}

/** The requests this browser holds links to, newest first, for "your recent requests" on the track page. */
export async function heldRefs(): Promise<string[]> {
  return (await held()).map((x) => x.ref);
}

/** Forgets this request in this browser and stops the link it used. */
export async function dropLink(ref: string) {
  const list = await held();
  const mine = list.find((x) => x.ref === ref);
  if (mine) await (await db()).update(s.requestLinks).set({ revokedAt: new Date().toISOString() }).where(eq(s.requestLinks.id, sha(mine.token)));
  await hold(list.filter((x) => x.ref !== ref));
}

/** Uses a claim secret once. Returns the request and the email it was sent to, or null. */
export async function useClaim(ref: string, token: string, tx: Queryable): Promise<{ email: string } | null> {
  if (!REF.test(ref) || !TOKEN.test(token)) return null;
  const now = new Date().toISOString();
  const [row] = await tx.update(s.requestLinks).set({ usedAt: now })
    .where(and(eq(s.requestLinks.id, sha(token)), eq(s.requestLinks.ref, ref), eq(s.requestLinks.kind, "claim"), isNull(s.requestLinks.usedAt), isNull(s.requestLinks.revokedAt), gt(s.requestLinks.expiresAt, now)))
    .returning({ email: s.requestLinks.email });
  return row?.email ? { email: row.email } : null;
}

/** When a link stops working, for the request page. */
export const linkLifetime = { viewDays: VIEW_DAYS, claimDays: CLAIM_DAYS, afterCloseDays: AFTER_CLOSE_DAYS };
