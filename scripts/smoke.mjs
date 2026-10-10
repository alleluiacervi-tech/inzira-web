// Smoke test: every screen loads, is styled, and shows what it should. No dependencies.
//
//   1. Start the app:   npm run dev      (or: npm run build && npm start)
//   2. In another tab:  npm run smoke    (or: npm run smoke -- http://localhost:3001)
//
// It fails if a page does not return 200, if expected text is missing, or if the page's own
// stylesheet cannot be fetched (which is what a stale .next folder looks like: pages render unstyled).
// The public site defaults to Kinyarwanda: the text checks ask for English with the language cookie,
// and LANGUAGES checks the default.

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const english = { headers: { cookie: "inzira_lang=en" } };

/** [path, ...text that must appear in the HTML] */
const ROUTES = [
  ["/", "Government paperwork, handled for you.", "Services and fees", "Rwanda Utilities Regulatory Authority", "Annual return filing"],
  ["/services", "Find the service you need", "Company registration", "Monthly business tax declarations"],
  ["/services?category=tax", "Trading licence declaration"],
  ["/services/company-registration", "Official government fee", "Our service / assistance fee", "Filed with the Rwanda Development Board"],
  ["/services/property-tax-declaration", "per UPI, per year", "Tax as assessed"],
  ["/services/irembo-training", "per month", "Training by Inzira"],
  ["/start", "A few details about you", "Free to ask"],
  ["/start/company-registration", "A few details about you", "Company registration"],
  ["/sign-in", "Sign in to your portal"],
  ["/track", "Track a request"],
];
/** Signed-in areas: without a session they must send people to sign in. */
const PRIVATE = [
  "/portal",
  "/portal/requests",
  "/portal/documents",
  "/agent",
  "/agent/intake",
  "/agent/cases/INZ-2026-04817",
  "/console/requests/INZ-2026-04817",
  "/console/clients/p-aline",
  "/admin",
  "/admin/services",
  "/admin/payments",
  "/admin/roles",
  "/admin/audit",
  "/admin/system",
  "/console/inbox",
  "/console/requests",
  "/console/clients",
  "/console/my-day",
  "/console/overview",
];
/** [what, cookie or null, the html lang, text that must appear on the home page] */
const LANGUAGES = [
  ["Kinyarwanda by default", null, "rw", "Inyandiko za leta, zigukorerwa bitakugoye."],
  ["English when chosen", "inzira_lang=en", "en", "Government paperwork, handled for you."],
];
const NOT_FOUND = ["/services/does-not-exist", "/services/criminal-record-certificate", "/start/does-not-exist"];

const failures = [];
const fail = (path, why) => { failures.push(`${path}: ${why}`); console.log(`  FAIL ${path} — ${why}`); };
// React puts <!-- --> between adjacent pieces of text; remove them so text can be matched as a reader sees it.
const text = (html) => html.replace(/<!-- -->/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

let cssChecked = false;
for (const [path, ...expect] of ROUTES) {
  let res;
  try { res = await fetch(base + path, english); } catch (e) { fail(path, `cannot connect to ${base} (${e.cause?.code ?? e.message})`); break; }
  if (res.status !== 200) { fail(path, `status ${res.status}`); continue; }
  const html = await res.text();
  const body = text(html);
  const missing = expect.filter((t) => !body.includes(t));
  if (missing.length) { fail(path, `missing text: ${missing.map((t) => `“${t}”`).join(", ")}`); continue; }
  if (!cssChecked) {
    const href = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1];
    if (!href) fail(path, "no stylesheet link in the page");
    else {
      const css = await fetch(new URL(href, base));
      const size = (await css.text()).length;
      if (css.status !== 200 || size < 1000) fail(path, `stylesheet ${href} returned ${css.status} (${size} bytes). Stop the server, delete .next and start it again.`);
    }
    cssChecked = true;
  }
  console.log(`  ok   ${path}`);
}
if (!failures.length) {
  for (const [what, cookie, lang, expect] of LANGUAGES) {
    const html = text(await (await fetch(base + "/", cookie ? { headers: { cookie } } : {})).text());
    if (!html.includes(`<html lang="${lang}"`) || !html.includes(expect)) fail("/", `${what}: expected lang="${lang}" and “${expect}”`);
    else console.log(`  ok   / (${what})`);
  }
  for (const path of PRIVATE) {
    const res = await fetch(base + path, { redirect: "manual" });
    const to = res.headers.get("location") ?? "";
    if (!(res.status >= 300 && res.status < 400 && to.includes("/sign-in"))) fail(path, `expected a redirect to sign-in, got ${res.status} ${to}`);
    else console.log(`  ok   ${path} (asks to sign in)`);
  }
  const health = await fetch(base + "/api/health");
  if (health.status !== 200) fail("/api/health", `expected 200, got ${health.status}`); else console.log("  ok   /api/health");
  const cron = await fetch(base + "/api/cron");
  if (cron.status !== 401) fail("/api/cron", `must refuse callers without the secret, got ${cron.status}`); else console.log("  ok   /api/cron (needs the secret)");
  const cb = await fetch(base + "/api/payments/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (cb.status !== 200) fail("/api/payments/callback", `expected 200, got ${cb.status}`); else console.log("  ok   /api/payments/callback (accepts and re-checks)");
  const headers = (await fetch(base + "/")).headers;
  if (headers.get("x-frame-options") !== "DENY" || headers.get("x-content-type-options") !== "nosniff") fail("/", "security headers missing"); else console.log("  ok   security headers");
  const file = await fetch(base + "/files/anything");
  if (file.status !== 401) fail("/files/anything", `files must need a session, got ${file.status}`);
  else console.log("  ok   /files/… (needs a session)");
  for (const path of NOT_FOUND) {
    const res = await fetch(base + path, english);
    // Signed-in areas stream a loading state first, so they answer 200 and then show "not found".
    const shown = text(await res.text()).includes("We couldn’t find that");
    if (res.status !== 404 && !shown) fail(path, `expected a not-found page, got ${res.status}`);
    else console.log(`  ok   ${path} (not found)`);
  }
}

console.log(failures.length ? `\n${failures.length} problem(s) on ${base}` : `\nAll ${ROUTES.length + LANGUAGES.length + PRIVATE.length + NOT_FOUND.length + 5} checks passed on ${base}`);
process.exit(failures.length ? 1 : 0);
