// Kinyarwanda text edited in the admin console. Server only.
// The site ships its Kinyarwanda in lib/i18n/rw.json and catalogue-rw.json. An administrator's edits are rows in the
// `content` table; this file keeps a copy in memory, lays it over the shipped text (lib/i18n/live.ts), and writes new
// edits. Pages ask for it through getLocale(), so the text is loaded before anything is rendered.
// Writing edits is in lib/content-admin.ts (kept apart: it needs the audit log, which must not load with getLocale).
import { db, schema as s } from "./db";
import { CAT, UI, applyContent } from "./i18n/live";

/** How long one server instance keeps what it loaded. An edit is seen by the others within this time. */
const FRESH_MS = 15_000;
/** After a failed read, how long before trying again. */
const RETRY_MS = 5_000;

type Store = { loadedAt: number; entries: Record<string, string>; inflight?: Promise<void> };
const g = globalThis as unknown as { __inziraContent?: Store };
const store = (): Store => (g.__inziraContent ??= { loadedAt: 0, entries: {} });

async function load(st: Store) {
  try {
    const rows = await (await db()).select({ key: s.content.key, value: s.content.value, updatedAt: s.content.updatedAt }).from(s.content);
    const entries: Record<string, string> = {};
    let newest = "";
    for (const r of rows) {
      if (!r.key.startsWith(UI) && !r.key.startsWith(CAT)) continue;
      entries[r.key] = r.value;
      if (r.updatedAt && r.updatedAt > newest) newest = r.updatedAt;
    }
    st.entries = entries;
    // Names this set of edits: any added, changed or removed row changes it.
    applyContent(entries, `${Object.keys(entries).length}:${newest}`);
    st.loadedAt = Date.now();
  } catch (e) {
    // The site keeps working on the text it has (the shipped text, or the last edits it read).
    console.error("[content] could not read the Kinyarwanda edits; showing the text already loaded", e);
    st.loadedAt = Date.now() - FRESH_MS + RETRY_MS;
  }
}

/** Loads the edits when this instance has none or they are older than FRESH_MS. Never throws. `force` skips the wait. */
export async function primeContent(force = false): Promise<void> {
  const st = store();
  if (!force && Date.now() - st.loadedAt < FRESH_MS) return;
  st.inflight ??= load(st).finally(() => { st.inflight = undefined; });
  await st.inflight;
}

/** The edits loaded so far, by key. */
export const contentEntries = (): Record<string, string> => store().entries;
