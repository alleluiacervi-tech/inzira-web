"use server";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { addCustomPeriod, addWatch, linkRequest, recordDeclaration, recordMoney, recordRraPayment, stopWatch } from "@/lib/tax-diary";

async function writer() {
  const me = await getStaffUser();
  if (!me) return { ok: false as const, error: "Your session has ended. Sign in again." };
  if (!me.permissions.has("updateStatus") && !me.permissions.has("recordOfficial")) return { ok: false as const, error: "Your role can’t change the tax diary." };
  return { ok: true as const, me };
}

function refresh() {
  revalidatePath("/console/taxes");
  revalidatePath("/console/my-day");
}

export async function addTaxWatch(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await addWatch(gate.me, {
    profileId: String(form.get("profileId") ?? ""),
    kind: String(form.get("kind") ?? ""),
    payRoute: String(form.get("payRoute") ?? ""),
    note: String(form.get("note") ?? ""),
  });
  if (result.ok) refresh();
  return result;
}

export async function addTaxDate(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await addCustomPeriod(gate.me, {
    profileId: String(form.get("profileId") ?? ""),
    label: String(form.get("label") ?? ""),
    legalDue: String(form.get("legalDue") ?? ""),
    payRoute: String(form.get("payRoute") ?? ""),
  });
  if (result.ok) refresh();
  return result;
}

export async function saveDeclaration(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await recordDeclaration(gate.me, String(form.get("periodId") ?? ""), String(form.get("ref") ?? ""), String(form.get("amount") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function saveRraPayment(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await recordRraPayment(gate.me, String(form.get("periodId") ?? ""), String(form.get("ref") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function saveMoneyReceived(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await recordMoney(gate.me, String(form.get("periodId") ?? ""), String(form.get("receipt") ?? ""), String(form.get("amount") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function saveRequestLink(_prev: { ok: boolean; error?: string } | null, form: FormData) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await linkRequest(gate.me, String(form.get("periodId") ?? ""), String(form.get("ref") ?? ""));
  if (result.ok) refresh();
  return result;
}

export async function stopTaxWatch(watchId: string) {
  const gate = await writer();
  if (!gate.ok) return gate;
  const result = await stopWatch(gate.me, watchId);
  if (result.ok) refresh();
  return result;
}
