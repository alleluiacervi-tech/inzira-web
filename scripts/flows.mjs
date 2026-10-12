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
// Containers and CI runners usually can't give Chrome its sandbox; this browser only opens the local app.
const sandbox = process.platform === "linux" ? ["--no-sandbox"] : [];
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", ...sandbox, `--remote-debugging-port=${port}`, `--user-data-dir=${join(work, "profile")}`, "about:blank"], { stdio: "ignore" });
const stop = (code) => { chrome.kill(); try { rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp folder is cleaned by the OS */ } process.exit(code); };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; ; i++) {
  try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* not up yet */ }
  if (i > 40) { console.error("Chrome did not start."); stop(2); }
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
/** Signs in with a phone number, reading the demo code shown on screen. A customer's portal is in
 *  the language of their account (Kinyarwanda for the demo customers); the checks read English, so
 *  it is switched unless `language` says otherwise. */
async function signIn(p, phone, { language = "en" } = {}) {
  await p.go("/sign-in");
  if ((await p.ev("location.pathname")) !== "/sign-in") { await signOut(p); await p.go("/sign-in"); }
  await p.set("#si-phone", phone); await p.click("Send me a code"); await waitCode(p);
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
  }
  await p.click("Sign out", "button");
  await waitPath(p, (path) => path === "/sign-in");
}
/** Waits for the demo sign-in code to appear, up to 10 seconds. */
async function waitCode(p) {
  for (let i = 0; i < 40 && !(await p.ev(`!!document.querySelector("[data-demo-code]")`)); i++) await sleep(250);
}
/** Waits until the address matches, up to 10 seconds. */
async function waitPath(p, ok) {
  for (let i = 0; i < 40 && !ok(await p.ev("location.pathname")); i++) await sleep(250);
}
/** Waits until the page shows `text` (after a save and refresh), up to 10 seconds. */
async function waitFor(p, text) {
  for (let i = 0; i < 40 && !(await p.has(text)); i++) await sleep(250);
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
  await p.set("#tr-ref", "inz-2026-04817"); await p.set("#tr-phone", "0788 123 456"); await p.click("Check progress"); await waitFor(p, "We need a clearer ID photo");
  check("track: finds a request by reference + phone", await p.has("E-title") && await p.has("We need a clearer ID photo"));
  check("track: shows no personal data", !(await p.has("Aline")) && !(await p.has("id_front")));
  await p.set("#tr-phone", "788 000 111"); await p.click("Check progress"); await waitFor(p, "couldn’t find a request");
  check("track: wrong phone is refused with the same message as not found", await p.has("couldn’t find a request") && !(await p.has("E-title")));
  await p.close();
});

await step("private areas", async () => {
  const p = await page();
  await p.go("/portal");
  check("private: the portal asks you to sign in", (await p.ev("location.pathname")) === "/sign-in");
  await p.go("/admin");
  check("private: the admin console asks you to sign in", (await p.ev("location.pathname")) === "/sign-in");
  await p.set("#si-phone", "788 000 999"); await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Sign in", "button"); await sleep(1500);
  check("sign-in: an unknown number is told to start a service", await p.has("We don’t have an account for this number"));
  await p.set("#otp", "000000"); await p.click("Sign in", "button"); await sleep(1000);
  check("sign-in: a used or wrong code is refused", await p.has("expired") || await p.has("not right"));
  await p.close();
});

// ---------- a new customer sends a request ----------
await step("start", async () => {
  const p = await page();
  await p.go("/start/land-spouse-update");
  await p.click("Continue");
  check("start: empty step 1 is blocked with plain errors", await p.has("Enter your full name") && await p.has("ID numbers have 16 digits") && await p.has("Enter a Rwandan mobile number"));
  await p.set("#f-name", "Test Person"); await p.set("#f-nid", "1 1995 8 0045123 0 17"); await p.set("#f-phone", "788 555 010");
  await p.click("Continue"); await sleep(300);
  check("start: step 2 offers the service's own choices", await p.has("Tell us about the request") && await p.has("Add a spouse after marriage"));
  await p.go("/start/land-spouse-update"); await sleep(400);
  check("start: a refresh keeps the draft and the step", await p.has("Tell us about the request"));
  await p.click("Add a spouse after marriage", "label"); await p.set("#f-notes", "We married in August."); await p.click("Continue"); await sleep(300);
  await attach(p, "input[type=file]"); await sleep(300);
  check("start: a chosen file is listed", await p.has("id_photo.png"));
  await p.click("Continue"); await sleep(200);
  check("start: review lists what was entered", await p.has("Check and send") && await p.has("Test Person") && await p.has("Add a spouse after marriage"));
  await p.click("Send request"); await sleep(200);
  check("start: cannot send without the acknowledgement", await p.has("Please confirm you’ve read this"));
  await p.ev(`document.querySelector('.check input[type=checkbox]').click()`); await p.click("Send request"); await sleep(1200);
  check("start: texts a code to confirm the number", await p.has("Enter the code we sent you") && await p.has("+250 788 555 010"));
  await p.set("#otp", "111111"); await p.click("Confirm and send request"); await sleep(1000);
  check("start: a wrong code is refused", await p.has("not right"));
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]").dataset.demoCode`)); await p.click("Confirm and send request"); await waitFor(p, "Request received");
  if (!(await p.has("Request received"))) console.log("    page says:", (await p.ev(`document.querySelector("main")?.innerText ?? ""`)).slice(0, 300).replace(/\s+/g, " "));
  const ref = await p.ev(`document.querySelector("[data-ref]")?.textContent ?? ""`);
  check("start: creates the request with a new reference", await p.has("Request received") && /^INZ-\d{4}-\d{5}$/.test(ref), ref);
  check("start: the draft is cleared after sending", (await p.ev(`sessionStorage.getItem("inzira:start:land-spouse-update")`)) === null);
  await p.click("See my request"); await waitFor(p, "We married in August.");
  check("start: the new customer is signed in and sees the request", await p.has("Add or remove a spouse in the land register") && await p.has("We married in August.") && await p.has("id_photo.png"));
  await p.click("Cancel this request", "summary"); await sleep(300); await p.click("Cancel request", "button"); await waitFor(p, "Cancelled by you");
  check("cancel: a customer can cancel before paying", await p.has("Cancelled by you") && !(await p.has("Cancel this request")));
  await p.go("/start/irembo-training");
  check("training: no national ID is asked for", (await p.ev(`document.querySelector("#f-nid") === null && !!document.querySelector('[aria-label^="Step 1 of 3"]')`)));
  await p.close();
});

// ---------- Aline: pay, message, upload ----------
await step("customer", async () => {
  const p = await page();
  await signIn(p, "788123456", { language: null });
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
  await p.click("Review and pay"); await sleep(300);
  await p.key("Escape"); await sleep(300);
  check("pay: Escape closes the dialog and gives focus back", !(await p.has("Approve and pay")) && (await p.ev("document.activeElement?.tagName + ':' + (document.activeElement?.textContent ?? '')")).startsWith("BUTTON:Review and pay"));
  await p.click("Review and pay"); await sleep(300); await p.click("Send payment prompt"); await sleep(200);
  check("pay: cannot pay without approving the amounts", await p.has("Tick the box to approve"));
  await p.ev(`document.querySelector('.modal .check input').click()`);
  await p.set("#mm", "788 120 000"); await p.click("Send payment prompt"); await sleep(600);
  check("pay: shows a waiting state", await p.has("Check your phone"));
  await sleep(4500);
  check("pay: a declined prompt says nothing was charged", await p.has("didn’t go through") && await p.has("Nothing was charged"));
  await p.click("Try again"); await sleep(200); await p.set("#mm", "788 123 456"); await p.click("Send payment prompt"); await sleep(5500);
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
  await p.close();
});

// ---------- Eric (agent) ----------
await step("agent", async () => {
  const p = await page();
  await signIn(p, "780000001");
  check("agent: agents land on My day in the console", (await p.ev("location.pathname")) === "/console/my-day" && await p.has("Good"));
  check("agent: My Day shows agent work queues", await p.has("Follow-ups Today") && await p.has("SLA Attention") && await p.has("My open cases ("));
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
  await p.set("#rq-oref", "EBM-2026-5512"); await p.click("Save submission reference", "button"); await waitGone(p, "Waiting on customer");
  check("agent: saving the official reference moves the case to the institution and clears the hold", !(await p.has("Waiting on customer")) && (await currentStage(p)) === "With the institution", await currentStage(p));
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
  check("admin: the owner lands on the overview", (await p.ev("location.pathname")) === "/console/overview" && await p.has("Needs attention"));
  await p.go("/admin/services");
  check("services: unchecked official fees are flagged", await p.has("official fees not yet checked"));
  await p.click("Edit Company registration"); await sleep(400);
  check("services: the editor shows the price list fee", (await p.ev(`document.querySelector("#e6").value`)) === "10000");
  await p.set("#e6", "12000"); await p.click("Mark as checked today"); await sleep(200); await p.click("Save changes"); await waitFor(p, "Company registration updated");
  check("services: saving a price change", await p.has("Company registration updated"));
  await p.go("/services/company-registration");
  check("services: customers see the new price straight away", await p.has("RWF 12,000") && await p.has("Official fee last checked"));
  await p.go("/admin/audit");
  check("audit: the price change is logged", await p.has("Changed assistance fee") && await p.has("RWF 10,000 → RWF 12,000"));
  await p.go("/admin/payments");
  await p.click("Refund"); await sleep(400);
  check("refund: dialog explains only our fee is refunded", await p.has("Only our assistance fee"));
  await p.click("Issue refund"); await waitFor(p, "recorded as refunded");
  check("refund: recorded", await p.has("recorded as refunded"));
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

  // 1. Overview & Needs Attention link-through
  await p.go("/console/overview");
  check("console: overview loads with needs attention", await p.has("Needs attention") && await p.has("Fee breakdown trend"));
  await p.click("New submissions to assign"); await waitFor(p, "Inbox / Triage");
  check("console: clicking needs attention card navigates to inbox", (await p.ev("location.pathname")).includes("/console/inbox"));

  // 2. Inbox view & assign
  await p.go("/console/inbox");
  check("console: inbox lists unassigned requests", await p.has("Inbox / Triage"));
  const canAssign = await p.has("Accept & assign");
  if (canAssign) {
    triageRef = await p.ev(`document.querySelector(".console-panel .c-mono-ref")?.textContent?.trim() ?? ""`);
    await p.click("Accept & assign"); await sleep(300);
    const suggested = await p.has("Suggested:");
    await p.click("Confirm & assign"); await waitFor(p, "assigned to");
    check("console: inbox suggests an agent and assigns the request", suggested && await p.has("assigned to"));
  } else {
    check("console: inbox has no unassigned cases to assign", true);
  }

  if (triageRef) {
    await p.go(`/console/requests/${triageRef}`);
    await p.set("#agent-asg", ""); await waitFor(p, "Unassigned");
  }

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
  check("console: my day command center loads", await p.has("Good day") && await p.has("Follow-ups Today") && await p.has("SLA Attention"));

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
  await signIn(p, "788123456");
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
  await signIn(p, "788123456");
  await p.go("/portal/account"); await waitFor(p, "Your details");
  check("account: open requests block deleting the account", await p.has("Finish or cancel your") && (await p.ev(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete account")?.disabled`)) === true);
  await p.close();
});
await step("privacy", async () => {
  const p = await page();
  await signIn(p, "788555010");
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
  await p.go("/sign-in"); await p.set("#si-phone", "788 555 010"); await p.click("Send me a code"); await waitCode(p);
  await p.set("#otp", await p.ev(`document.querySelector("[data-demo-code]")?.dataset.demoCode ?? ""`)); await p.click("Sign in", "button"); await waitFor(p, "don’t have an account");
  check("privacy: a deleted account can no longer sign in", await p.has("don’t have an account"));
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

// ---------- mobile navigation ----------
await step("mobile", async () => {
  const p = await page(390);
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
