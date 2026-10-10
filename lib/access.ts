// Which cases and clients a member of staff may see. Every staff read (lib/repo) and write
// (app/actions, the file route) goes through these, so the rule lives in one place:
// with "View all cases" they see everything; otherwise only the cases assigned to them, and the
// clients of those cases.
import { and, eq, type SQL } from "drizzle-orm";
import { schema as s, type Db } from "./db";
import type { Permission } from "./permissions";

type Viewer = { id: string; permissions: Set<Permission> };

export const seesAllCases = (me: Viewer) => me.permissions.has("viewAll");

/** A filter on requests for the cases this person may see; undefined means all of them. */
export const caseScope = (me: Viewer): SQL | undefined => (seesAllCases(me) ? undefined : eq(s.requests.agentId, me.id));

/** Triage (the inbox of new, unassigned requests) needs both "Assign" and "View all cases". */
export const canTriage = (me: Viewer) => me.permissions.has("assign") && seesAllCases(me);

export const canSeeCase = (me: Viewer, r: { agentId: string | null }) => seesAllCases(me) || r.agentId === me.id;

export async function canSeeClient(d: Db, me: Viewer, profileId: string): Promise<boolean> {
  if (seesAllCases(me)) return true;
  const [row] = await d.select({ ref: s.requests.ref }).from(s.requests).where(and(eq(s.requests.profileId, profileId), eq(s.requests.agentId, me.id))).limit(1);
  return !!row;
}

/** Opening cases, adding clients and writing on their file is for the people who work cases;
 *  Finance and Quality reviewers read. "Update case status" is the permission that marks them. */
export const WORKS_CASES: Permission = "updateStatus";
