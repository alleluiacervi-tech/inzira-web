// Writing the Kinyarwanda text edited in the admin console. Server only. Reading and serving it is lib/content.ts.
import { inArray } from "drizzle-orm";
import { MAX_CHANGES, allFields, checkText, type Field, type ServiceText } from "./content-fields";
import { primeContent } from "./content";
import { db, schema as s } from "./db";
import { CAT, UI, getPath, shippedCatalogue, shippedRw } from "./i18n/live";
import { audit } from "./mutate";

export type Change = { key: string; value: string };
export type Saved = { saved: number; restored: number } | { errors: Record<string, string> };

const shippedText = (key: string): string => {
  const ui = key.startsWith(UI);
  const value = getPath(ui ? shippedRw() : shippedCatalogue(), key.slice(ui ? UI.length : CAT.length));
  return typeof value === "string" ? value : "";
};

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
  await d.transaction(async (tx) => {
    for (const [key, value] of writes) {
      await tx.insert(s.content).values({ key, value, updatedBy: who.name })
        .onConflictDoUpdate({ target: s.content.key, set: { value, updatedBy: who.name, updatedAt: new Date().toISOString() } });
    }
    if (removes.size) await tx.delete(s.content).where(inArray(s.content.key, [...removes]));
    const keys = [...writes.keys(), ...removes];
    if (keys.length) await audit(tx, { actor: who.name, role: who.role, action: removes.size && !writes.size ? "Restored Kinyarwanda text" : "Edited Kinyarwanda text", entity: summary(keys) });
  });
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
