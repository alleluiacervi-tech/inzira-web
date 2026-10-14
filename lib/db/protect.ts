// Encrypts identity numbers that were stored as plain text, and re-encrypts values still under the previous key
// after a key rotation. Runs when the database opens; with nothing to do it is one cheap query.
import { eq, or, sql } from "drizzle-orm";
import { hasDataKey, open, seal } from "../crypto";
import type { Db } from "./index";
import { profiles } from "./schema";

export async function protectIdentity(d: Db): Promise<number> {
  if (!hasDataKey()) { console.error("[crypto] DATA_KEY is not set: ID and TIN numbers are not being encrypted"); return 0; }
  const rows = await d.select({ id: profiles.id, nationalId: profiles.nationalId, tin: profiles.tin }).from(profiles)
    .where(or(
      sql`${profiles.nationalId} is not null and ${profiles.nationalId} not like 'enc:v1:%'`,
      sql`${profiles.tin} is not null and ${profiles.tin} not like 'enc:v1:%'`,
      // Values under a previous key are re-sealed by `npm run db:rekey`, not on every start.
    ));
  for (const r of rows) {
    await d.update(profiles).set({ nationalId: seal(r.nationalId), tin: seal(r.tin) }).where(eq(profiles.id, r.id));
  }
  return rows.length;
}

/** Re-encrypts every sealed value with the current key (after DATA_KEY was replaced and the old one kept in DATA_KEY_PREVIOUS). */
export async function rekeyIdentity(d: Db): Promise<number> {
  const rows = await d.select({ id: profiles.id, nationalId: profiles.nationalId, tin: profiles.tin }).from(profiles);
  let n = 0;
  for (const r of rows) {
    const nationalId = open(r.nationalId), tin = open(r.tin);
    if ((r.nationalId && nationalId === null) || (r.tin && tin === null)) throw new Error(`Could not open the values of ${r.id}; check DATA_KEY and DATA_KEY_PREVIOUS before going on.`);
    await d.update(profiles).set({ nationalId: seal(nationalId), tin: seal(tin) }).where(eq(profiles.id, r.id));
    n++;
  }
  return n;
}
