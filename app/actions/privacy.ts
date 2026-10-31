"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { db, schema as s } from "@/lib/db";
import { audit, fail } from "@/lib/mutate";
import { STEP_UP } from "@/lib/step-up";

/** A reviewable, bounded exception, never an indefinite blanket exemption. */
export async function setCaseRetentionHold(ref: string, reason: string, days: number) {
  const me = await getStaffUser();
  if (!me || !["Owner", "Administrator"].includes(me.role) || !me.permissions.has("viewAll")) return fail("Only the owner or an administrator can manage retention holds.");
  if (!me.stepUpFresh) return fail(STEP_UP);
  if (!/^INZ-\d{4}-\d{3,7}$/.test(ref)) return fail("Enter a valid case reference.");
  if (!Number.isInteger(days) || days < 0 || days > 90) return fail("Choose a review period of up to 90 days.");
  if (days && !["legal", "dispute", "security"].includes(reason)) return fail("Choose a specific retention purpose.");
  const d = await db();
  const result = await d.transaction(async (tx) => {
    const [r] = await tx.select().from(s.requests).where(eq(s.requests.ref, ref)).for("update");
    if (!r || r.stage !== "completed") return fail("A retention hold can only be set on a completed case.");
    if (r.privacyStartedAt) return fail("Cleanup has already started. Removed information cannot be recovered through this control.");
    const until = days ? new Date(Date.now() + days * 864e5).toISOString() : null;
    await tx.update(s.requests).set({ privacyHoldUntil: until, privacyHoldReason: days ? reason : null }).where(eq(s.requests.ref, ref));
    await audit(tx, { actor: me.name, role: me.role, action: days ? "Set case retention hold" : "Released case retention hold", entity: `${ref} · ${days ? `${reason} · review ${until}` : "released"}` });
    return { ok: true as const };
  });
  revalidatePath("/console/overview");
  return result;
}
