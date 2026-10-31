// Executes the exact pre-hydration browser script with deterministic storage and navigation.
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { CLIENT_RECOVERY_BOOTSTRAP } from "../lib/client-recovery.ts";

type Handler = (event: unknown) => void;
const domError = { name: "NotFoundError", message: "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node." };
function browser({ store = new Map<string, string>(), blocked = false, offline = false, pathname = "/services", locale = "en" } = {}) {
  const windowEvents = new Map<string, Handler[]>(), documentEvents = new Map<string, Handler[]>();
  let reloads = 0;
  const nodes: { id?: string; children: unknown[]; [key: string]: unknown }[] = [];
  const listen = (events: Map<string, Handler[]>) => (name: string, fn: Handler) => events.set(name, [...(events.get(name) ?? []), fn]);
  const document = {
    documentElement: { lang: locale },
    body: { appendChild: (node: typeof nodes[number]) => nodes.push(node) },
    addEventListener: listen(documentEvents),
    getElementById: (id: string) => nodes.find((n) => n.id === id),
    createElement: (tag: string) => ({ tagName: tag.toUpperCase(), children: [] as unknown[], style: {}, setAttribute() {}, appendChild(node: unknown) { this.children.push(node); } }),
  };
  const window = {
    location: { href: `https://inziraservices.com${pathname}`, origin: "https://inziraservices.com", pathname, reload: () => reloads++ },
    sessionStorage: { getItem: (key: string) => { if (blocked) throw new Error("blocked"); return store.get(key) ?? null; }, setItem: (key: string, value: string) => { if (blocked) throw new Error("blocked"); store.set(key, value); } },
    addEventListener: listen(windowEvents),
    __inziraClientRecovery: undefined as undefined | { recover: (error: unknown) => boolean; requiresRefresh: (error: unknown) => boolean },
  };
  const execute = () => runInNewContext(CLIENT_RECOVERY_BOOTSTRAP, { window, document, navigator: { onLine: !offline }, URL, Date });
  execute();
  return { window, document, store, nodes, execute, reloads: () => reloads, emit: (name: string, event: unknown) => windowEvents.get(name)?.forEach((fn) => fn(event)), edit: (target: unknown) => documentEvents.get("input")?.forEach((fn) => fn({ target })) };
}
let checks = 0;
const test = (name: string, fn: () => void) => { fn(); checks++; console.log(`  ok ${name}`); };
test("reported DOM ownership failure gets one fresh document load", () => {
  const b = browser(); b.emit("error", { error: domError }); assert.equal(b.reloads(), 1);
  b.emit("unhandledrejection", { reason: domError }); assert.equal(b.reloads(), 1);
  assert.equal(b.store.size, 1); assert.match([...b.store.values()][0], /^\d+$/);
});
test("a failing fresh document cannot enter an automatic reload loop", () => {
  const store = new Map<string, string>(); const first = browser({ store }); first.emit("error", { error: domError });
  const second = browser({ store }); second.emit("error", { error: domError }); assert.equal(second.reloads(), 0); assert.equal(second.nodes.length, 1);
});
test("unfinished input is never read or automatically discarded", () => {
  const b = browser(); b.edit({ tagName: "INPUT", type: "email", get value() { throw new Error("must never read client input"); } });
  b.emit("error", { error: domError }); assert.equal(b.reloads(), 0); assert.equal(b.store.size, 0); assert.equal(b.nodes.length, 1);
});
test("unavailable storage and offline clients never auto-reload", () => {
  for (const options of [{ blocked: true }, { offline: true }]) { const b = browser(options); b.emit("error", { error: domError }); assert.equal(b.reloads(), 0); assert.equal(b.nodes.length, 1); }
});
test("payment screens remain under explicit user control", () => {
  const b = browser({ pathname: "/r/INZ-2026-00001/pay" }); b.emit("error", { error: domError }); assert.equal(b.reloads(), 0);
});
test("ordinary bugs, extension connection errors and CSP errors are not hidden or retried", () => {
  const b = browser();
  for (const message of ["Could not establish connection. Receiving end does not exist.", "Loading the stylesheet violates Content Security Policy", "Cannot read properties of undefined", "Failed to fetch"]) assert.equal(b.window.__inziraClientRecovery!.recover({ message }), false);
  assert.equal(b.reloads(), 0); assert.equal(b.nodes.length, 0);
});
test("inserting before an externally moved node uses the same bounded recovery", () => {
  const b = browser(); assert.equal(b.window.__inziraClientRecovery!.recover({ message: "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node." }), true); assert.equal(b.reloads(), 1);
});
test("Kinyarwanda pages get an understandable explicit refresh notice", () => {
  const b = browser({ locale: "rw", blocked: true }); b.emit("error", { error: domError });
  const children = b.nodes[0].children as { textContent: string }[];
  assert.match(children[0].textContent, /Uru rupapuro/); assert.equal(children[1].textContent, "Ongera ufungure");
});
test("bootstrap installation is idempotent", () => {
  const b = browser(); const handler = b.window.__inziraClientRecovery; b.execute(); assert.equal(b.window.__inziraClientRecovery, handler);
});
console.log(`${checks} client recovery checks passed.`);
