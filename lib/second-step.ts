// The authenticator-app second step for staff: checking a code, and the recovery codes for a lost phone. Server only.
import { and, eq, sql } from "drizzle-orm";
import { open } from "./crypto";
import { db, schema as s } from "./db";
import { allowFor } from "./ratelimit";
import { hashRecovery, matchStep, normaliseRecovery } from "./totp";

export type SecondStep = { ok: true; usedRecovery: boolean } | { ok: false; error: string; locked?: boolean };

/** Does `input` open this person's second step? An authenticator code works once (a code already used is refused,
 *  even inside its 30-second window); a recovery code works once and is then gone. Six tries per 15 minutes. */
export async function checkSecondStep(staffId: string, input: string): Promise<SecondStep> {
  if (!(await allowFor("totp", staffId))) return { ok: false, locked: true, error: "Too many wrong codes. Wait a few minutes and sign in again." };
  const d = await db();
  const [person] = await d.select().from(s.staff).where(and(eq(s.staff.id, staffId), eq(s.staff.active, true)));
  const secret = person?.totpEnabledAt ? open(person.totpSecret) : null;
  if (!person || !secret) return { ok: false, error: "The authenticator step is not set up for this account." };
  const code = input.trim();
  const wrong = { ok: false as const, error: "That code is not right. Check your authenticator app and try again." };

  if (/^\d{6}$/.test(code)) {
    const step = matchStep(secret, code);
    if (step === null) return wrong;
    // One conditional write: of two requests carrying the same code, only one moves the step forward.
    const moved = await d.update(s.staff).set({ totpLastStep: step })
      .where(and(eq(s.staff.id, staffId), sql`(${s.staff.totpLastStep} is null or ${s.staff.totpLastStep} < ${step})`)).returning({ id: s.staff.id });
    return moved.length ? { ok: true, usedRecovery: false } : wrong;
  }

  const hash = hashRecovery(normaliseRecovery(code));
  const have = person.totpRecovery ?? [];
  if (!have.includes(hash)) return wrong;
  const left = have.filter((h) => h !== hash);
  const used = await d.update(s.staff).set({ totpRecovery: left })
    .where(and(eq(s.staff.id, staffId), sql`${s.staff.totpRecovery} = ${JSON.stringify(have)}::jsonb`)).returning({ id: s.staff.id });
  return used.length ? { ok: true, usedRecovery: true } : wrong;
}
