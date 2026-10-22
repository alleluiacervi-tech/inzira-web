// Flow test: drives the real screens in headless Chrome and checks the things people actually do —
// start a request, confirm a phone number, pay, upload, track, and the agent and admin actions.
// No npm dependencies. Needs Google Chrome installed and Node 22 or newer.
//
//   1. Start the app:   npm run build && npm start     (or npm run dev)
//   2. In another tab:  npm run flows                  (or: npm run flows -- http://localhost:3001)
//
// Chrome is found automatically on macOS; elsewhere set CHROME_PATH to the browser binary.
// The checks are written against the seed data in lib/mock and change it as they go, so run them on
// a fresh development database: `npm run db:reset`, start the app with INZIRA_DEMO=1 (codes are shown
// on screen and payments are simulated), then run this.
//
// The public site defaults to Kinyarwanda; these checks read the English copy, so every tab sets the
// language cookie to English first. `npm run smoke` checks the Kinyarwanda default.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const port = 9339;
const chromePath = process.env.CHROME_PATH ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
if (!chromePath) { console.error("Chrome not found. Set CHROME_PATH to the browser binary."); process.exit(2); }
if (typeof WebSocket === "undefined") { console.error("This script needs Node 22 or newer."); process.exit(2); }

const work = mkdtempSync(join(tmpdir(), "inzira-flows-"));
const png = join(work, "id_photo.png");
writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
// Containers and CI runners usually can't give Chrome its sandbox or a large /dev/shm; this browser only opens the local app.
const sandbox = process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [];
const stderr = [];
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", ...sandbox, `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, "profile")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
chrome.stderr.on("data", (buf) => { stderr.push(String(buf)); if (stderr.join("").length > 4000) stderr.shift(); });
let chromeExit = null;
chrome.on("exit", (code) => { chromeExit = code; });
const stop = (code) => { chrome.kill(); try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp folder is cleaned by the OS */ } process.exit(code); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* not up yet */ }
  // A cold GitHub runner can take more than 10 seconds to open the debug port. 30 seconds, then the reason.
  if (chromeExit !== null || i > 120) {
    const tail = stderr.join("").trim().split("\n").slice(-12).join("\n");
    console.error(`Chrome did not start (${chromeExit === null ? "debug port never opened" : `exited ${chromeExit}`}).${tail ? "\n" + tail : ""}`);
    stop(2);
  }
  await sleep(250);
}
try { if (!(await fetch(base)).ok) throw new Error(); } catch { console.error(`Nothing is answering at ${base}. Start the app first.`); stop(2); }

let pass = 0; const fails = [];
const check = (name, ok, extra = "") => { if (ok) { pass++; console.log("  ok   " + name); } else { fails.push(name); console.log("  FAIL " + name + (extra ? " — " + extra : "")); } };

async function page(width = 1280) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(15000) })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("could not open a browser tab")), 15000); });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  // Every browser command gives up after 20 s, so a stall shows up as a failed check instead of a hang.
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => { pending.delete(i); rej(new Error(`browser did not answer ${method}${params.expression ? `: ${String(params.expression).slice(0, 80)}` : ""}`)); }, 20000);
    pending.set(i, (v) => { clearTimeout(t); res(v); });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send("Page.enable"); await send("DOM.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCookie", { name: "inzira_lang", value: "en", url: base });
  // A tab Chrome treats as in the background gets its timers and rendering throttled.
  await send("Page.bringToFront"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 800 });
  // React attaches its props to an element when it hydrates it. Until then a click or a typed value is
  // lost, so every interaction waits (up to 10 s) for its element to be live.
  const HELP = `window.__t = {
    live(el) { return Object.keys(el).some((k) => k.startsWith("__reactProps")); },
    async hydrated(el) { for (let i = 0; i < 80 && el && !this.live(el); i++) await new Promise((r) => setTimeout(r, 125)); return el; },
    async set(sel, v) { const el = await this.hydrated(document.querySelector(sel)); if (!el) throw new Error("no element " + sel); const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; },
    async click(text, tag) { const el = [...document.querySelectorAll(tag || "button, a, label")].find((e) => (e.getAttribute("aria-label") || e.textContent).trim().startsWith(text) && e.getClientRects().length); if (!el) throw new Error("nothing to click: " + text); await this.hydrated(el); el.focus(); el.click(); return true; },
    has(text) { return document.body.innerText.includes(text); },
    key(k) { document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); return true; },
  }; true`;
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed: " + expression);
    return r.result?.result?.value;
  };
  return {
    send, ev,
    async go(path) { await send("Page.navigate", { url: base + path }); await sleep(1500); await ev(HELP); },
    set: (sel, v) => ev(`__t.set(${JSON.stringify(sel)}, ${JSON.stringify(v)})`),
    click: (text, tag) => ev(`__t.click(${JSON.stringify(text)}, ${JSON.stringify(tag ?? "")})`),
    has: (text) => ev(`__t.has(${JSON.stringify(text)})`),
    key: (k) => ev(`__t.key(${JSON.stringify(k)})`),
    help: () => ev(HELP),
    async close() { await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); ws.close(); },
  };
}
/** Signs in with an email (customers) or a phone number (staff), reading the demo code shown on screen. A customer's portal is in
 *  the language of their account (Kinyarwanda for the demo customers); the checks read English, so
 *  it is switched unless `language` says otherwise. */
async function signIn(p, who, { language = "en" } = {}) {
  const byEmail = who.includes("@");
  const url = byEmail ? "/sign-in" : "/sign-in?method=phone";
  // A signed-out visit already put the page they wanted in ?next=. Keep it.
  const search = await p.ev("location.search").catch(() => "");
  const path = await p.ev("location.pathname").catch(() => "");
  if (!(path === "/sign-in" && String(search).includes("next="))) await p.go(url);
  if ((await p.ev("location.pathname")) !== "/sign-in") { await signOut(p); await p.go(url); }
  await p.set(byEmail ? "#si-email" : "#si-phone", who); await p.click("Send me a code"); await waitCode(p);
  const code = await p.ev(`document.querySelector("[data-demo-code]")?.dataset.demoCode ?? ""`);
  if (!code) throw new Error("no demo code shown (start the app with INZIRA_DEMO=1)");
  await p.set("#otp", code); await p.click("Sign in", "button"); await waitPath(p, (path) => path !== "/sign-in"); await sleep(500); await p.help();
  if (language && (await p.ev("location.pathname")).startsWith("/portal")) await portalLanguage(p, language);
}
/** Switches the portal language with the switch in its sidebar (also there, inside the drawer, on a
 *  phone). It is a form post that reloads the page. */
async function portalLanguage(p, language) {
  if ((await p.ev("document.documentElement.lang")) === language) return;
  await p.ev(`(() => {
    const button = [...document.querySelectorAll('form[action="/api/locale"] button')].find((b) => b.value === ${JSON.stringify(language)});
    if (!button) throw new Error("no language switch");
    button.click(); return true;
  })()`);
  for (let i = 0; i < 40 && (await p.ev("document.readyState === 'complete' ? document.documentElement.lang : ''").catch(() => "")) !== language; i++) await sleep(250);
  await sleep(500); await p.help();
}
async function signOut(p) {
  if (await p.ev(`!!document.querySelector('button[aria-label="Staff profile menu"]')`)) {
    await p.click("Staff profile menu", "button");
    for (let i = 0; i < 20 && !(await p.ev(`[...document.querySelectorAll("button")].some((b) => (b.getAttribute("aria-label") || b.textContent).trim().startsWith("Sign out"))`)); i++) await sleep(100);
  }
  await p.click("Sign out", "button");
  await waitPath(p, (path) => path === "/sign-in");
}
/** Waits for the demo sign-in code to appear, up to 10 seconds. */
async function waitCode(p) {
  for (let i = 0; i < 40 && !(await p.ev(`!!document.querySelector("[data-demo-code]")`)); i++) await sleep(250);
}
/** Waits until the address matches, up to 10 seconds. */
async function waitPath(p, ok, tries = 40) {
  for (let i = 0; i < tries && !ok(await p.ev("location.pathname")); i++) await sleep(250);
}
/** Waits until the page shows `text` (after a save and refresh), up to 10 seconds, or longer when `tries` says so. */
async function waitFor(p, text, tries = 40) {
  for (let i = 0; i < tries && !(await p.has(text)); i++) await sleep(250);
}
/** Clicks the button starting with `label` inside the smallest panel that mentions `text` (one row of a list). */
async function clickIn(p, text, label) {
  return p.ev(`(async () => {
    const panels = [...document.querySelectorAll(".console-panel")].filter((el) => el.innerText.includes(${JSON.stringify(text)}));
    const row = panels.sort((a, b) => a.innerText.length - b.innerText.length)[0];
    const button = row && [...row.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}));
    if (!button) throw new Error("nothing to click: " + ${JSON.stringify(label)} + " in " + ${JSON.stringify(text)});
    await __t.hydrated(button); button.click(); return true;
  })()`);
}
/** Chooses the test image in the file input matching `selector`. */
async function attach(p, selector) {
  await p.ev(`__t.hydrated(document.querySelector(${JSON.stringify(selector)})).then(() => true)`);
  const node = await p.send("DOM.querySelector", { nodeId: (await p.send("DOM.getDocument")).result.root.nodeId, selector });
  if (!node.result?.nodeId) throw new Error("no file input " + selector);
  await p.send("DOM.setFileInputFiles", { nodeId: node.result.nodeId, files: [png] });
}
/** The label of the stage the case is in, on a console request page. */
const currentStage = (p) => p.ev(`document.querySelector(".c-step-btn[aria-current=step] .c-step-label")?.textContent ?? ""`);
/** Waits until `expression` is true in the page, up to 10 seconds. A toast says the server saved it;
 *  this waits for the page to show the result. */
async function waitUntil(p, expression) {
  for (let i = 0; i < 40 && !(await p.ev(expression)); i++) await sleep(250);
  return p.ev(expression);
}
/** Waits until the page no longer shows `text`, up to 10 seconds. */
async function waitGone(p, text) {
  for (let i = 0; i < 40 && (await p.has(text)); i++) await sleep(250);
}
// FLOWS_ONLY=customer,delivered runs just those steps (for debugging; they may rely on earlier ones).
const only = process.env.FLOWS_ONLY?.split(",").map((x) => x.trim()).filter(Boolean);
const seen = new Set();
const step = async (name, fn) => { seen.add(name); if (only?.length && !only.includes(name)) return; console.log(`# ${name}`); try { await fn(); } catch (e) { check(name, false, e.message.split("\n")[0]); } };

// ---------- public ----------
await step("track", async () => {
  const p = await page();
  await p.go("/track");
  await p.set("#tr-ref", "inz-2026-04817"); await p.set("#tr-contact", "0788 123 456"); await p.click("Check progress"); await waitFor(p, "We need a clearer ID photo");
  check("track: finds a request by reference + phone", await p.has("E-title") && await p.has("We need a clearer ID photo"));
  check("track: shows no personal data", !(await p.has("Aline")) && !(await p.has("id_front")));
  await p.set("#tr-contact", "788 000 111"); await p.click("Check progress"); await waitFor(p, "couldn’t find a request");
  check("track: wrong phone is refused with the same message as not found", await p.has("couldn’t find a request") && !(await p.has("E-title")));
  await p.set("#tr-contact", "Aline.Uwase@Example.com"); await p.click("Check progress"); await waitFor(p, "We need a clearer ID photo");
  check("track: also finds a request by reference + email, in any letter case", await p.has("E-title") && await p.has("We need a clearer ID photo"));
  await p.set("#tr-contact", "someone.else@example.com"); await p.click("Check progress"); await waitFor(p, "couldn’t find a request");
  check("track: a wrong email is refused with the same message", await p.has("couldn’t find a request") && !(await p.has("E-title")));
  await p.close();
});

await step("private areas", async () => {
  const p = await page();
  await p.go("/portal");
  check("private: the portal asks you to sign in", (await p.ev("location.pathname")) === "/sign-in");
  await p.go("/admin");
  check("private: the admin console asks you to sign in", (await p.ev("location.pathname")) === "/sign-in");
  await p.go("/sign-in");
  check("sign-in: customers see the email form first", await p.ev(`!!document.querySelector("#si-email") && !document.querySelector("#si-phone")`));
  await p.set("#si-email", "not an email"); await p.click("Send me a code"); await sleep(300);
  check("sign-in: a bad email is refused before anything is sent", await p.has("Enter a valid email address"));
  await p.set("#si-email", "nobody@example.com"); await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Sign in", "button"); await sleep(1500);
  check("sign-in: an unknown email is told to start a service", await p.has("We don’t have an account for this email"));
  await p.set("#otp", "000000"); await p.click("Sign in", "button"); await sleep(1000);
  check("sign-in: a used or wrong code is refused", await p.has("expired") || await p.has("not right"));
  await p.go("/sign-in?method=phone"); await p.set("#si-phone", "788 123 456"); await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Sign in", "button"); await sleep(1500);
  check("sign-in: a customer with an email cannot sign in by phone", await p.has("Customers sign in with their email address"));
  await p.go("/portal/requests");
  check("sign-in: staff pages open the phone form", await (async () => { await p.go("/console"); return p.ev(`!!document.querySelector("#si-phone")`); })());
  await p.go("/sign-in");
  await p.click("Admin dashboard");
  check("sign-in: the admin demo email is filled in", (await p.ev(`document.querySelector("#si-email")?.value`)) === "admin@inzira.test");
  await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`));
  await p.click("Sign in", "button");
  await waitPath(p, (path) => path.startsWith("/console"));
  check("sign-in: the admin email opens the dashboard", (await p.ev("location.pathname")).startsWith("/console"));
  await p.close();
});

// ---------- a new customer sends a request ----------
// A request the start step leaves unpaid at checkout: staff must not see it as work, and privacy cancels it later.
let unpaidRef = "";
await step("start", async () => {
  const p = await page();
  await p.go("/start/land-spouse-update");
  check("start: a service that needs an ID asks for the National ID Number, and no date of birth", await p.has("National ID Number") && await p.has("This service needs it") && (await p.ev(`document.querySelector("#f-dob") === null`)));
  check("start: WhatsApp is offered first for the document, email beside it", await p.has("Where should we send your document?") && (await p.ev(`document.querySelector("[data-via=whatsapp]")?.classList.contains("on")`)) && (await p.ev(`document.querySelector("#f-email") === null`)));
  await p.click("Continue");
  check("start: empty step 1 is blocked with plain errors", await p.has("Enter your full name") && await p.has("ID numbers have 16 digits") && await p.has("Enter the Rwandan number you use on WhatsApp") && !(await p.has("Enter the date of birth")));
  await p.ev(`document.querySelector("[data-via=email] input").click()`); await sleep(100);
  await p.click("Continue"); await sleep(200);
  check("start: choosing email asks for the address instead", await p.has("Enter a valid email address") && !(await p.has("Enter the Rwandan number you use on WhatsApp")));
  await p.set("#f-name", "Test Person"); await p.set("#f-nid", "12345"); await p.set("#f-email", "Test.Person@Example.com");
  await p.click("Continue"); await sleep(200);
  check("start: an incomplete ID number is rejected", await p.has("ID numbers have 16 digits"));
  await p.set("#f-nid", "12345678901234567890"); await p.click("Continue"); await sleep(200);
  check("start: an ID longer than 16 digits is rejected", await p.has("Enter exactly 16 digits"));
  await p.set("#f-nid", "999"); await p.click("Clear", "button");
  check("start: the ID field can be cleared", (await p.ev(`document.querySelector("#f-nid").value`)) === "");
  await p.set("#f-nid", "1 1995 8 0045123 0 17"); await p.set("#f-phone", "788 555 010");
  await p.click("Add a spouse after marriage", "label"); await p.set("#f-notes", "We married in August.");
  await p.click("Continue"); await sleep(300);
  check("start: the saved draft has no ID number", !(await p.ev(`(sessionStorage.getItem("inzira:start:land-spouse-update") || "").includes("0045123")`)));
  await p.go("/start/land-spouse-update"); await sleep(400);
  check("start: a refresh keeps the draft and the step", await p.has("Check, then pay"));
  await p.click("Back"); await sleep(200);
  await p.set("#f-nid", "1 1995 8 0045123 0 17");
  await p.click("Continue"); await sleep(300);
  check("start: a fixed price shows paying as the last step, with the total", (await p.ev(`!!document.querySelector('[aria-label^="Step 2 of 3"]')`)) && await p.has("3. Pay")
    && (await p.ev(`document.querySelector("[data-checkout-total]")?.innerText ?? ""`)).includes("RWF 5,000") && await p.has("Paying sends your request to our team") && !(await p.has("you pay it directly to the institution")));
  check("start: the documents are a checklist, and missing ones can follow after paying", (await p.ev(`document.querySelectorAll("[data-doc-list] li").length`)) === 5 && await p.has("Needed") && await p.has("Pay anyway and send it later"));
  await attach(p, "input[type=file]"); await sleep(300);
  check("start: a chosen file is listed", await p.has("id_photo.png"));
  check("start: review lists what was entered", await p.has("Check, then pay") && await p.has("Test Person") && await p.has("test.person@example.com") && await p.has("Add a spouse after marriage") && await p.has("does not look it up"));
  await p.click("Continue to payment"); await sleep(200);
  check("start: cannot send without the acknowledgement", await p.has("Please confirm you’ve read this"));
  await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click()`); await p.click("Continue to payment"); await sleep(1200);
  check("start: emails a code to confirm the address", await p.has("Enter the code we sent you") && await p.has("test.person@example.com") && await p.has("then pay"));
  await p.set("#otp", "111111"); await p.click("Confirm and go to payment"); await sleep(1000);
  check("start: a wrong code is refused", await p.has("not right"));
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and go to payment");
  await waitPath(p, (path) => path.endsWith("/pay"), 120); await waitFor(p, "Pay to send your request", 60);
  if (!(await p.has("Pay to send your request"))) console.log("    page says:", (await p.ev(`document.body?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  const ref = (await p.ev("location.pathname")).split("/")[3] ?? "";
  unpaidRef = ref;
  check("start: a fixed price goes straight to payment, which sends the request", /^INZ-\d{4}-\d{5}$/.test(ref) && await p.has("Pay to send your request") && await p.has("Order summary") && await p.has("RWF 5,000")
    && (await p.ev(`!!document.querySelector('[aria-label="Step 3 of 3: Pay"]')`)), `${ref} ${(await p.ev(`document.body?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " ")}`);
  check("start: the draft is cleared after sending", (await p.ev(`sessionStorage.getItem("inzira:start:land-spouse-update")`)) === null);
  await p.set("#mm", "722 123 456"); await sleep(100);
  check("pay: MTN and Airtel are offered as cards, and the number's network is picked as it is typed", (await p.ev(`document.querySelectorAll(".pay-netcard").length`)) === 2
    && (await p.ev(`document.querySelector(".pay-netcard.on")?.dataset.net ?? ""`)) === "airtel" && await p.has("Your Airtel Money number"));
  await p.go(`/portal/requests/${ref}`); await waitFor(p, "We married in August.");
  check("start: the new customer is signed in and sees the request", await p.has("Add or remove a spouse in the land register") && await p.has("We married in August.") && await p.has("id_photo.png"));
  check("start: an unpaid checkout asks the customer to pay to send it", await p.has("Pay to send your request") && await p.has("Go to payment"));
  check("start: a submitted ID is pending review and is not called verified", await p.has("Pending verification") && await p.has("does not verify") && !(await p.has("officially verified")));
  // This one is left unpaid: staff see it under Awaiting payment, not in the inbox (the console step).
  await p.go("/start/irembo-training");
  check("training: no national ID is asked for, and a quoted service ends on its review fee", (await p.ev(`document.querySelector("#f-nid") === null && !!document.querySelector('[aria-label^="Step 1 of 3"]')`)) && await p.has("review fee when you send this request"));
  await p.go("/start/ebm-installation");
  check("ebm: an unconfirmed ID rule is not mandatory", await p.has("not confirmed") && (await p.ev(`!!document.querySelector("#f-nid")`)) === true);
  // The phone number is the one the first customer just used: another email must still be able to send a request.
  await p.ev(`document.querySelector("[data-via=email] input").click()`); await p.set("#f-name", "Ebm Person"); await p.set("#f-email", "ebm.person@example.com"); await p.set("#f-phone", "788 555 010");
  await p.click("Continue"); await sleep(300);
  check("ebm: the service's own question is required", await p.has("Please answer this") && await p.has("The 9-digit taxpayer number"));
  await p.set("#q-tin", "102345678"); await p.click("Continue"); await sleep(300);
  check("ebm: a service that does not require an ID continues without one", await p.has("Check, then pay") && !(await p.has("ID numbers have 16 digits")));
  check("review fee: a quoted service asks for the review fee, taken off our fee", (await p.ev(`document.querySelector("[data-review-fee]")?.innerText ?? ""`)).includes("RWF 1,000") && await p.has("Taken off our fee when you pay the quote") && await p.has("Refunded if we can’t take on your request"));
  await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click()`); await p.click("Continue to payment"); await sleep(1200);
  await waitFor(p, "Enter the code we sent you");
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and go to payment");
  await waitPath(p, (path) => path.endsWith("/pay"), 120); await waitFor(p, "Pay the review fee to send your request", 60);
  check("start: a phone number that belongs to another account does not block a new email", await p.has("Pay the review fee to send your request") && await p.has("We didn’t save the phone number") && !(await p.has("already belongs to another account")),
    (await p.ev(`document.body?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  check("review fee: the payment screen charges only the review fee", (await p.ev(`document.querySelector("[data-pay]")?.textContent ?? ""`)).includes("Pay RWF 1,000") && await p.has("Review fee"));
  check("pay: at checkout there is no second tick to approve the amounts", (await p.ev(`document.querySelector("#pay-agree") === null`)));
  await p.set("#mm", "788 123 456"); await p.click("Pay RWF 1,000", "button");
  await waitFor(p, "Your request is with our team", 100);
  check("review fee: paying it sends the request and says the fees come next", await p.has("sends the exact fees") && await p.has("taken off our fee") && await p.has("minus what you paid today"),
    (await p.ev(`document.body?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  await p.click("Follow your request"); await waitFor(p, "You paid a RWF 1,000 review fee");
  check("review fee: the request shows it paid and waits for the quote", await p.has("You paid a RWF 1,000 review fee") && await p.has("Fee to be confirmed") && !(await p.has("Pay the review fee")));
  // A fixed price paid on the spot: the customer pays straight after sending, and the request is paid when an agent first sees it.
  await p.go("/start/ebm-training"); await waitFor(p, "Continue");
  await p.ev(`document.querySelector("[data-via=email] input").click()`); await p.set("#f-name", "Pay First"); await p.set("#f-email", "pay.first@example.com");
  await p.click("Continue"); await sleep(300);
  check("pay first: the review shows the total and that paying sends it", (await p.ev(`document.querySelector("[data-checkout-total]")?.innerText ?? ""`)).includes("RWF 20,000") && !(await p.has("you pay it directly to the institution")), (await p.ev(`document.querySelector("main")?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click()`); await p.click("Continue to payment"); await sleep(1200);
  await waitFor(p, "Enter the code we sent you");
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and go to payment");
  await waitPath(p, (path) => path.endsWith("/pay"), 120); await waitFor(p, "Pay to send your request", 60);
  check("pay first: the checkout asks for the fixed price", await p.has("Pay to send your request") && (await p.ev(`document.querySelector("[data-pay]")?.textContent ?? ""`)).includes("Pay RWF 20,000"));
  await p.set("#mm", "788 123 456"); await p.click("Pay RWF 20,000", "button");
  await waitFor(p, "Your request is with our team", 100);
  check("pay first: paying sends the request and says what happens next", await p.has("Your request is with our team") && await p.has("RWF 20,000") && await p.has("What happens next") && await p.has("MTN MoMo"),
    (await p.ev(`document.body?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  await p.click("Follow your request"); await waitFor(p, "Paid RWF 20,000");
  check("pay first: the request reads Paid and received", await p.has("Paid RWF 20,000") && await p.has("We’ve received your request") && !(await p.has("Pay to send your request")) && !(await p.has("Review and pay")));
  await p.close();
});

await step("identity", async () => {
  const p = await page();
  await signIn(p, "780000008");
  await p.go("/console/identity"); await waitFor(p, "National ID review");
  const queue = await p.ev(`document.querySelector("main")?.innerText ?? ""`);
  check("identity: pending reviews are listed with a masked ID", queue.includes("Pending verification") && queue.includes("••••") && !queue.includes("0034129") && !queue.includes("0045123"));
  await p.go("/console/requests/INZ-2026-04779");
  await waitPath(p, (path) => path === "/console/requests/INZ-2026-04779");
  // The queue page already says "National ID review", and this screen is slow to compile, so wait for the note field itself.
  let noteReady = false;
  for (let i = 0; i < 80 && !noteReady; i++) { noteReady = await p.ev(`!!document.querySelector("#id-review-note")`).catch(() => false); if (!noteReady) await sleep(250); }
  await p.help();
  check("identity: opening a request does not verify it", noteReady && await p.has("Pending verification") && await p.has("opening this page does not verify"));
  await p.set("#id-review-note", "The marriage certificate name does not match the ID photo.");
  await p.click("Requires correction");
  let reviewed = false;
  for (let i = 0; i < 20 && !reviewed; i++) { reviewed = await p.has("The client was asked to correct the ID details"); if (!reviewed) await sleep(300); }
  check("identity: an authorised reviewer can record a correction", reviewed);
  await signOut(p);
  await signIn(p, "780000007");
  await p.go("/console/identity"); await sleep(800);
  check("identity: finance cannot open the ID review queue", await p.has("Your role") && await p.has("ID review"));
  await p.go("/console/requests/INZ-2026-04779"); await waitFor(p, "INZ-2026-04779");
  const detail = await p.ev(`document.querySelector("main")?.innerText ?? ""`);
  check("identity: finance does not get the review controls or the full number", !detail.includes("Review note") && !detail.includes("Unable to verify") && !detail.includes("0034129"));
  await signOut(p);
  await signIn(p, "chantal.mukeshimana@example.com");
  await p.go("/portal/requests/INZ-2026-04779"); await waitFor(p, "Requires correction");
  check("identity: the client sees the correction on the same reference", await p.has("Requires correction") && await p.has("INZ-2026-04779") && !(await p.has("0034129")));
  await p.set("#id-correct-nid", "1 1990 7 0034129 0 63"); await p.set("#id-correct-dob", "1990-07-04");
  await p.ev(`document.querySelector("#id-correct-consent").click()`);
  await p.set("#id-correct-nid", "1 1990 7 0034129 0 63"); await p.set("#id-correct-dob", "1990-07-04");
  await p.click("Send the correction");
  let corrected = "";
  for (let i = 0; i < 25; i++) {
    // The portal frame is a div.main, not a <main> landmark, so the confirmation lives on the body.
    corrected = await p.ev(`document.body?.innerText ?? ""`);
    if (corrected.includes("waiting for review") || (corrected.includes("Pending verification") && !corrected.includes("Send the correction"))) break;
    await sleep(400);
  }
  check("identity: the correction keeps the same reference and does not verify the ID", corrected.includes("INZ-2026-04779") && (corrected.includes("waiting for review") || corrected.includes("Pending verification")) && !corrected.includes("officially verified") && !corrected.includes("0034129"), corrected.replace(/\s+/g, " ").slice(0, 360));
  await p.close();
});

// ---------- Aline: pay, message, upload ----------
await step("customer", async () => {
  const p = await page();
  await signIn(p, "aline.uwase@example.com", { language: null });
  // Aline's account is in Kinyarwanda: the portal, the seeded hold and its title follow it.
  check("customer: lands on the portal in their language", (await p.ev("location.pathname")) === "/portal" && (await p.ev("document.documentElement.lang")) === "rw"
    && await p.has("Kora icyo usabwa nonaha") && await p.has("Dukeneye ifoto y'indangamuntu igaragara neza") && !(await p.has("We need a clearer ID photo")));
  await portalLanguage(p, "en");
  check("customer: switching to English changes the portal", await p.has("We need a clearer ID photo") && await p.has("Resolve now"),
    `lang ${await p.ev("document.documentElement.lang")} at ${await p.ev("location.pathname")}: ${(await p.ev(`document.body.innerText`)).replace(/\s+/g, " ").slice(0, 300)}`);
  await p.go("/portal/account"); await waitFor(p, "Your details");
  check("customer: the choice is saved on their account", (await p.ev(`document.querySelector('input[name=locale][value=en]')?.checked`)) === true);
  await p.go("/portal/requests/INZ-2026-04761");
  check("pay: unpaid request offers review and pay", await p.has("Awaiting payment") && await p.has("Review and pay RWF 20,000"));
  await p.click("Review and pay");
  // The first visit to the payment page is a fresh server render. Give it longer than a click, then open the link itself if the transition has not landed.
  await waitPath(p, (path) => path.endsWith("/pay"), 80);
  if (!(await p.ev("location.pathname")).endsWith("/pay")) {
    const href = await p.ev(`[...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).find((h) => h && h.endsWith("/pay")) ?? ""`);
    if (!href) throw new Error("no payment link");
    await p.go(href);
  }
  await waitFor(p, "Approve and pay", 40);
  check("pay: the payment screen shows the amount on its own page", (await p.ev("location.pathname")).endsWith("/pay") && await p.has("Approve and pay") && await p.has("20,000") && await p.has("Nothing is taken until you approve it"),
    `${await p.ev("location.pathname")} ${(await p.ev("document.body.innerText")).replace(/\s+/g, " ").slice(0, 220)}`);
  await p.click("Pay RWF 20,000", "button"); await sleep(200);
  check("pay: cannot pay without approving the amounts", await p.has("Tick the box to approve"));
  await p.ev(`document.querySelector("#pay-agree").click()`);
  await p.set("#mm", "788 120 000"); await p.click("Pay RWF 20,000", "button"); await sleep(600);
  check("pay: shows a waiting state", await p.has("Check your phone"));
  await sleep(4500);
  check("pay: a declined prompt says nothing was charged", await p.has("didn’t go through") && await p.has("Nothing was charged"));
  // A number ending 1111 is approved by the simulator after twelve seconds: leave the page while it waits and come back.
  await p.click("Try again"); await sleep(200); await p.set("#mm", "788 121 111"); await p.click("Pay RWF 20,000", "button"); await sleep(1000);
  await p.go(await p.ev("location.pathname")); await waitFor(p, "Check your phone", 20);
  check("pay: coming back to the page shows the prompt still waiting, not a new one", await p.has("Check your phone") && await p.has("788 121 111") && !(await p.ev(`!!document.querySelector("[data-pay]")`)),
    (await p.ev("document.body.innerText")).replace(/\s+/g, " ").slice(0, 220));
  await waitFor(p, "Payment received", 100);
  check("pay: success shows a receipt", await p.has("Payment received") && await p.has("INZ-R-22107"));
  await p.click("Done"); await waitFor(p, "Paid RWF 20,000");
  check("pay: the request now reads Paid, from the database", await p.has("Paid RWF 20,000") && !(await p.has("Review and pay")));
  await p.go("/portal/requests/INZ-2026-04817");
  await p.set("#rm", "I will send a new photo this afternoon."); await p.click("Send message"); await waitFor(p, "I will send a new photo this afternoon.");
  check("messages: a sent message stays after reload", await p.has("I will send a new photo this afternoon."));
  await p.go("/portal/documents");
  check("documents: opens on the rejected document", (await p.ev(`document.querySelector(".sticky-aside .eb").textContent`)) === "Replace document");
  await attach(p, "#up");
  // The confirmation shows first; the list says "awaiting review" once it has refreshed.
  await waitFor(p, "was sent to your agent for review"); await waitFor(p, "awaiting review");
  check("documents: the upload is saved and awaits review", await p.has("was sent to your agent for review") && await p.has("awaiting review"),
    (await p.ev(`document.querySelector(".sticky-aside")?.innerText ?? "no panel"`)).replace(/\s+/g, " ").slice(0, 300));
  const link = await p.ev(`[...document.querySelectorAll('a[href^="/files/"]')].map((a) => a.getAttribute("href"))[0] ?? ""`);
  const status = link ? await p.ev(`fetch(${JSON.stringify(link)}).then((r) => r.status)`) : 0;
  check("documents: the owner can open their file", status === 200, `${link} ${status}`);
  await signOut(p);
  await p.go("/portal/account");
  check("deep link: the portal page is kept on the sign-in page", (await p.ev("location.pathname")) === "/sign-in" && (await p.ev("decodeURIComponent(location.search)")).includes("/portal/account"));
  await signIn(p, "aline.uwase@example.com", { language: null });
  check("deep link: signing in returns the customer to that page", (await p.ev("location.pathname")) === "/portal/account");
  await p.close();
});

// ---------- Eric (agent) ----------
await step("agent", async () => {
  const p = await page();
  await signIn(p, "780000001");
  check("agent: agents land on My day in the console", (await p.ev("location.pathname")) === "/console/my-day" && await p.has("Good"));
  check("agent: My Day shows agent work queues", await p.has("Follow-ups due") && await p.has("Past or near target") && await p.has("My open cases ("));
  await signOut(p);
  await p.go("/console/requests/INZ-2026-04790");
  check("deep link: the case is kept on the sign-in page", (await p.ev("location.pathname")) === "/sign-in" && (await p.ev("decodeURIComponent(location.search)")).includes("/console/requests/INZ-2026-04790"));
  await signIn(p, "780000001");
  check("deep link: signing in returns the agent to that case", (await p.ev("location.pathname")) === "/console/requests/INZ-2026-04790");
  await p.go("/console/requests/INZ-2026-04817");
  check("agent: another agent's case is hidden", await p.has("We couldn’t find that"));
  await p.go("/console/requests/INZ-2026-04790");
  await p.click("Messages (", "button"); await sleep(200);
  check("agent: sees the customer's message", await p.has("Here is our product list"));
  await p.click("Documents (", "button"); await sleep(200);
  await clickIn(p, "price_list_sept.pdf", "Reject"); await sleep(200);
  await p.set(".console-dialog textarea", "The prices are cut off on page 2. Please send the full list."); await p.click("Send rejection", "button"); await waitFor(p, "Waiting on customer");
  check("agent: the case says what it is waiting for", await p.ev(`document.querySelector(".c-notice")?.innerText.includes("The prices are cut off on page 2") ?? false`));
  await p.click("Messages (", "button"); await sleep(200);
  check("agent: rejecting a document puts the case on hold and tells the customer why", await p.has("Waiting on customer") && await p.has("The prices are cut off on page 2"));
  await p.click("Clear hold", "button"); await waitGone(p, "Waiting on customer");
  check("agent: clearing the hold", !(await p.has("Waiting on customer")));
  await p.set("#rq-msg", "Could you confirm the VAT rate for bottled water?"); await p.click("Send & wait on customer", "button"); await waitFor(p, "Waiting on customer");
  check("agent: send-and-wait puts the case on hold with the question", await p.has("Waiting on customer") && await p.has("Could you confirm the VAT rate"));
  await p.click("Overview", "button"); await sleep(200);
  await p.set("#rq-oref", "EBM-2026-5512"); await p.set("#rq-bill", "880 0123 4567"); await p.click("Save submission reference", "button"); await waitGone(p, "Waiting on customer");
  check("agent: saving the official reference moves the case to the institution and clears the hold", !(await p.has("Waiting on customer")) && (await currentStage(p)) === "With the institution", await currentStage(p));
  await p.go(await p.ev("location.pathname")); await waitFor(p, "Official submission");
  check("agent: the bill number is saved with the submission", (await p.ev(`document.querySelector("#rq-bill")?.value ?? ""`)) === "88001234567");
  await p.click("Payments & Fees", "button"); await sleep(200);
  await p.set("#rq-ours", "15000"); await sleep(200);
  check("agent: an agent can't change our fee", await p.has("Only a supervisor or administrator can change our fee") && (await p.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Save fee adjustments")?.disabled`)) === true);
  await p.go("/console/requests/INZ-2026-04761");
  await p.click("Documents (", "button"); await sleep(200);
  await attach(p, 'input[aria-label="Add TIN certificate for the customer"]');
  check("agent: a copy received on WhatsApp is filed against its checklist item", await waitUntil(p, `[...document.querySelectorAll(".console-panel")].some((el) => el.innerText.startsWith("TIN certificate") && el.innerText.includes("Received") && el.innerText.includes("id_photo.png"))`));
  await p.go("/console/intake"); await p.click("Open case"); await sleep(200);
  check("intake: needs a name and number", await p.has("Enter the customer’s name"));
  await p.set("#in-name", "Walk-in Customer"); await p.set("#in-phone", "788 321 654"); await p.click("Open case"); await waitFor(p, "opened");
  check("intake: opens a real case", await p.has("opened") && /INZ-\d{4}-\d{5}/.test(await p.ev("document.body.innerText")));
  await p.click("Open the case"); await waitPath(p, (path) => path.startsWith("/console/requests/INZ-")); await waitFor(p, "Walk-in Customer");
  check("intake: the new case opens in the console", (await p.ev("location.pathname")).startsWith("/console/requests/INZ-") && await p.has("Walk-in Customer"));
  await p.close();
});

// ---------- No payment, no work: an agent is stopped, a supervisor can go ahead with a reason ----------
await step("payment lock", async () => {
  const p = await page();
  const clickStage = (label) => p.ev(`(async () => { const b = [...document.querySelectorAll(".c-step-btn")].find((x) => x.querySelector(".c-step-label")?.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; await __t.hydrated(b); b.click(); return true; })()`);
  await signIn(p, "780000001");
  await p.go("/console/requests/INZ-2026-04741");
  check("lock: an unpaid case says payment is not received", await p.has("Payment not received") && (await currentStage(p)) === "Checking documents", await currentStage(p));
  check("lock: an agent is told a supervisor can move it on", await p.has("A supervisor or the owner can move it on without payment"));
  await clickStage("Preparing"); await waitFor(p, "Ask a supervisor or the owner");
  check("lock: an agent cannot move an unpaid case into preparing", await p.has("Ask a supervisor or the owner if this case should go ahead anyway") && (await currentStage(p)) === "Checking documents" && !(await p.has("Move without payment?")), await currentStage(p));
  await signOut(p);
  await signIn(p, "780000006");
  await p.go("/console/requests/INZ-2026-04741");
  check("lock: a supervisor is told they can move it on with a reason", await p.has("You can move it on anyway with a written reason"));
  await clickStage("Preparing"); await waitFor(p, "Move without payment?");
  check("lock: a supervisor is asked for a reason first", await p.has("Move without payment?") && await p.has("still due from the customer") && (await currentStage(p)) === "Checking documents");
  await p.set(".console-dialog textarea", "ok"); await p.click("Move anyway", "button"); await sleep(1200);
  check("lock: a reason of a word or two is refused", (await currentStage(p)) === "Checking documents", await currentStage(p));
  await p.set(".console-dialog textarea", "Corporate client: invoice paid by bank transfer on Friday."); await p.click("Move anyway", "button");
  await waitUntil(p, `document.querySelector(".c-step-btn[aria-current=step] .c-step-label")?.textContent === "Preparing"`);
  check("lock: with a reason the supervisor moves the case on", (await currentStage(p)) === "Preparing", await currentStage(p));
  await p.click("Activity", "button"); await sleep(300);
  await p.click("Overview", "button"); await sleep(200);
  await p.close();
});

// ---------- Patrick (agent): approve the customer's new upload, deliver, send fees ----------
await step("patrick", async () => {
  const p = await page();
  await signIn(p, "780000003");
  await p.go("/console/requests/INZ-2026-04817");
  await p.click("Messages (", "button"); await sleep(200);
  check("review: the customer's message is there", await p.has("I will send a new photo this afternoon."));
  await p.click("Documents (", "button"); await sleep(200);
  check("review: the customer's upload is waiting", await p.ev(`[...document.querySelectorAll(".console-panel")].some((el) => el.innerText.includes("National ID — front") && el.innerText.includes("Received") && el.innerText.includes("Approve"))`));
  check("review: the agent can open the uploaded file", (await p.ev(`[...document.querySelectorAll('a[href^="/files/"]')].length`)) > 0);
  await clickIn(p, "National ID — front", "Approve"); await waitGone(p, "Waiting on customer");
  check("review: approving the last missing document clears the hold", !(await p.has("Waiting on customer")) && (await currentStage(p)) === "With the institution", await currentStage(p));
  await p.click("Overview", "button"); await sleep(200);
  await p.set("#rq-dname", "E-title — Aline Uwase"); await attach(p, "#rq-dfile"); await waitFor(p, "E-title — Aline Uwase");
  check("deliver: the agent attaches the final document", await p.ev(`[...document.querySelectorAll(".console-panel strong")].some((el) => el.textContent === "E-title — Aline Uwase")`));
  await p.go("/console/requests/INZ-2026-04821");
  await p.click("Payments & Fees", "button"); await sleep(200);
  await attach(p, "#rq-receipt"); await waitFor(p, "Replace receipt");
  check("receipt: the official receipt is attached", await p.has("Replace receipt") && await p.has("Attached"));
  const sendDisabled = () => p.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Send confirmed quote to client")?.disabled`);
  check("quote: can't send fees without the official fee", (await sendDisabled()) === true);
  await p.set("#rq-official", "12000"); await sleep(200); await p.click("Send confirmed quote to client", "button"); await waitGone(p, "Send confirmed quote to client");
  check("quote: fees are saved and sent", !(await p.has("Send confirmed quote to client")) && (await p.ev(`document.querySelector("#rq-official").value`)) === "12000" && await p.has("Awaiting payment"));
  await p.go("/console/requests/INZ-2026-04779");
  await p.click("Close...", "button"); await sleep(200);
  await p.click("Rejected by the institution", "label"); await p.set(".console-dialog textarea", "The land office refused the update: the marriage certificate is not certified.");
  await p.click("Close case", "button"); await waitFor(p, "Rejected by the institution ·");
  check("close: a rejection by the institution is recorded with its reason", await p.ev(`document.querySelector(".c-notice")?.innerText.includes("marriage certificate is not certified") ?? false`) && await p.has("Rejected by the institution ·"));
  await p.close();
});

// ---------- Diane (owner) ----------
await step("admin", async () => {
  const p = await page();
  await signIn(p, "780000008");
  check("admin: the owner lands on the overview", (await p.ev("location.pathname")) === "/console/overview" && await p.has("Do next"));
  await p.go("/admin/services");
  check("services: unchecked official fees are flagged", await p.has("official fees not yet checked"));
  await p.click("Edit Company registration"); await sleep(400);
  check("services: the editor shows the price list fee", (await p.ev(`document.querySelector("#e6").value`)) === "10000");
  await p.set("#e6", "12000"); await p.click("Checked again today"); await sleep(200); await p.click("Save changes"); await waitFor(p, "Company registration updated");
  check("services: saving a price change", await p.has("Company registration updated"));
  await p.go("/services/company-registration");
  check("services: customers see the new price straight away", await p.has("RWF 12,000") && await p.has("Official fee last checked"));
  await p.go("/admin/audit");
  check("audit: the price change is logged", await p.has("Changed assistance fee") && await p.has("RWF 10,000 → RWF 12,000"));
  await p.go("/admin/payments");
  await p.click("Refund"); await sleep(400);
  check("refund: dialog explains only our fee is refunded", await p.has("Only our assistance fee"));
  check("refund: the dialog says the money goes back through IntouchPay", await p.has("through IntouchPay"));
  await p.click("Send refund"); await waitFor(p, "sent back to");
  check("refund: sent back by mobile money and recorded", await p.has("sent back to") && await p.has("by mobile money"));
  await p.go("/admin/roles");
  await p.click("Invite person"); await sleep(200); await p.set("#pp-name", "New Colleague"); await p.set("#pp-phone", "788 444 555"); await p.click("Send invite"); await waitFor(p, "invited as");
  check("people: inviting adds a person", await p.has("New Colleague"));
  await signOut(p); await sleep(500);
  check("sign out: back to sign-in", (await p.ev("location.pathname")) === "/sign-in");
  await p.close();
});

// ---------- Staff console flows ----------
await step("console", async () => {
  const p = await page();
  await signIn(p, "780000008"); // Diane (Owner)
  let triageRef = "";

  // A received case with nobody on it is a new request waiting in the inbox.
  await p.go("/console/requests/INZ-2026-04821");
  await p.set("#agent-asg", ""); await waitFor(p, "Unassigned");

  // 1. Overview: the work queue, its filters, the stage pipeline and the period switch
  await p.go("/console/overview");
  check("console: overview leads with the work queue and the pipeline", await p.has("Do next") && await p.has("Open cases by stage") && await p.has("Fees by month"));
  const rate = await p.ev(`document.querySelector("[data-checkout-rate]")?.innerText ?? ""`);
  check("console: the overview shows how many checkouts were paid", rate.includes("2 of 3 requests paid when sent") && rate.includes("1 waiting") && rate.includes("67%"), rate.replace(/\s+/g, " "));
  const lateCount = Number(await p.ev(`[...document.querySelectorAll(".c-chip")].find((b) => b.textContent.startsWith("Past target"))?.querySelector("b")?.textContent ?? "-1"`));
  await p.click("Past target", "button"); await sleep(300);
  const lateRows = await p.ev(`document.querySelectorAll(".c-donext .c-list-row").length`);
  check("console: a queue chip shows only that kind of work", lateCount > 0 && lateRows === Math.min(lateCount, 6) && await p.ev(`[...document.querySelectorAll(".c-donext .c-list-name")].every((e) => e.textContent === "Past target time")`), `chip ${lateCount}, rows ${lateRows}`);
  await p.go("/console/requests?attention=sla");
  const slaRows = await p.ev(`document.querySelectorAll('.console-table tbody input[aria-label^="Select row"]').length`);
  check("console: a dashboard link opens the requests list already filtered", await p.has("Needs attention: Past target time") && slaRows === lateCount, `${slaRows} rows, dashboard said ${lateCount}`);
  await p.go("/console/overview?range=7");
  check("console: the period switch changes the results period", await p.has("Results · last 7 days") && (await p.ev(`document.querySelector('.c-segmented [aria-current="page"]')?.textContent`)) === "7 days");
  await p.go("/console/overview");
  const newChip = await p.ev(`(() => { const b = [...document.querySelectorAll(".c-chip")].find((e) => e.textContent.startsWith("New")); b?.click(); return !!b; })()`);
  await sleep(300);
  check("console: the request sent earlier waits in the queue to be accepted", newChip && await p.has("Waiting to be accepted"));
  await p.click("Accept", "a"); await waitFor(p, "Inbox / Triage");
  check("console: a new request in the queue leads to the inbox", (await p.ev("location.pathname")) === "/console/inbox");

  // 2. Inbox: paid requests first; unpaid checkouts are kept apart; the owner takes the request sent earlier in one tap
  await p.go("/console/inbox");
  // The admin step refunded this payment, so its badge now says so.
  check("inbox: a request paid at checkout comes first, marked, with no quote to send", (await p.ev(`document.querySelector("#inbox-ready .console-panel")?.innerText.includes("Pay First")`))
    && (await p.ev(`document.querySelector("#inbox-ready .console-panel [data-paid]")?.textContent ?? ""`)) === "Refunded"
    && (await p.ev(`document.querySelector("#inbox-ready .console-panel")?.innerText.includes("Quote")`)) === false, (await p.ev(`document.querySelector("#inbox-ready")?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  check("inbox: an unpaid checkout is not in the queue", !(await p.ev(`document.querySelector("#inbox-ready")?.innerText.includes("Test Person")`)));
  const reviewRow = await p.ev(`[...document.querySelectorAll("#inbox-ready .console-panel")].find((e) => e.innerText.includes("Ebm Person"))?.innerText ?? ""`);
  check("inbox: a request sent with a review fee is marked and still needs its quote", reviewRow.includes("Review fee paid RWF 1,000") && reviewRow.includes("Needs a quote") && reviewRow.includes("Quote"), reviewRow.replace(/\s+/g, " ").slice(0, 200));
  await p.click("Awaiting payment", "button"); await sleep(300);
  check("inbox: unpaid checkouts are listed apart, to follow up", await p.has("Test Person") && await p.has("RWF 5,000") && await p.has("closes on its own after three days") && (await p.ev(`document.querySelectorAll("[data-checkout]").length`)) >= 1);
  await p.click("Ready to work", "button"); await sleep(200);
  triageRef = await p.ev(`document.querySelector("#inbox-ready .console-panel .c-mono-ref")?.textContent?.trim() ?? ""`);
  check("console: the owner can take a new request themselves", !!triageRef && await p.has("Accept & take it"));
  if (triageRef) {
    await p.click("Accept & take it", "button"); await waitFor(p, "You took");
    check("console: taking a request assigns it to the owner", await p.has(`You took ${triageRef}`));
  }

  // Back to Patrick, whose case it is in the seed: later checks rely on who has which case.
  await p.go("/console/requests/INZ-2026-04821");
  await p.set("#agent-asg", "s-patrick"); await waitFor(p, "Assigned to");

  // 3. Requests list & Saved views
  await p.go("/console/requests");
  check("console: requests list loads", await p.has("Requests") && await p.has("Export"));
  const rowsBeforeView = await p.ev(`document.querySelectorAll('.console-table tbody input[aria-label^="Select row"]').length`);
  await p.set("select.console-select", "sv-unassigned"); await sleep(300);
  const rowsAfterView = await p.ev(`document.querySelectorAll('.console-table tbody input[aria-label^="Select row"]').length`);
  const selectedView = await p.ev(`document.querySelector("select.console-select")?.value ?? "missing"`);
  check("console: Unassigned saved view filters the request rows", rowsAfterView > 0 && rowsAfterView < rowsBeforeView, `${rowsBeforeView} rows → ${rowsAfterView}; selected ${selectedView}`);

  const selected = await p.ev(`(() => { const cell = document.querySelector('.console-table tbody tr td:first-child'); if (!cell) return false; cell.click(); return true; })()`);
  if (selected) await waitFor(p, "1 row selected");
  let bulkAssigned = false;
  if (selected) {
    await p.click("Assign 1 cases"); await sleep(200);
    await p.set(".console-dialog select", "s-eric");
    await p.click("Apply assignment"); await waitFor(p, "Assigned");
    bulkAssigned = await p.has("Assigned 1 requests.");
  }
  check("console: bulk assignment saves the selected request", selected && bulkAssigned, `selected=${selected}; assigned=${bulkAssigned}; visible rows=${await p.ev(`document.querySelectorAll(".console-table tbody tr").length`)}`);

  // 4. Clients directory & Client profile
  await p.go("/console/clients");
  check("console: clients directory loads", await p.has("Client Directory") && await p.has("Aline Uwase"));
  await p.click("Aline Uwase"); await waitPath(p, (path) => path.startsWith("/console/clients/")); await waitFor(p, "National ID"); await p.help();
  check("console: client profile loads with tabs", (await p.ev("location.pathname")).includes("/console/clients/") && await p.has("National ID"), `at ${await p.ev("location.pathname")}: ${(await p.ev(`document.querySelector("main")?.innerText ?? ""`)).slice(0, 160).replace(/\s+/g, " ")}`);
  
  // Privacy reveal
  const hasShowBtn = await p.has("Show ID");
  if (hasShowBtn) {
    await p.click("Show ID", "button"); await waitFor(p, "1 1995 8 0045123 0 17");
    check("console: revealing national ID unmasks digits", await p.has("1 1995 8 0045123 0 17"));
    await p.go("/admin/audit");
    check("console: national ID reveal is audited", await p.has("Viewed unmasked National ID"));
    await p.go("/console/clients/p-aline");
  }

  // Add a tag
  await p.set("input[placeholder='Add tag (e.g. VIP)...']", "FlowTest");
  await p.click("Add tag", "button"); await waitFor(p, "FlowTest");
  check("console: client tag added", await p.has("FlowTest"));

  // 5. My Day view
  await p.go("/console/my-day");
  check("console: my day command center loads", await p.has("Good day") && await p.has("Follow-ups due") && await p.has("Past or near target"));

  // 6. A link to a case tab opens that tab
  await p.go("/console/requests/INZ-2026-04790#messages"); await sleep(500);
  check("console: a #messages link opens the messages tab", ((await p.ev(`document.querySelector('[role="tab"][aria-selected="true"]')?.textContent`)) ?? "").startsWith("Messages"));

  await signOut(p); await sleep(500);
  await p.close();
});


// ---------- who sees what ----------
// Searches the page and the data sent with it, not only what is on screen.
const pageData = (p) => p.ev("document.documentElement.outerHTML");
const FULL_IDS = ["0045123", "0021345", "0034129", "0012934", "109876456", "102345991", "108543312", "101890774"]; // seeded national IDs (middle digits) and TINs
const fullIds = (html) => FULL_IDS.filter((x) => html.includes(x));
await step("staff scope", async () => {
  const p = await page();
  await signIn(p, "780000001"); // Eric: no "View all cases"
  await p.go("/console/requests"); await sleep(500);
  let html = await pageData(p);
  check("scope: an agent's request list has their cases only", html.includes("INZ-2026-04790") && !html.includes("INZ-2026-04817") && !html.includes("INZ-2026-04821"));
  check("scope: no full ID numbers are sent with the request list", !fullIds(html).length, fullIds(html).join(", "));
  await p.go("/console/clients"); await sleep(500); html = await pageData(p);
  check("scope: an agent's client list has the clients of their cases only", html.includes("Kigali Fresh Foods") && !html.includes("Chantal Mukeshimana") && !html.includes("Jean Claude Habimana"));
  check("scope: no full ID numbers are sent with the client list", !fullIds(html).length, fullIds(html).join(", "));
  await p.go("/console/clients/p-chantal"); await sleep(500);
  check("scope: another agent's client is not found", await p.has("We couldn’t find that") && !(await pageData(p)).includes("Chantal Mukeshimana"));
  await p.go("/console/clients/p-umucyo"); await sleep(500); html = await pageData(p);
  check("scope: a shared client shows only the agent's own case", html.includes("INZ-2026-04761") && !html.includes("RDB-APP-778120") && !html.includes("shareholder split"));
  check("scope: no full TIN on the client page", !fullIds(html).length, fullIds(html).join(", "));
  await p.go("/console/overview"); await sleep(500);
  check("scope: an agent can't open the overview", await p.has("Your role doesn’t include the operations overview"));
  await p.go("/console/inbox"); await sleep(500);
  check("scope: an agent can't open the triage inbox", await p.has("Your role doesn’t include the triage inbox"));
  check("scope: the agent's menu has no Overview or Payments", !(await p.ev(`[...document.querySelectorAll(".console-nav-item")].some((a) => /Overview|Payments/.test(a.textContent))`)));
  await signIn(p, "780000008"); // Diane: owner
  await p.go("/console/clients/p-aline"); await sleep(500); html = await pageData(p);
  check("scope: even the owner gets the masked ID until they reveal it", html.includes("1 1995 8 •••• 0 17") && !fullIds(html).length, fullIds(html).join(", "));
  await p.close();
});

// ---------- Aline again: the delivered document ----------
await step("delivered", async () => {
  const p = await page();
  await signIn(p, "aline.uwase@example.com");
  await p.go("/portal/requests/INZ-2026-04817");
  const link = await p.ev(`[...document.querySelectorAll('a[href^="/files/"]')].find((a) => a.closest("section")?.textContent.includes("E-title — Aline Uwase"))?.getAttribute("href") ?? ""`);
  check("delivered: the customer sees the final document", await p.has("E-title — Aline Uwase") && !!link);
  check("delivered: and can download it", link ? (await p.ev(`fetch(${JSON.stringify(link)}).then((r) => r.status)`)) === 200 : false);
  await p.go("/portal");
  check("delivered: the customer was notified", await p.has("E-title — Aline Uwase is ready in your portal"));
  await p.close();
});

// ---------- account, data rights and system ----------
await step("account", async () => {
  const p = await page();
  await signIn(p, "aline.uwase@example.com");
  await p.go("/portal/account"); await waitFor(p, "Your details");
  check("account: open requests block deleting the account", await p.has("Finish or cancel your") && (await p.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete account")?.disabled`)) === true);
  await p.close();
});
await step("privacy", async () => {
  const p = await page();
  await signIn(p, "test.person@example.com");
  await p.go(`/portal/requests/${unpaidRef}`); await waitFor(p, "Cancel this request");
  await p.click("Cancel this request", "summary"); await sleep(300); await p.click("Cancel request", "button"); await waitFor(p, "Cancelled by you");
  check("cancel: an unpaid checkout can be cancelled by the customer", await p.has("Cancelled by you") && !(await p.has("Pay to send your request")));
  await p.go("/portal/account"); await waitFor(p, "Your details");
  check("privacy: finished requests' documents are counted", await p.has("1 file from 1 request"));
  await p.set("#acct-name", "Test Person Renamed");
  await p.ev(`[...document.querySelectorAll('input[name=languages]')].find((i) => i.value === "French").click()`);
  await p.click("Save changes", "button"); await waitFor(p, "Saved");
  await p.go("/portal/account"); await waitFor(p, "Your details");
  check("account: details are saved", (await p.ev(`document.querySelector("#acct-name").value`)) === "Test Person Renamed" && (await p.ev(`document.querySelector('input[value=French]').checked`)) === true);
  await p.click("Delete now", "button"); await sleep(200); await p.click("Yes, delete them", "button"); await waitFor(p, "1 file deleted");
  check("privacy: deleting documents of finished requests is confirmed", await p.has("1 file deleted"));
  // The count below it comes from the server; reload so the check reads what was actually stored.
  await p.go("/portal/account"); await waitFor(p, "Your details");
  const purged = await p.has("Nothing stored");
  if (!purged) console.log("    page says:", (await p.ev(`document.querySelector("#acct-data")?.closest("section")?.innerText ?? ""`)).replace(/\s+/g, " ").slice(0, 400));
  check("privacy: a customer can delete documents of finished requests", purged);
  await p.click("Delete account", "button"); await sleep(300);
  await p.set("#del-confirm", "DELETE"); await p.click("Delete my account", "button"); await waitPath(p, (path) => path === "/"); await waitFor(p, "Your account is deleted");
  check("privacy: a customer can delete their account", await p.has("Your account is deleted"));
  await p.go("/sign-in"); await p.set("#si-email", "test.person@example.com"); await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]")?.dataset.demoCode ?? ""`)); await p.click("Sign in", "button"); await waitFor(p, "don’t have an account");
  check("privacy: a deleted account can no longer sign in", await p.has("don’t have an account"));
  await p.close();
});
// ---------- a certificate on WhatsApp: name, ID, number, one payment ----------
await step("whatsapp", async () => {
  const p = await page(390);
  await p.go("/start/birth-certificate"); await waitFor(p, "Continue");
  check("whatsapp: a basic certificate asks no documents and no date of birth", (await p.ev(`document.querySelector("#f-dob") === null && document.querySelector("#f-email") === null`)) && await p.has("Your WhatsApp number"));
  await p.set("#f-name", "Wa Customer"); await p.set("#f-nid", "1 1990 8 0045123 0 17"); await p.set("#f-phone", "0788 555 020");
  await p.click("Myself", "label"); await p.click("Continue"); await sleep(300);
  check("whatsapp: the check step says no documents are needed, and asks for none", await p.has("No documents needed for this service") && (await p.ev(`document.querySelectorAll("input[type=file]").length`)) === 0);
  const total = await p.ev(`document.querySelector("[data-checkout-total]")?.innerText ?? ""`);
  check("whatsapp: one total with the Irembo fee inside it", total.includes("RWF 500") && total.includes("RWF 2,000") && total.includes("RWF 2,500") && total.includes("We pay the Irembo bill"), total.replace(/\s+/g, " "));
  check("whatsapp: the review says where it will be sent", await p.has("WhatsApp · +250 788 555 020"));
  await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click()`); await p.click("Continue to payment"); await sleep(1200);
  await waitFor(p, "Enter the code we sent you");
  check("whatsapp: the code goes to the number by SMS", await p.has("+250 788 555 020") && await p.has("Confirm your number"));
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and go to payment");
  await waitPath(p, (path) => path.endsWith("/pay"), 120); await waitFor(p, "Pay to send your request", 60);
  check("whatsapp: a confirmed number opens a portal and goes to payment", (await p.ev(`document.querySelector("[data-pay]")?.textContent ?? ""`)).includes("RWF 2,500"));
  const ref = (await p.ev("location.pathname")).split("/")[3] ?? "";
  // The number now has an account with no email: the email path cannot take it over, and phone sign-in opens it.
  await p.go("/start/single-status"); await waitFor(p, "Continue");
  check("whatsapp: single status warns, before anything is paid, that NIDA must list them as single", await p.has("Only if NIDA lists you as single"));
  await p.close();
  const o = await page();
  await signIn(o, "788555020");
  check("whatsapp: a number-only account signs in by SMS code", (await o.ev("location.pathname")).startsWith("/portal"));
  await o.go(`/portal/requests/${ref}`); await waitFor(o, ref);
  check("whatsapp: the customer signs in with the number and sees the request", await o.has("Birth certificate") && await o.has(ref));
  await o.close();
});

// ---------- registration is optional ----------
await step("contact", async () => {
  const p = await page();
  await p.go("/start/irembo-training");
  await p.ev(`document.querySelector("[data-via=email] input").click()`); await p.set("#f-name", "Guest Person"); await p.set("#f-email", "guest.person@example.com");
  await p.click("Online", "label"); await p.click("Continue"); await sleep(300);
  check("contact: sending does not ask whether to create a portal", !(await p.has("Create my portal")) && await p.has("Check, then pay") && await p.has("Online"));
  await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click()`); await p.click("Continue to payment"); await sleep(1200);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and go to payment");
  await waitPath(p, (path) => path.endsWith("/pay"), 120);
  const ref = (await p.ev("location.pathname")).split("/")[3] ?? "";
  check("contact: sending opens a portal for the same reference", /^INZ-\d{4}-\d{5}$/.test(ref), ref);
  await p.go(`/portal/requests/${ref}`);
  // The address changes first, then the portal shell, and only then the request itself. Wait until the reference is on that page.
  let landed = false;
  for (let i = 0; i < 80; i++) {
    const path = await p.ev("location.pathname");
    const text = await p.ev("document.body.innerText");
    if (path === "/portal/requests/" + ref && text.includes(ref) && text.includes("My requests")) { landed = true; break; }
    await sleep(250);
  }
  check("contact: the customer is signed in on that request", landed,
    `${await p.ev("location.pathname")} ${(await p.ev("document.body.innerText")).replace(/\s+/g, " ").slice(0, 280)}`);
  await signOut(p);
  await p.go("/track"); await p.set("#tr-ref", ref); await p.set("#tr-contact", "guest.person@example.com"); await p.click("Check progress"); await waitFor(p, "Irembo training");
  check("contact: the request can be followed with its reference and email", await p.has("Irembo training"));
  await signIn(p, "guest.person@example.com");
  await p.go("/portal/requests/" + ref);
  check("contact: signing in again opens the same request", (await p.ev("location.pathname")).startsWith("/portal/requests/") && await p.has(ref));
  await p.close();
});
await step("add email", async () => {
  // A customer entered by staff has only a phone number: they may sign in with it until they add an email.
  const p = await page();
  await signIn(p, "788321654");
  check("add email: a phone-only customer is asked to add an email", await p.has("Add your email to keep your portal"));
  await p.go("/portal/account"); await waitFor(p, "Your details");
  await p.click("Add your email", "button"); await sleep(200);
  await p.set("#acct-email-new", "walkin.customer@example.com"); await p.click("Send me a code", "button"); await waitFor(p, "We sent a code to walkin.customer@example.com");
  await p.set("#acct-email-code", "000000"); await p.click("Confirm email", "button"); await sleep(1000);
  check("add email: a wrong code does not save the address", await p.has("not right") && !(await p.has("Your email is saved")));
  await p.set("#acct-email-code", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm email", "button"); await waitFor(p, "Your email is saved");
  check("add email: the confirmed address is saved", await p.has("Your email is saved") && await p.has("walkin.customer@example.com"));
  await signIn(p, "walkin.customer@example.com");
  check("add email: and signs the customer in", (await p.ev("location.pathname")).startsWith("/portal") && !(await p.has("Add your email to keep your portal")));
  await p.go("/sign-in?method=phone");
  await p.close();
});
await step("system", async () => {
  const p = await page();
  await signIn(p, "780000008");
  await p.go("/admin/system"); await waitFor(p, "Running the site");
  check("system: the owner sees what is connected", await p.has("Running the site") && await p.has("Test mode") && await p.has("Company details"));
  await p.click("Run the daily job now", "button"); await waitFor(p, "Job finished");
  const runOk = `[...document.querySelectorAll(".sys-row .c-badge")].some((b) => b.textContent.startsWith("OK"))`;
  for (let i = 0; i < 40 && !(await p.ev(runOk)); i++) await sleep(250);
  check("system: the daily job runs", await p.has("Job finished"), await p.ev(`document.querySelector(".sys-msg")?.textContent ?? "no message"`));
  await p.go("/admin/system"); await waitFor(p, "Running the site");
  check("system: the run is recorded", await p.ev(runOk), await p.ev(`[...document.querySelectorAll(".sys-row .c-badge")].map((b) => b.textContent).join(" | ")`));
  await p.click("Send me a test SMS", "button"); await waitFor(p, "Test SMS sent");
  check("system: a test SMS can be sent", await p.has("Test SMS sent"));
  await p.close();
});

// ---------- who may change roles; the authenticator step for staff ----------
/** The 6-digit authenticator code for a base32 secret, `ahead` 30-second steps from now (RFC 6238, SHA-1). */
function totp(secret, ahead = 0) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0; const key = [];
  for (const ch of secret.replace(/\s/g, "")) { value = (value << 5) | A.indexOf(ch); bits += 5; if (bits >= 8) { key.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + ahead));
  const h = createHmac("sha1", Buffer.from(key)).update(counter).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, "0");
}
/** Staff phone sign-in up to the code step; returns the page, signed in as far as the SMS code. */
async function phoneCode(p, phone) {
  await p.go("/sign-in?method=phone");
  if ((await p.ev("location.pathname")) !== "/sign-in") { await signOut(p); await p.go("/sign-in?method=phone"); }
  await p.set("#si-phone", phone); await p.click("Send me a code"); await waitCode(p);
  const code = await p.ev(`document.querySelector("[data-demo-code]")?.dataset.demoCode ?? ""`);
  await p.set("#otp", code); await p.click("Sign in", "button"); await sleep(1500); await p.help();
}

await step("roles", async () => {
  const p = await page();
  await signIn(p, "780000008");
  await p.go("/admin/roles");
  check("roles: the owner can edit the permissions table", (await p.ev(`document.querySelectorAll('.roles input[type=checkbox]:not(:disabled)').length`)) > 20);
  await p.ev(`(async () => { const sel = document.querySelector('select[id^="r-"]'); return sel ? sel.id : "" })()`);
  const id = await p.ev(`[...document.querySelectorAll("tr")].find((r) => r.textContent.includes("New Colleague"))?.querySelector("select")?.id ?? ""`);
  if (!id) throw new Error("New Colleague is not listed (the admin step invites them)");
  await p.set("#" + id, "Administrator"); await waitFor(p, "is now Administrator");
  check("roles: the owner can appoint an Administrator", await p.has("New Colleague is now Administrator"));
  await signOut(p);
  await signIn(p, "788444555");
  await p.go("/admin/roles");
  check("roles: an Administrator sees the table but can't change it", await p.has("Only the owner can change this table") && (await p.ev(`document.querySelectorAll('.roles input[type=checkbox]:not(:disabled)').length`)) === 0);
  check("roles: an Administrator can't appoint another Administrator", !(await p.ev(`[...document.querySelectorAll("#people select option")].some((o) => o.textContent === "Administrator")`)));
  await p.close();
});

await step("authenticator", async () => {
  const p = await page();
  await signIn(p, "780000001");
  await p.go("/console/security"); await waitFor(p, "Authenticator app");
  await p.click("Set up authenticator app", "button"); await waitFor(p, "Add Inzira to your app");
  const secret = await p.ev(`document.querySelector("[data-totp-secret]")?.dataset.totpSecret ?? ""`);
  check("authenticator: setup shows a key to add to the app", /^[A-Z2-7]{32}$/.test(secret));
  await p.set("#sec-code", "000000"); await p.click("Turn on", "button"); await waitFor(p, "not right");
  check("authenticator: a wrong code does not turn it on", await p.has("not right") && !(await p.has("Save your recovery codes")));
  await p.set("#sec-code", totp(secret)); await p.click("Turn on", "button"); await waitFor(p, "Save your recovery codes");
  const recovery = await p.ev(`[...document.querySelectorAll("#rc-h ~ ul li")].map((li) => li.textContent)`);
  check("authenticator: it turns on and shows eight recovery codes once", recovery.length === 8);
  await p.click("I have saved them", "label"); await p.click("Done", "button"); await sleep(300);
  check("authenticator: the page now says it is on", await p.has("Authenticator app is on"));
  await signOut(p);

  await phoneCode(p, "780000001");
  check("authenticator: after the SMS code, a second step is asked for", await p.has("One more step") && (await p.ev("location.pathname")) === "/sign-in");
  await p.set("#totp", "000000"); await p.click("Sign in", "button"); await waitFor(p, "not right");
  check("authenticator: a wrong code does not sign in", await p.has("not right") && (await p.ev("location.pathname")) === "/sign-in");
  // The code used while setting up is spent; one step ahead is accepted (the app allows a step either side).
  // Keep these exact digits for the reuse check. Calling totp() again can land in the next window and mint a new code.
  const spent = totp(secret, 1);
  await p.set("#totp", spent); await p.click("Sign in", "button"); await waitPath(p, (path) => path.startsWith("/console"));
  check("authenticator: the right code signs in", (await p.ev("location.pathname")).startsWith("/console"));
  await signOut(p);

  await phoneCode(p, "780000001");
  await p.set("#totp", spent); await p.click("Sign in", "button"); await waitFor(p, "not right");
  check("authenticator: a code that was already used is refused", await p.has("not right") && (await p.ev("location.pathname")) === "/sign-in");
  await p.click("Lost your phone?", "button"); await sleep(200);
  await p.set("#totp", recovery[0]); await p.click("Sign in", "button"); await waitPath(p, (path) => path.startsWith("/console"));
  check("authenticator: a recovery code signs in", (await p.ev("location.pathname")).startsWith("/console"));
  await signOut(p);

  await phoneCode(p, "780000001");
  await p.click("Lost your phone?", "button"); await sleep(200);
  await p.set("#totp", recovery[0]); await p.click("Sign in", "button"); await waitFor(p, "not right");
  check("authenticator: a recovery code works only once", await p.has("not right") && (await p.ev("location.pathname")) === "/sign-in");
  await p.close();

  // The owner can take the step off for a colleague who lost their phone and their codes.
  const o = await page();
  await signIn(o, "780000008");
  await o.go("/admin/roles"); await waitFor(o, "Authenticator");
  check("authenticator: the owner sees who has it on", await o.ev(`[...document.querySelectorAll("tr")].some((r) => r.textContent.includes("Eric Niyonzima") && r.textContent.includes("Authenticator"))`));
  await o.ev(`window.confirm = () => true`);
  await o.ev(`(() => { const row = [...document.querySelectorAll("tr")].find((r) => r.textContent.includes("Eric Niyonzima")); [...row.querySelectorAll("button")].find((b) => b.textContent.startsWith("Reset authenticator")).click(); return true; })()`);
  await waitFor(o, "authenticator step was removed");
  check("authenticator: the owner can reset it", await o.has("authenticator step was removed"));
  await o.close();
});

// ---------- mobile navigation ----------
await step("mobile", async () => {
  const p = await page(390);
  await p.go("/start/land-spouse-update");
  check("mobile: a service that needs an ID shows the field", await p.has("National ID Number") && await p.has("This service needs it") && (await p.ev(`!!document.querySelector("#f-nid")`)) === true);
  await p.go("/start/irembo-training");
  check("mobile: a service that does not need an ID hides the field", (await p.ev(`document.querySelector("#f-nid") === null`)) === true);
  await p.go("/");
  await p.click("Open menu"); await sleep(300);
  check("menu: opens as a dialog", (await p.ev(`!!document.querySelector('.mobmenu[role=dialog]')`)) && (await p.ev(`document.body.style.overflow`)) === "hidden");
  await p.key("Escape"); await sleep(200);
  check("menu: Escape closes it and gives focus back", !(await p.ev(`!!document.querySelector('.mobmenu')`)) && (await p.ev(`document.activeElement?.getAttribute("aria-label")`)) === "Open menu");
  await p.close();
});

const unknown = (only ?? []).filter((name) => !seen.has(name));
if (unknown.length) { console.error(`FLOWS_ONLY names no step: ${unknown.join(", ")} (steps: ${[...seen].join(", ")})`); stop(2); }
if (!pass && !fails.length) { console.error("No checks ran."); stop(2); }
console.log(`\n${pass} passed, ${fails.length} failed on ${base}`);
if (fails.length) console.log(fails.map((f) => " - " + f).join("\n"));
stop(fails.length ? 1 : 0);
