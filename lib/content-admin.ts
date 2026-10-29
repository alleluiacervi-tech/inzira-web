// Writing the Kinyarwanda text edited in the admin console. Server only. Reading and serving it is lib/content.ts.
import { inArray, like } from "drizzle-orm";
import { MAX_CHANGES, allFields, checkText, planServiceText, type Field, type ServiceText } from "./content-fields";
import { pathInService, serviceFields, type ServiceRw } from "./service-text";
import { primeContent } from "./content";
import { db, schema as s, type Db } from "./db";
import { CAT, UI, getPath, liveCatalogue, managedKey, shippedCatalogue, shippedRw } from "./i18n/live";
import { audit } from "./mutate";

export type Change = { key: string; value: string };
export type Saved = { saved: number; restored: number } | { errors: Record<string, string> };

const shippedText = (key: string): string => {
  const ui = key.startsWith(UI);
  const value = getPath(ui ? shippedRw() : shippedCatalogue(), key.slice(ui ? UI.length : CAT.length));
  return typeof value === "string" ? value : "";
};

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Writes and removes edits inside a transaction, with one audit line. */
async function writeEdits(tx: Tx, who: { name: string; role: string }, writes: Map<string, string>, removes: Set<string>, note?: string, audited = true) {
  for (const [key, value] of writes) {
    await tx.insert(s.content).values({ key, value, updatedBy: who.name })
      .onConflictDoUpdate({ target: s.content.key, set: { value, updatedBy: who.name, updatedAt: new Date().toISOString() } });
  }
  if (removes.size) await tx.delete(s.content).where(inArray(s.content.key, [...removes]));
  const keys = [...writes.keys(), ...removes];
  if (keys.length && audited) await audit(tx, { actor: who.name, role: who.role, action: removes.size && !writes.size ? "Restored Kinyarwanda text" : "Edited Kinyarwanda text", entity: note ?? summary(keys) });
}

/**
 * Saves edits all together, or none when any is refused (the refusals come back by key). A text equal to the shipped one,
 * or an emptied text of a string the site has no Kinyarwanda for, removes the edit. Emptying a string that has shipped
 * text is refused: "Reset to original" is how to go back.
 */
export async function saveContent(who: { name: string; role: string }, changes: Change[], services: ServiceText[]): Promise<Saved> {
  const fields = allFields(services);
  const errors: Record<string, string> = {};
  const writes = new Map<string, string>();
  const removes = new Set<string>();
  if (changes.length > MAX_CHANGES) return { errors: { "": `Save at most ${MAX_CHANGES} texts at a time.` } };
  for (const { key, value } of changes) {
    const field: Field | undefined = fields.get(key);
    if (!field) { errors[key] = "The site has no text with this key."; continue; }
    const checked = checkText(field, String(value));
    if (!checked.ok) { errors[key] = checked.error; continue; }
    const shipped = shippedText(key);
    if (checked.value === shipped) removes.add(key);
    else if (!checked.value) { if (shipped) errors[key] = "This can’t be empty. Use “Reset to original” to go back to the original text."; else removes.add(key); }
    else writes.set(key, checked.value);
  }
  if (Object.keys(errors).length) return { errors };
  const d = await db();
  await d.transaction((tx) => writeEdits(tx, who, writes, removes));
  await primeContent(true);
  return { saved: writes.size, restored: removes.size };
}

/** Removes the edits on these keys, so the shipped text shows again. */
export async function restoreContent(who: { name: string; role: string }, keys: string[]): Promise<number> {
  const mine = [...new Set(keys)].filter((k) => k.startsWith(UI) || k.startsWith(CAT)).slice(0, MAX_CHANGES);
  if (!mine.length) return 0;
  const d = await db();
  const removed = await d.transaction(async (tx) => {
    const gone = await tx.delete(s.content).where(inArray(s.content.key, mine)).returning({ key: s.content.key });
    if (gone.length) await audit(tx, { actor: who.name, role: who.role, action: "Restored Kinyarwanda text", entity: summary(gone.map((r) => r.key)) });
    return gone.length;
  });
  await primeContent(true);
  return removed;
}

/** "home.hero.title" or "home.hero.title, home.hero.sub +3 more": which strings, for the audit log. */
const summary = (keys: string[]) => {
  const plain = keys.map((k) => k.replace(/^(ui|cat):/, ""));
  return plain.length <= 2 ? plain.join(", ") : `${plain.slice(0, 2).join(", ")} +${plain.length - 2} more`;
};

/** Who last edited a string and when, for the editor. */
export async function lastEdits(keys: string[]): Promise<Record<string, { by: string; at: string }>> {
  if (!keys.length) return {};
  const rows = await (await db()).select({ key: s.content.key, by: s.content.updatedBy, at: s.content.updatedAt }).from(s.content).where(inArray(s.content.key, keys));
  return Object.fromEntries(rows.map((r) => [r.key, { by: r.by, at: r.at }]));
}

/** A service's Kinyarwanda as the service editor holds it: the text the site shows now for every line of its English, by path. */
export function serviceRwNow(service: ServiceText): ServiceRw {
  const out: ServiceRw = {};
  for (const f of serviceFields(service)) {
    const now = getPath(liveCatalogue(), f.key.slice(CAT.length));
    out[pathInService(f)] = typeof now === "string" ? now : "";
  }
  return out;
}

export class ServiceTextRefused extends Error {}

/**
 * Saves a service's Kinyarwanda with the service itself, in the caller's transaction: the lines in `rw` (see planServiceText)
 * are stored, so a service added or changed in the console is complete in both languages at once. Throws ServiceTextRefused,
 * with what to fix, when a line is not acceptable, so the whole save is undone.
 */
export async function saveServiceText(tx: Tx, who: { name: string; role: string }, service: ServiceText, rw: ServiceRw) {
  const rows = await tx.select({ key: s.content.key, value: s.content.value }).from(s.content).where(like(s.content.key, `${CAT}services.${service.slug}.%`));
  const plan = planServiceText(service, rw, Object.fromEntries(rows.map((r) => [r.key, r.value])));
  if (plan.errors.length) throw new ServiceTextRefused(plan.errors.slice(0, 3).join(" "));
  const marker = managedKey(service.slug);
  // Saving a service whose Kinyarwanda did not change leaves no line in the audit log.
  const changed = plan.removes.size > 0 || [...plan.writes.keys()].some((k) => k !== marker);
  await writeEdits(tx, who, plan.writes, plan.removes, `${service.slug} (with the service)`, changed);
}

// ---------------- a category, saved with its Kinyarwanda ----------------
export type CategoryRw = { name: string; short: string; desc: string; institution: string };
const CATEGORY_TEXT: { field: keyof CategoryRw; label: string; long: boolean }[] = [
  { field: "name", label: "Name", long: false },
  { field: "short", label: "Short name", long: false },
  { field: "desc", label: "Description", long: true },
  { field: "institution", label: "Institution", long: false },
];
const categoryKey = (id: string, field: string) => `${CAT}categories.${id}.${field}`;

/** A category's Kinyarwanda as the category editor holds it: the text the site shows now. */
export function categoryRwNow(id: string): CategoryRw {
  const now = (field: string) => { const v = getPath(liveCatalogue(), `categories.${id}.${field}`); return typeof v === "string" ? v : ""; };
  return { name: now("name"), short: now("short"), desc: now("desc"), institution: now("institution") };
}

/** Saves a category's Kinyarwanda in the caller's transaction. A text left empty, or equal to the shipped one, removes the edit
 *  (visitors then read the shipped Kinyarwanda, or the English where there is none). Throws ServiceTextRefused, with what to fix. */
export async function saveCategoryText(tx: Tx, who: { name: string; role: string }, id: string, rw: Partial<CategoryRw>) {
  const rows = await tx.select({ key: s.content.key, value: s.content.value }).from(s.content).where(like(s.content.key, `${CAT}categories.${id}.%`));
  const existing = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const writes = new Map<string, string>();
  const removes = new Set<string>();
  const errors: string[] = [];
  for (const { field, label, long } of CATEGORY_TEXT) {
    if (typeof rw[field] !== "string") continue;
    const key = categoryKey(id, field);
    const checked = checkText({ key, label, en: "", long }, rw[field]!);
    if (!checked.ok) { errors.push(`${label}: ${checked.error}`); continue; }
    const shipped = getPath(shippedCatalogue(), `categories.${id}.${field}`);
    if (!checked.value || checked.value === (typeof shipped === "string" ? shipped : "")) { if (key in existing) removes.add(key); }
    else if (existing[key] !== checked.value) writes.set(key, checked.value);
  }
  if (errors.length) throw new ServiceTextRefused(errors.join(" "));
  await writeEdits(tx, who, writes, removes, `category ${id} (with the category)`);
}

/** Removes every Kinyarwanda edit of a category that is being deleted. */
export async function removeCategoryText(tx: Tx, id: string) {
  await tx.delete(s.content).where(like(s.content.key, `${CAT}categories.${id}.%`));
}
