// The Kinyarwanda text the site is showing right now: the text shipped in rw.json and catalogue-rw.json with the
// edits made in Admin › Kinyarwanda text laid over it. Plain functions with no database, so the same code runs on the
// server (lib/content.ts loads the edits) and in the browser (components/ContentBridge.tsx is handed them by the page).
//
// An edit is stored by key: "ui:<path in rw.json>" ("ui:home.hero.title") or "cat:<path in catalogue-rw.json>"
// ("cat:services.passport-application.steps.2.title"). A number in a path is a position in a list.
import catalogueBase from "./catalogue-rw.json";
import rwBase from "./rw.json";

export const UI = "ui:";
export const CAT = "cat:";
/** What the text under "ui:" and "cat:" looks like; the shipped files are the examples. */
export type RwBundle = typeof rwBase;
export type RwCatalogue = typeof catalogueBase;

const BLOCKED = new Set(["__proto__", "constructor", "prototype"]);
const isIndex = (segment: string) => /^\d+$/.test(segment);
const own = (node: object, key: string) => Object.prototype.hasOwnProperty.call(node, key);

/** The text at a path, or undefined. */
export function getPath(root: unknown, path: string): unknown {
  let node = root;
  for (const segment of path.split(".")) {
    if (!node || typeof node !== "object" || BLOCKED.has(segment) || !own(node, segment)) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Puts `value` at `path` inside `root`, making the objects and lists on the way. False when the path is not safe to write. */
export function setPath(root: object, path: string, value: string): boolean {
  const segments = path.split(".");
  if (segments.some((segment) => !segment || BLOCKED.has(segment))) return false;
  let node = root as Record<string, unknown>;
  for (const [i, segment] of segments.entries()) {
    if (i === segments.length - 1) { node[segment] = value; return true; }
    const next = own(node, segment) ? node[segment] : undefined;
    if (typeof next === "string") return false; // a string where the path needs a section: not a path the site has
    if (!next || typeof next !== "object") node[segment] = isIndex(segments[i + 1]) ? [] : {};
    node = node[segment] as Record<string, unknown>;
  }
  return false;
}

/** A copy of `base` with the edits under `prefix` laid over it. `base` itself is never changed. */
function overlay<T extends object>(base: T, entries: Record<string, string>, prefix: string): T {
  const mine = Object.entries(entries).filter(([key, value]) => key.startsWith(prefix) && typeof value === "string");
  if (!mine.length) return base;
  const copy = structuredClone(base);
  for (const [key, value] of mine) setPath(copy, key.slice(prefix.length), value);
  return copy;
}

type Live = { rw: RwBundle; catalogue: RwCatalogue; version: string };
// Kept on globalThis, not in this module: a server builds the pages (server components), the HTML of client components and
// the route handlers as separate bundles, each with its own copy of this file, and all of them must show the same text.
const g = globalThis as unknown as { __inziraLive?: Live };
const state = (): Live => (g.__inziraLive ??= { rw: rwBase, catalogue: catalogueBase, version: "" });

/** Makes these edits the text the site shows. `version` names this set of edits; the same version is never applied twice. */
export function applyContent(entries: Record<string, string>, version: string) {
  if (version === state().version) return;
  g.__inziraLive = { rw: overlay(rwBase, entries, UI), catalogue: overlay(catalogueBase, entries, CAT), version };
}

export const liveRw = (): RwBundle => state().rw;
export const liveCatalogue = (): RwCatalogue => state().catalogue;
/** Changes whenever the edits change; "" while nothing has been edited. */
export const contentVersion = () => state().version;

/** The text shipped with the site, before any edit. */
export const shippedRw = (): RwBundle => rwBase;
export const shippedCatalogue = (): RwCatalogue => catalogueBase;
