"use server";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { contentEntries, primeContent } from "@/lib/content";
import { MAX_CHANGES, collectRows, findMatches, type Match, type ReplaceInput } from "@/lib/content-fields";
import { restoreContent, saveContent, serviceRwNow, type Change } from "@/lib/content-admin";
import type { ServiceRw } from "@/lib/service-text";
import { fail, type Result } from "@/lib/mutate";
import { PERMISSIONS } from "@/lib/permissions";
import { getService, listServices } from "@/lib/repo";

async function editor() {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  if (!me.permissions.has("editContent")) return { error: `Your role can’t do this (${PERMISSIONS.editContent}).` } as const;
  return { me } as const;
}

export type SaveResult = Result<{ saved: number; restored: number }> | { ok: false; error: string; errors: Record<string, string> };

/** Saves edited Kinyarwanda text, all together or not at all: a refused text comes back by key with the reason. */
export async function saveKinyarwanda(changes: Change[]): Promise<SaveResult> {
  const a = await editor();
  if ("error" in a) return fail(a.error!);
  if (!Array.isArray(changes) || !changes.length) return fail("Nothing to save.");
  if (changes.some((c) => !c || typeof c.key !== "string" || typeof c.value !== "string")) return fail("Those changes could not be read. Reload the page and try again.");
  const result = await saveContent(a.me, changes, await listServices({ includeHidden: true }));
  if ("errors" in result) {
    const n = Object.keys(result.errors).length;
    return { ok: false, error: n === 1 ? "One text can’t be saved. Nothing was saved." : `${n} texts can’t be saved. Nothing was saved.`, errors: result.errors };
  }
  revalidatePath("/", "layout");
  return { ok: true, ...result };
}

/** Puts texts back to the Kinyarwanda the site shipped with. */
export async function restoreKinyarwanda(keys: string[]): Promise<Result<{ restored: number }>> {
  const a = await editor();
  if ("error" in a) return fail(a.error!);
  if (!Array.isArray(keys) || keys.some((k) => typeof k !== "string")) return fail("Those texts could not be read. Reload the page and try again.");
  const restored = await restoreContent(a.me, keys);
  revalidatePath("/", "layout");
  return { ok: true, restored };
}

/** A service's Kinyarwanda as the service editor holds it, by path. */
export async function getServiceRw(slug: string): Promise<Result<{ rw: ServiceRw }>> {
  const a = await editor();
  if ("error" in a) return fail(a.error!);
  const service = typeof slug === "string" ? await getService(slug) : undefined;
  if (!service) return fail("That service no longer exists.");
  await primeContent(true);
  return { ok: true, rw: serviceRwNow(service) };
}

const cleanInput = (i: ReplaceInput): ReplaceInput => ({ find: String(i?.find ?? ""), replace: String(i?.replace ?? ""), caseSensitive: !!i?.caseSensitive, wholeWord: !!i?.wholeWord });

/** The Kinyarwanda texts a find and replace would change, and what each would become. Changes nothing. */
export async function previewReplace(input: ReplaceInput): Promise<Result<{ matches: Match[]; total: number }>> {
  const a = await editor();
  if ("error" in a) return fail(a.error!);
  const i = cleanInput(input);
  if (!i.find.trim()) return fail("Type the word or phrase to find.");
  await primeContent(true);
  const all = findMatches(collectRows(await listServices({ includeHidden: true }), contentEntries()), i);
  return { ok: true, matches: all.slice(0, MAX_CHANGES), total: all.length };
}

/** Applies a find and replace to the chosen texts, all together or not at all. The matches are found again here: only the keys come from the page. */
export async function applyReplace(input: ReplaceInput, keys: string[]): Promise<SaveResult> {
  const a = await editor();
  if ("error" in a) return fail(a.error!);
  if (!Array.isArray(keys) || !keys.length) return fail("Choose at least one text.");
  const i = cleanInput(input);
  const services = await listServices({ includeHidden: true });
  await primeContent(true);
  const chosen = new Set(keys.filter((k) => typeof k === "string"));
  const changes = findMatches(collectRows(services, contentEntries()), i).filter((m) => chosen.has(m.key)).map((m) => ({ key: m.key, value: m.next }));
  if (!changes.length) return fail("Those texts no longer contain it. Preview again.");
  const result = await saveContent(a.me, changes, services);
  if ("errors" in result) {
    const n = Object.keys(result.errors).length;
    return { ok: false, error: n === 1 ? "One text can’t be changed. Nothing was changed." : `${n} texts can’t be changed. Nothing was changed.`, errors: result.errors };
  }
  revalidatePath("/", "layout");
  return { ok: true, ...result };
}
