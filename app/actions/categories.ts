"use server";
import { asc, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getStaffUser } from "@/lib/auth";
import { CATEGORY_ICONS, isCategoryIcon } from "@/lib/category-icons";
import { primeContent } from "@/lib/content";
import { ServiceTextRefused, categoryRwNow, removeCategoryText, saveCategoryText, type CategoryRw } from "@/lib/content-admin";
import { BUILT_IN_CATEGORIES } from "@/lib/mock/catalogue";
import { refreshNavCategories } from "@/lib/nav-categories";
import { audit, db, fail, s, type Result } from "@/lib/mutate";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { sniffType } from "@/lib/storage";

async function admin(perm: Permission) {
  const me = await getStaffUser();
  if (!me) return { error: "Your session has ended. Sign in again." } as const;
  if (!me.permissions.has(perm)) return { error: `Your role can’t do this (${PERMISSIONS[perm]}).` } as const;
  return { me, d: await db() };
}

export type CategoryInput = { id: string; name: string; short: string; desc: string; icon: string; institution: string; visible: boolean; featured: boolean };
/** What to do with the institution's logo: keep it, remove it, or replace it with an image (base64 of a PNG, JPEG or WebP). */
export type LogoChange = { type: "keep" } | { type: "remove" } | { type: "set"; data: string };

const MAX_LOGO_BYTES = 200_000;
const BUILT_IN = new Set(BUILT_IN_CATEGORIES);

/** The image behind an uploaded logo, or the reason it is refused. Checked by its content: a name or a type proves nothing. */
function readLogo(data: string): { ok: true; base64: string; type: string } | { ok: false; error: string } {
  const base64 = String(data).replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return { ok: false, error: "That logo could not be read. Choose a PNG, JPEG or WebP image." };
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, error: "That logo is too large. Use an image under 200 KB." };
  const type = sniffType(bytes);
  if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp") return { ok: false, error: "The logo must be a PNG, JPEG or WebP image." };
  return { ok: true, base64, type };
}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof db>>["transaction"]>[0]>[0];
/** Numbers the categories 0, 1, 2… in the order given, so the order is always whole. */
async function renumber(tx: Tx, ids: string[]) {
  for (const [i, id] of ids.entries()) await tx.update(s.categories).set({ position: i }).where(eq(s.categories.id, id));
}
const orderedIds = async (tx: Tx) => (await tx.select({ id: s.categories.id }).from(s.categories).orderBy(asc(s.categories.position), asc(s.categories.id))).map((r) => r.id);

function done(rw: boolean) {
  refreshNavCategories();
  revalidatePath("/", "layout");
  return rw ? primeContent(true) : Promise.resolve();
}

/** Adds or changes a category, with its institution's logo and, when given, its Kinyarwanda (all in one transaction).
 *  Kinyarwanda needs the permission to edit Kinyarwanda text. */
export async function saveCategory(input: CategoryInput, isNew: boolean, logo: LogoChange = { type: "keep" }, rw?: Partial<CategoryRw>): Promise<Result> {
  const a = await admin("editServices");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  if (rw && !me.permissions.has("editContent")) return fail(`Your role can’t do this (${PERMISSIONS.editContent}).`);
  const name = String(input?.name ?? "").trim();
  const short = String(input?.short ?? "").trim();
  const desc = String(input?.desc ?? "").trim();
  const institution = String(input?.institution ?? "").trim();
  const id = String(input?.id ?? "");
  if (name.length < 2 || name.length > 80) return fail("Give the category a name of up to 80 characters.");
  if (short.length < 2 || short.length > 30) return fail("Give the category a short name of up to 30 characters. It is the label in the menu.");
  if (desc.length < 5 || desc.length > 300) return fail("Write a description of up to 300 characters for the category.");
  if (institution.length > 80) return fail("The institution’s name can be 80 characters at most.");
  if (!/^[a-z0-9-]{2,30}$/.test(id) || id === "all") return fail("The category address can only use lowercase letters, numbers and dashes.");
  if (!isCategoryIcon(input.icon)) return fail(`Choose one of the icons: ${CATEGORY_ICONS.map((i) => i.label).join(", ")}.`);
  const mark = logo.type === "set" ? readLogo(logo.data) : undefined;
  if (mark && !mark.ok) return fail(mark.error);

  try {
    await d.transaction(async (tx) => {
      const [before] = await tx.select().from(s.categories).where(eq(s.categories.id, id));
      if (isNew && before) throw new Error("exists");
      if (!isNew && !before) throw new Error("gone");
      // "Other" opens the request form instead of a list: it stays on the site and has no institution.
      const fixed = !!before?.href;
      const row = {
        name, short, desc, icon: input.icon,
        visible: fixed ? true : !!input.visible,
        featured: fixed ? false : !!input.featured,
        institution: fixed ? null : institution || null,
      };
      const logoSet = fixed ? {} : logo.type === "remove" ? { markData: null, markType: null, markRev: (before?.markRev ?? 0) + 1 }
        : mark?.ok ? { markData: mark.base64, markType: mark.type, markRev: (before?.markRev ?? 0) + 1 } : {};
      if (before) await tx.update(s.categories).set({ ...row, ...logoSet }).where(eq(s.categories.id, id));
      else {
        await tx.insert(s.categories).values({ id, ...row, ...logoSet, position: 999 });
        // A new category goes in before the catch-all that opens the request form.
        const rest = (await orderedIds(tx)).filter((x) => x !== id);
        const hrefs = new Set((await tx.select({ id: s.categories.id, href: s.categories.href }).from(s.categories)).filter((c) => c.href).map((c) => c.id));
        const at = rest.findIndex((x) => hrefs.has(x));
        rest.splice(at < 0 ? rest.length : at, 0, id);
        await renumber(tx, rest);
      }
      if (rw) await saveCategoryText(tx, me, id, rw);
      const what = !before ? "Added category" : before.visible !== row.visible ? (row.visible ? "Showed category" : "Hid category") : "Edited category";
      await audit(tx, { actor: me.name, role: me.role, action: what, entity: name });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "exists") return fail("A category with that address already exists. Change its name or address.");
    if (e instanceof Error && e.message === "gone") return fail("That category no longer exists. Reload the page.");
    if (e instanceof ServiceTextRefused) return fail(`The Kinyarwanda can’t be saved. ${e.message}`);
    throw e;
  }
  await done(!!rw);
  return { ok: true };
}

/** Moves a category one place up or down the list on the site. */
export async function moveCategory(id: string, direction: "up" | "down"): Promise<Result> {
  const a = await admin("editServices");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const moved = await d.transaction(async (tx) => {
    const ids = await orderedIds(tx);
    const at = ids.indexOf(id);
    const to = direction === "up" ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= ids.length) return false;
    [ids[at], ids[to]] = [ids[to], ids[at]];
    await renumber(tx, ids);
    await audit(tx, { actor: me.name, role: me.role, action: "Reordered categories", entity: `${id} moved ${direction}` });
    return true;
  });
  if (moved) await done(false);
  return { ok: true };
}

/** Deletes a category nobody uses: not one the site ships with, and with no services in it (hide it instead). */
export async function deleteCategory(id: string): Promise<Result> {
  const a = await admin("editServices");
  if ("error" in a) return fail(a.error!);
  const { me, d } = a;
  const [row] = await d.select().from(s.categories).where(eq(s.categories.id, String(id)));
  if (!row) return { ok: true };
  if (BUILT_IN.has(row.id) || row.href) return fail("The categories the site started with can’t be deleted. Hide the category instead.");
  const [{ n }] = await d.select({ n: count() }).from(s.services).where(eq(s.services.category, row.id));
  if (n > 0) return fail(`${n === 1 ? "A service is" : `${n} services are`} still in this category. Move ${n === 1 ? "it" : "them"} to another category first, or hide the category.`);
  await d.transaction(async (tx) => {
    await removeCategoryText(tx, row.id);
    await tx.delete(s.categories).where(eq(s.categories.id, row.id));
    await renumber(tx, await orderedIds(tx));
    await audit(tx, { actor: me.name, role: me.role, action: "Deleted category", entity: row.name });
  });
  await done(true);
  return { ok: true };
}

/** A category's Kinyarwanda as the category editor holds it. */
export async function getCategoryRw(id: string): Promise<Result<{ rw: CategoryRw }>> {
  const a = await admin("editContent");
  if ("error" in a) return fail(a.error!);
  await primeContent(true);
  return { ok: true, rw: categoryRwNow(String(id)) };
}
