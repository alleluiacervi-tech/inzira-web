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
  ["/", "Government paperwork, with help at every step.", "Services and fees", "Rwanda Utilities Regulatory Authority", "Birth certificate", "RWF 2,500"],
  ["/services", "Find the service you need", "Company registration", "Monthly business tax declarations"],
  ["/services?category=tax", "Trading licence declaration"],
  ["/services/company-registration", "Start · 2 min", "Assistance fee", "Filed with the Rwanda Development Board", "RWF 10,000"],
  ["/services/property-tax-declaration", "per UPI, per year", "Tax as assessed"],
  ["/services/irembo-training", "per month", "Training by Inzira"],
  ["/start", "A few details about you", "Review fee RWF 1,000"],
  ["/start/company-registration", "A few details about you", "Company registration"],
  ["/sign-in", "Email or phone number"],
  ["/track", "Track a request"],
];
/** Signed-in areas: without a session they must send people to sign in. */
const PRIVATE = [
  "/portal",
  "/portal/requests",
  "/portal/documents",
  "/console/intake",
  "/console/requests/INZ-2026-04817",
  "/console/clients/p-aline",
  "/admin/services",
  "/admin/content",
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
/** Old addresses that moved into the staff console: [from, to]. */
const MOVED = [
  ["/agent", "/console/my-day"],
  ["/agent/intake", "/console/intake"],
  ["/agent/cases/INZ-2026-04817", "/console/requests/INZ-2026-04817"],
  ["/admin", "/console/overview"],
];
/** [what, cookie or null, the html lang, text that must appear on the home page] */
const LANGUAGES = [
  ["Kinyarwanda by default", null, "rw", "Inyandiko za leta, tugufasha kuri buri ntambwe."],
  ["English when chosen", "inzira_lang=en", "en", "Government paperwork, with help at every step."],
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
  for (const [from, to] of MOVED) {
    const res = await fetch(base + from, { redirect: "manual" });
    const at = new URL(res.headers.get("location") ?? "/", base).pathname;
    if (res.status !== 308 || at !== to) fail(from, `expected a permanent redirect to ${to}, got ${res.status} ${at}`);
    else console.log(`  ok   ${from} → ${to}`);
  }
  for (const path of PRIVATE) {
    const res = await fetch(base + path, { redirect: "manual" });
    const to = res.headers.get("location") ?? "";
    // Staff pages go to the staff sign-in (/staff), the portal to the customer's (/sign-in).
    const want = path.startsWith("/console") || path.startsWith("/admin") ? "/staff" : "/sign-in";
    if (!(res.status >= 300 && res.status < 400 && to.includes(want))) fail(path, `expected a redirect to ${want}, got ${res.status} ${to}`);
    else console.log(`  ok   ${path} (asks to sign in)`);
  }
  const health = await fetch(base + "/api/health");
  if (health.status !== 200) fail("/api/health", `expected 200, got ${health.status}`); else console.log("  ok   /api/health");
  const cron = await fetch(base + "/api/cron");
  if (cron.status !== 401) fail("/api/cron", `must refuse callers without the secret, got ${cron.status}`); else console.log("  ok   /api/cron (needs the secret)");
  const cb = await fetch(base + "/api/payments/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const cbBody = await cb.json().catch(() => null);
  if (cb.status !== 200 || cbBody?.success !== true || cbBody?.message !== "success") fail("/api/payments/callback", `expected the IntouchPay acknowledgement, got ${cb.status} ${JSON.stringify(cbBody)}`);
  else console.log("  ok   /api/payments/callback (accepts and re-checks)");
  const forged = await fetch(base + "/api/payments/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonpayload: { requesttransactionid: "no-such-prompt", transactionid: "999", responsecode: "01", status: "Successfull" } }) });
  const forgedBody = await forged.json().catch(() => null);
  if (forged.status !== 200 || forgedBody?.success !== true) fail("/api/payments/callback forged", `an unknown callback must not be treated as an error the provider should retry, got ${forged.status}`);
  else console.log("  ok   /api/payments/callback (unknown prompt is acknowledged, not paid)");
  // IntouchPay's own shape: a form field, no login (or a wrong one). It must still get 200 and its request id back.
  const form = await fetch(base + "/api/payments/callback", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: "Basic d3Jvbmc6d3Jvbmc=" },
    body: `jsonpayload=${encodeURIComponent(JSON.stringify({ requesttransactionid: "11223344", transactionid: "1", responsecode: "1000", status: "Pending" }))}` });
  const formBody = await form.json().catch(() => null);
  if (form.status !== 200 || formBody?.success !== true || formBody?.message !== "success" || formBody?.request_id !== "11223344") fail("/api/payments/callback form", `expected success with request_id 11223344, got ${form.status} ${JSON.stringify(formBody)}`);
  else console.log("  ok   /api/payments/callback (any login, any encoding: success with the request id)");
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

console.log(failures.length ? `\n${failures.length} problem(s) on ${base}` : `\nAll ${ROUTES.length + LANGUAGES.length + MOVED.length + PRIVATE.length + NOT_FOUND.length + 5} checks passed on ${base}`);
process.exit(failures.length ? 1 : 0);
