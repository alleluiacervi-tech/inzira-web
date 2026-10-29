// The categories in the public menu, kept in memory for a few seconds so the menu does not cost a query on every page.
// An edit in the console shows at once on the instance that saved it (refreshNavCategories) and within CACHE_MS on the others.
import { localizeCategory } from "./i18n/present";
import type { Locale } from "./i18n/locale";
import { listNavCategories } from "./repo";
import type { Category } from "./types";

const CACHE_MS = 15_000;
type Store = { at: number; list: Category[]; inflight?: Promise<void> };
const g = globalThis as unknown as { __inziraNav?: Store };
const store = (): Store => (g.__inziraNav ??= { at: 0, list: [] });

async function load(st: Store) {
  try {
    st.list = await listNavCategories();
    st.at = Date.now();
  } catch (e) {
    // The menu keeps the categories it had (or none: it still links to the whole list of services).
    console.error("[nav] could not read the categories; keeping the menu already loaded", e);
    st.at = Date.now() - CACHE_MS + 5_000;
  }
}

/** What the menu shows, in the reader's language. Never throws. */
export async function navCategories(locale: Locale): Promise<Category[]> {
  const st = store();
  if (Date.now() - st.at >= CACHE_MS) {
    st.inflight ??= load(st).finally(() => { st.inflight = undefined; });
    await st.inflight;
  }
  return st.list.map((c) => localizeCategory(c, locale));
}

/** Forget what was loaded, so the next page reads the categories again. */
export function refreshNavCategories() {
  store().at = 0;
}
