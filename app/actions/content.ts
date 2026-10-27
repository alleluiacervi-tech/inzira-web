"use server";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { restoreContent, saveContent, type Change } from "@/lib/content-admin";
import { fail, type Result } from "@/lib/mutate";
import { PERMISSIONS } from "@/lib/permissions";
import { listServices } from "@/lib/repo";

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
