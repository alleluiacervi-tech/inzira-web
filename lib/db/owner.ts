// The owner's console login (username and password), set without the invite email or the SMS code that normally
// start it. Used by the OWNER_USERNAME / OWNER_PASSWORD_HASH settings at start-up and by `npm run db:owner`.
// The owner's account keeps no email on purpose: a sign-in alert or reset link for a mailbox that is not read would go nowhere.
import { createHash } from "node:crypto";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { MIN_PASSWORD } from "../password";
import type { Db } from "./index";
import * as s from "./schema";

export type OwnerLogin = "set" | "kept" | "no-owner" | "several-owners" | "username-taken";

/** Gives the one active owner a username and a password hash. Without `replace`, an owner who already has a password is
 *  left alone, so the setting is safe to leave in place across restarts. With it, the password is replaced and the
 *  owner's other devices are signed out. The authenticator app, if set up, is kept. */
export async function setOwnerLogin(db: Db, login: { username: string; passwordHash: string }, opts: { replace?: boolean } = {}): Promise<OwnerLogin> {
  const username = login.username.trim().toLowerCase();
  const owners = await db.select().from(s.staff).where(and(eq(s.staff.role, "Owner"), eq(s.staff.active, true)));
  if (!owners.length) return "no-owner";
  if (owners.length > 1) return "several-owners";
  const [owner] = owners;
  if (owner.passwordHash && !opts.replace) return "kept";
  const [taken] = await db.select({ id: s.staff.id }).from(s.staff)
    .where(and(ne(s.staff.id, owner.id), or(sql`lower(${s.staff.username}) = ${username}`, sql`lower(${s.staff.email}) = ${username}`)));
  if (taken) return "username-taken";
  await db.update(s.staff).set({ username, email: null, passwordHash: login.passwordHash, passwordSetAt: new Date().toISOString(), failedLogins: 0, lockedUntil: null }).where(eq(s.staff.id, owner.id));
  await db.delete(s.sessions).where(and(eq(s.sessions.kind, "staff"), eq(s.sessions.subjectId, owner.id)));
  return "set";
}

const APPLIED = "Owner login set from settings";

/** OWNER_USERNAME with OWNER_PASSWORD_HASH (from `npm run db:owner -- hash`) sets the owner's login the first time the
 *  server starts with that hash, replacing any password the owner had. The audit log remembers which hash was applied,
 *  so a restart never undoes a password the owner changed since, and a new hash in the settings is a reset.
 *  Never throws: a mistake here must not stop the site. */
export async function applyOwnerLoginFromEnv(db: Db) {
  const username = process.env.OWNER_USERNAME?.trim();
  const passwordHash = process.env.OWNER_PASSWORD_HASH?.trim();
  if (!username || !passwordHash) return;
  if (!passwordHash.startsWith("scrypt$")) { console.error("[owner] OWNER_PASSWORD_HASH is not a hash made by `npm run db:owner -- hash`; ignored."); return; }
  try {
    const stamp = createHash("sha256").update(`${username.toLowerCase()}\n${passwordHash}`).digest("hex").slice(0, 16);
    const [done] = await db.select({ id: s.audit.id }).from(s.audit).where(and(eq(s.audit.action, APPLIED), eq(s.audit.entity, stamp))).limit(1);
    if (done) return;
    const result = await setOwnerLogin(db, { username, passwordHash }, { replace: true });
    if (result === "set") await db.insert(s.audit).values({ actor: "System", role: "Owner", action: APPLIED, entity: stamp, source: "system" });
    console.log(`[owner] ${result === "set" ? `console login set for ${username.toLowerCase()}` : `console login not set: ${result}`}`);
  } catch (e) {
    console.error("[owner] could not set the console login", e);
  }
}

/** A warning when the password is shorter than the staff rules ask for, else null. Setting it is still allowed. */
export const weakPasswordNote = (password: string) =>
  password.normalize("NFKC").length < MIN_PASSWORD ? `This password is shorter than the ${MIN_PASSWORD} characters the console asks of staff. The authenticator code is what protects the account, so turn it on right after signing in.` : null;
