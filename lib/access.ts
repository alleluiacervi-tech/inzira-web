// Private links: how a customer reaches their own request without signing in.
//
// A link is /r/<reference>/<signature>. The signature is an HMAC of the reference and the request's
// `access_version`, keyed with ACCESS_SECRET, so:
// - nothing secret is stored: a leaked database does not leak working links;
// - the server can rebuild the link for any request, so every update email carries a one-click link;
// - bumping `access_version` kills every link already sent for that request.
// A link stops working RETENTION_DAYS after the request finishes, like the documents behind it.
// Opening one starts a session limited to that single request (see lib/auth.ts, scopeRef).
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "./db";
import { isDemo } from "./demo";
import { finishedAt, RETENTION_DAYS } from "./privacy";
import { absoluteUrl } from "./site";

const secret = () => {
  const value = process.env.ACCESS_SECRET;
  if (value) return value;
  if (isDemo()) return "inzira-demo-access-secret";
  throw new Error("ACCESS_SECRET is not set. Generate one with `openssl rand -base64 32`.");
};

const sign = (ref: string, version: number) => createHmac("sha256", secret()).update(`${ref}:${version}`).digest("base64url").slice(0, 22);

/** The path of a request's private link, e.g. /r/INZ-2026-04900/Zk3…. */
export const accessPath = (ref: string, version: number) => `/r/${encodeURIComponent(ref)}/${sign(ref, version)}`;

/** The full address to put in an email. */
export const accessUrl = (ref: string, version: number) => absoluteUrl(accessPath(ref, version));

/** The request and account a link opens, or null if the link is wrong, revoked or too old. */
export async function verifyAccess(ref: string, token: string): Promise<{ ref: string; accountId: string } | null> {
  if (!/^INZ-\d{4}-\d{5}$/.test(ref) || !/^[\w-]{22}$/.test(token)) return null;
  const [row] = await (await db()).select({
    ref: s.requests.ref, version: s.requests.accessVersion, accountId: s.profiles.accountId,
    stage: s.requests.stage, stageDates: s.requests.stageDates, closed: s.requests.closed, deletedAt: s.accounts.deletedAt,
  }).from(s.requests).innerJoin(s.profiles, eq(s.profiles.id, s.requests.profileId)).innerJoin(s.accounts, eq(s.accounts.id, s.profiles.accountId))
    .where(eq(s.requests.ref, ref));
  if (!row || row.deletedAt) return null;
  const a = Buffer.from(sign(row.ref, row.version)), b = Buffer.from(token);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const done = finishedAt(row);
  if (done && Date.parse(done) + RETENTION_DAYS * 864e5 < Date.now()) return null;
  return { ref: row.ref, accountId: row.accountId };
}
