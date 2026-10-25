"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { getStaffUser } from "@/lib/auth";
import { open, seal } from "@/lib/crypto";
import { audit, db, fail, s, type Result } from "@/lib/mutate";
import { allowFor } from "@/lib/ratelimit";
import { checkSecondStep } from "@/lib/second-step";
import { hashRecovery, matchStep, newRecoveryCodes, newSecret, otpauthUrl } from "@/lib/totp";

// A member of staff managing their own authenticator-app step. Setting it up needs the SMS sign-in they already passed;
// changing or removing it needs a current authenticator or recovery code, so a borrowed, unlocked session cannot strip it.

async function me() {
  const user = await getStaffUser();
  if (!user) return null;
  const d = await db();
  const [row] = await d.select().from(s.staff).where(eq(s.staff.id, user.id));
  return row ? { user, row, d } : null;
}
const ended = "Your session has ended. Sign in again.";

/** Step 1: makes a secret and returns it for the authenticator app, as a key, a link and a QR code (drawn here, so the
 *  secret never goes to a QR service). It does nothing until a code from the app confirms it. */
export async function beginTotp(): Promise<Result<{ secret: string; url: string; qr: string }>> {
  const a = await me();
  if (!a) return fail(ended);
  if (a.row.totpEnabledAt) return fail("The authenticator step is already on.");
  if (!(await allowFor("totp", `setup:${a.user.id}`))) return fail("Too many tries. Wait a few minutes.");
  const secret = newSecret();
  try { await a.d.update(s.staff).set({ totpSecret: seal(secret) }).where(eq(s.staff.id, a.user.id)); }
  catch (e) { console.error("[security]", e); return fail("Can’t store the secret safely: DATA_KEY is not set on the server."); }
  const url = otpauthUrl(secret, a.user.name);
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0b1b33", light: "#ffffff" } });
  return { ok: true, secret, url, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` };
}

/** Step 2: a code from the app proves it was added correctly. Turns the step on and returns the recovery codes, once. */
export async function confirmTotp(code: string): Promise<Result<{ recovery: string[] }>> {
  const a = await me();
  if (!a) return fail(ended);
  if (a.row.totpEnabledAt) return fail("The authenticator step is already on.");
  if (!(await allowFor("totp", `setup:${a.user.id}`))) return fail("Too many tries. Wait a few minutes.");
  const secret = open(a.row.totpSecret);
  if (!secret) return fail("Start the setup again.");
  const step = matchStep(secret, code.trim());
  if (step === null) return fail("That code is not right. Check the app and try again.");
  const recovery = newRecoveryCodes();
  await a.d.transaction(async (tx) => {
    await tx.update(s.staff).set({ totpEnabledAt: new Date().toISOString(), totpLastStep: step, totpRecovery: recovery.map(hashRecovery) }).where(eq(s.staff.id, a.user.id));
    await audit(tx, { actor: a.user.name, role: a.user.role, action: "Turned on authenticator step", entity: a.user.name });
  });
  revalidatePath("/console/security");
  return { ok: true, recovery };
}

/** New recovery codes, replacing the old ones. Needs a current code. */
export async function newRecoveryCodesFor(code: string): Promise<Result<{ recovery: string[] }>> {
  const a = await me();
  if (!a) return fail(ended);
  if (!a.row.totpEnabledAt) return fail("Turn the authenticator step on first.");
  const ok = await checkSecondStep(a.user.id, code);
  if (!ok.ok) return fail(ok.error);
  const recovery = newRecoveryCodes();
  await a.d.transaction(async (tx) => {
    await tx.update(s.staff).set({ totpRecovery: recovery.map(hashRecovery) }).where(eq(s.staff.id, a.user.id));
    await audit(tx, { actor: a.user.name, role: a.user.role, action: "New recovery codes", entity: a.user.name });
  });
  revalidatePath("/console/security");
  return { ok: true, recovery };
}

/** Turns the step off. Needs a current code, and is refused when the owner requires the step. */
export async function disableTotp(code: string): Promise<Result> {
  const a = await me();
  if (!a) return fail(ended);
  if (process.env.REQUIRE_STAFF_TOTP === "1") return fail("The owner requires the authenticator step for everyone.");
  if (!a.row.totpEnabledAt) return { ok: true };
  const ok = await checkSecondStep(a.user.id, code);
  if (!ok.ok) return fail(ok.error);
  await a.d.transaction(async (tx) => {
    await tx.update(s.staff).set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: null }).where(eq(s.staff.id, a.user.id));
    await audit(tx, { actor: a.user.name, role: a.user.role, action: "Turned off authenticator step", entity: a.user.name });
  });
  revalidatePath("/console/security");
  return { ok: true };
}
