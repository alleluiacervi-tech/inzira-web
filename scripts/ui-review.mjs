// Demo layout and accessibility smoke review. Requires a disposable database and Node 22+.
// Temporarily changes a sample role permission and restores it after checking persistence.
// Run after npm run build and INZIRA_DEMO=1 npm start. Uses Chromium; CHROME_PATH overrides it.
// Screenshots and JSON results are written to /tmp. This does not replace screen-reader testing.
import { reviewClientRecovery } from "./lib/client-recovery-review.mjs";
import { reviewSeo } from "./lib/seo-review.mjs";
import { reviewAccessibility } from "./lib/accessibility-review.mjs";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = (process.argv.slice(2).find(arg => !arg.startsWith("--")) ?? "http://localhost:3000").replace(/\/$/, "");
const port = Number(process.env.UI_REVIEW_PORT ?? 9340);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("UI_REVIEW_PORT must be a port between 1024 and 65535");
const chromePath = process.env.CHROME_PATH ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync);
if (!chromePath) { console.error("Chrome not found. Set CHROME_PATH to the browser binary."); process.exit(2); }
if (typeof WebSocket === "undefined") { console.error("This script needs Node 22 or newer."); process.exit(2); }

const work = mkdtempSync(join(tmpdir(), "inzira-flows-"));
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
if (!process.argv.includes('--seo')) try { const response = await fetch(base); if (!response.ok || !(await response.text()).includes('class="demo-notice"')) throw new Error(); } catch { console.error(`Start a demo server at ${base}. UI review requires sample accounts and never runs against a live production site.`); stop(2); }


async function page(width = 1280) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(15000) })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("could not open a browser tab")), 15000); });
  let id = 0; const pending = new Map();
  const issues = {errors: [], warnings: []};
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") issues.errors.push(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text);
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) issues[d.params.type === "error" ? "errors" : "warnings"].push(d.params.args.map(a=>a.value ?? a.description ?? "").join(" ").slice(0,500));
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
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
    send, ev, issues,
    async go(path) { issues.errors.length = 0; issues.warnings.length = 0; await send("Page.navigate", { url: base + path }); await sleep(1500); await ev(HELP); },
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
  const url = "/sign-in";
  // A signed-out visit already put the page they wanted in ?next=. Keep it.
  const search = await p.ev("location.search").catch(() => "");
  const path = await p.ev("location.pathname").catch(() => "");
  // A staff page sends a signed-out visitor to /staff; the demo staff have no password, so they use the code form, keeping the page.
  if (path === "/staff" && String(search).includes("next=")) await p.go("/sign-in" + search);
  else if (!(path === "/sign-in" && String(search).includes("next="))) await p.go(url);
  if ((await p.ev("location.pathname")) !== "/sign-in") { await signOut(p); await p.go(url); }
  await p.set("#si-contact", who); await p.click("Send me a code"); await waitCode(p);
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
  await waitPath(p, (path) => path === "/sign-in" || path === "/staff");
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
const audit = [];
async function review(p, path, widths = [360, 390, 768, 1024, 1440]) {
  await p.go(path);
  for (const width of widths) {
    await p.send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 700 });
    await p.send("Emulation.setEmulatedMedia", {features: [{name: "prefers-reduced-motion", value: "reduce"}]});
    await sleep(250);
    const result = await p.ev(`(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);
      const unlabeled = controls.filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map(el => el.id || el.outerHTML.slice(0,100));
      const buttons = [...document.querySelectorAll('button')].filter(visible).filter(el => !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).map(el => el.outerHTML.slice(0,140));
      const recordCells = [...document.querySelectorAll('.responsive-records tbody td')].filter(visible);
      const readableRecords = innerWidth > 1100 || recordCells.every(el => el.dataset.label && getComputedStyle(el).display === 'grid');
      const consent = document.querySelector('#pay-agree')?.closest('label'), pay = document.querySelector('[data-pay]');
      const consentOrder = !consent || !pay || pay.getBoundingClientRect().top >= consent.getBoundingClientRect().bottom;
      return {readableRecords, consentOrder, path: location.pathname, title: document.title, overflow: document.documentElement.scrollWidth > innerWidth + 1, main: document.querySelectorAll('main').length, unlabeled, buttons};
    })()`);
    result.wrongRoute = /^\/(portal|console|admin)(\/|$)/.test(path) && result.path !== path;
    audit.push({requested:path,width,...result, errors: [...p.issues.errors], warnings: [...p.issues.warnings]});
    if ([390,1440].includes(width) || (width === 768 && ['/en','/en/services','/portal','/console/overview'].includes(path))) {
      await p.ev(`Promise.all([...document.images].map(img => { img.loading = 'eager'; return img.decode().catch(() => null); })).then(() => true)`);
      const metrics = await p.send('Page.getLayoutMetrics');
      const size = metrics.result.cssContentSize ?? metrics.result.contentSize;
      const shot = await p.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:width,height:Math.min(12000,size.height),scale:1}});
      writeFileSync('/tmp/inzira-ui-'+path.replaceAll('/','_')+'-'+width+'.png',Buffer.from(shot.result.data,'base64'));
    }
    console.log(JSON.stringify(audit.at(-1)));
  }
}
try {
 const p=await page();
 if (process.argv.includes('--client-recovery')) {
   const result = await reviewClientRecovery({p, base});
   writeFileSync('/tmp/inzira-client-recovery-ui.json', JSON.stringify(result,null,2));
   console.log('CLIENT_RECOVERY_UI', JSON.stringify({passed:result.passed,pages:result.pages.length,serviceRoutes:result.serviceRoutes,mutations:result.mutations,favicon:result.favicon}));
   await p.close(); stop(result.passed ? 0 : 1);
 }
 if (process.argv.includes('--privacy')) {
   await signIn(p, 'admin@inzira.test');
   await p.go('/console/overview');
   const metrics = () => p.ev(`Array.from(document.querySelectorAll('.c-history-band dd')).map(x => x.textContent)`);
   const before = await metrics();
   if (before.length !== 4) throw new Error('Lifetime income and case metrics are missing');
   await p.click('Manage a justified retention exception', 'summary');
   await p.set('.c-retention-controls input', 'INZ-2026-04764');
   await p.set('.c-retention-controls label:nth-of-type(2) select', 'dispute');
   await p.set('.c-retention-controls label:nth-of-type(3) select', '7');
   await p.click('Save exception', 'button');
   await waitFor(p, 'Retention hold saved.');
   const held = await p.has('Retention hold saved.') && await p.has('On hold');
   if (!held) throw new Error('Retention hold did not save or appear in the queue');
   await p.set('.c-retention-controls label:nth-of-type(3) select', '0');
   await p.click('Save exception', 'button');
   await waitFor(p, 'Hold released.');
   const released = await p.has('Hold released.');
   if (!released || JSON.stringify(before) !== JSON.stringify(await metrics())) throw new Error('Hold controls changed reporting or failed to release');
   await p.click('90 days', 'a');
   await waitFor(p, 'Last 90 days');
   const rangeWorks = (await p.ev('location.search')).includes('90') && await p.has('Last 90 days');
   if (!rangeWorks) throw new Error('Reporting period did not change');
   await p.go('/console/requests/INZ-2026-03390');
   const archived = await p.has('Case details removed') && await p.ev(`!document.querySelector('textarea') && [...document.querySelectorAll('input[type=file]')].every(x => x.closest('.c-archived-finance'))`);
   if (!archived) throw new Error('Archived case exposes operational controls or did not render its archive state');
   const receiptFile = '/tmp/inzira-privacy-financial-receipt.pdf';
   writeFileSync(receiptFile, '%PDF-1.4\n% Synthetic financial receipt fixture, no real payment.\n%%EOF\n');
   const documentNode = await p.send('DOM.getDocument');
   const fileNode = await p.send('DOM.querySelector', {nodeId: documentNode.result.root.nodeId, selector: '.c-archived-finance input[type=file]'});
   await p.send('DOM.setFileInputFiles', {nodeId: fileNode.result.nodeId, files: [receiptFile]});
   await p.click('Attach financial receipt', 'button');
   await waitFor(p, 'Financial receipt attached');
   const receiptAttached = await p.has('Financial receipt attached') && await p.has('Financial receipt 1');
   if (!receiptAttached) throw new Error('Financial-only receipt upload failed on the archived case');
   const evidenceReadable = await p.ev(`(async () => { const a = [...document.querySelectorAll('a')].find(x => x.textContent.includes('Financial receipt 1')); return a && (await fetch(a.href)).status === 200; })()`);
   if (!evidenceReadable) throw new Error('Authorized financial evidence cannot be read');
   rmSync(receiptFile, {force: true});
   await p.click('View financial record', 'a');
   await waitPath(p, path => path.endsWith('/receipt'));
   const receiptWorks = await p.ev(`location.pathname.endsWith('/receipt') && !!document.querySelector('.receipt')`);
   if (!receiptWorks) throw new Error('Retained financial record is unavailable');
   await review(p, '/console/overview');
   await p.go('/en/services');
   await sleep(1500);
   const english = await p.ev(`document.documentElement.lang === 'en'`);
   if (!english || p.issues.errors.length) throw new Error('English routing or public prefetch still fails');
   const result = {held, released, rangeWorks, archived, receiptWorks, receiptAttached, evidenceReadable, english, lifetimeMetricsStable: true, responsiveChecks: audit};
   writeFileSync('/tmp/inzira-privacy-ui.json', JSON.stringify(result, null, 2));
   console.log('PRIVACY_UI', JSON.stringify({...result, responsiveChecks: audit.length}));
   const bad = audit.some(r => r.overflow || r.unlabeled.length || r.buttons.length || r.errors.length || r.wrongRoute);
   await p.close(); stop(bad ? 1 : 0);
 }
 if (process.argv.includes('--seo')) {
   const result=await reviewSeo({p,base,expectedIndexable:process.argv.includes('--seo-indexable'),expectedOrigin:process.env.SEO_EXPECTED_ORIGIN,sourceHtml:process.argv.includes("--seo-html")});
   writeFileSync('/tmp/inzira-seo-audit.json',JSON.stringify(result,null,2));
   writeFileSync('/tmp/inzira-seo-'+(result.expectedIndexable?'production':process.argv.includes('--seo-html')?'staging':'demo')+'-audit.json',JSON.stringify(result,null,2));
   console.log('SEO_REVIEW',JSON.stringify({pages:result.pages.length,checkedLinks:result.checkedLinks,failures:result.failures,passed:result.passed}));
   await p.close(); stop(result.passed?0:1);
 }
 if (process.argv.includes('--accessibility')) {
   const result = await reviewAccessibility({p,signIn,signOut,sleep});
   writeFileSync('/tmp/inzira-accessibility.json', JSON.stringify(result, null, 2));
   console.log('ACCESSIBILITY', JSON.stringify({cases:result.pages.length,errorAnnouncement:result.errorAnnouncement,modalSemantics:result.modalSemantics,passed:result.passed}));
   await p.close(); stop(result.passed ? 0 : 1);
 }
 if (process.argv.includes('--cancellation')) {
   await signIn(p,'aline.uwase@example.com');
   await p.go('/start/ebm-training');
   await p.ev(`document.querySelector('[data-via=email] input').click(); true`);
   await p.set('#f-name','Aline Uwase'); await p.set('#f-email','aline.uwase@example.com');
   await p.click('Continue'); await sleep(300);
   await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click(); true`);
   await p.click('Continue to payment');
   await waitPath(p,path=>/^\/portal\/requests\/INZ-\d{4}-\d{5}\/pay$/.test(path),120);
   const req = (await p.ev('location.pathname')).split('/')[3];
   if (!/^INZ-\d{4}-\d{5}$/.test(req ?? '')) throw new Error('Signed-in cancellation fixture was not created');
   await p.go(`/portal/requests/${req}`);
   await p.click('Cancel this request','summary'); await p.click('Cancel request','button');
   await waitFor(p,'Cancelled by you');
   const immediate = await p.ev(`({cancelled: __t.has('Cancelled by you'), paymentTitle: __t.has('Pay to send your request'), banner: document.querySelector('.banner')?.innerText, errors: [...document.querySelectorAll('[role=alert]')].map(el=>el.innerText)})`);
   await p.go(`/portal/requests/${req}`);
   const afterReload = await p.ev(`({cancelled: __t.has('Cancelled by you'), paymentTitle: __t.has('Pay to send your request'), banner: document.querySelector('.banner')?.innerText, canPay: !!document.querySelector('#payments a[href$="/pay"]')})`);
   await p.go(`/portal/requests/${req}/pay`);
   const closedCheckoutRedirect = (await p.ev('location.pathname')) === `/portal/requests/${req}`;
   console.log('CANCELLATION',JSON.stringify({immediate,afterReload,closedCheckoutRedirect}));
   await p.close(); stop(immediate.cancelled && !immediate.paymentTitle && afterReload.cancelled && !afterReload.paymentTitle && !afterReload.canPay && closedCheckoutRedirect ? 0 : 1);
 }
 if (process.argv.includes('--payment-unavailable')) {
   await signIn(p,'aline.uwase@example.com');
   await p.go('/portal/requests/INZ-2026-04761/pay');
   const unavailable = await p.has('Online payments are not available yet') && await p.has('Your request is saved') && !(await p.ev(`!!document.querySelector('[data-pay]')`));
   await p.go('/portal/requests/INZ-2026-04761');
   const preserved = await p.has('Review and pay RWF 20,000');
   writeFileSync('/tmp/inzira-payment-unavailable.json',JSON.stringify({unavailable,preserved},null,2));
   console.log('PAYMENT_UNAVAILABLE',JSON.stringify({unavailable,preserved}));
   await p.close(); stop(unavailable && preserved ? 0 : 1);
 }
 for(const path of ['/en','/en/services','/en/services/company-registration','/en/services/birth-certificate','/en/about','/en/privacy','/en/terms','/start','/start/company-registration','/track','/sign-in','/staff','/staff/set-password','/staff/unlock','/r/MISSING','/does-not-exist']) await review(p,path);
 // A real disposable request lets the visual review inspect private pages with their working access cookie.
 await p.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await p.go('/start/land-spouse-update');
 await p.ev(`document.querySelector('[data-via=email] input').click(); true`);
 await p.set('#f-name','Visual Review'); await p.set('#f-email','visual.review@example.com');
 await p.set('#f-nid','1 1995 8 0045123 0 17');
 await p.click('Add a spouse after marriage','label'); await p.click('Continue'); await sleep(300);
 await p.ev(`document.querySelector('input[aria-describedby="ack-err"]').click(); true`);
 await p.click('Continue to payment');
 await waitPath(p,path=>/^\/r\/INZ-\d{4}-\d{5}\/pay$/.test(path),120);
 const privateRef = (await p.ev('location.pathname')).split('/')[2];
 if (!/^INZ-\d{4}-\d{5}$/.test(privateRef ?? '')) throw new Error('Private visual-review request was not created');
 await p.go(`/r/${privateRef}`);
 if (await p.ev(`!!document.querySelector('[data-link-gate]')`) || !(await p.has('Add or remove a spouse in the land register'))) throw new Error('Private review opened a gate instead of the created request');
 for(const path of [`/r/${privateRef}`,`/r/${privateRef}/pay`,`/r/${privateRef}/receipt`,`/r/${privateRef}/save`]) await review(p,path);
 await signIn(p,'aline.uwase@example.com');
 for(const path of ['/portal','/portal/requests','/portal/documents','/portal/account','/portal/requests/INZ-2026-04817','/portal/requests/INZ-2026-04761/pay','/portal/requests/INZ-2026-04761/receipt']) await review(p,path);
 await signOut(p); await signIn(p,'admin@inzira.test');
 for(const path of ['/console/overview','/console/my-day','/console/requests','/console/requests/INZ-2026-04817','/console/clients','/console/clients/p-aline','/console/intake','/console/inbox','/console/taxes','/console/identity','/console/security','/admin/services','/admin/categories','/admin/content','/admin/content/replace','/admin/content/service/company-registration','/console/requests/INZ-2026-04761/receipt','/admin/payments','/admin/roles','/admin/audit','/admin/system']) await review(p,path);
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
 await p.go('/admin/roles'); await p.click('Finance','button'); await sleep(200);
 const roleBefore = await p.ev(`document.querySelector('.role-mobile-permissions input').checked`);
 await p.ev(`document.querySelector('.role-mobile-permissions input').click(); true`);
 await p.click('Save permissions','button'); await waitFor(p,'Permissions saved');
 const roleSaved = await p.has('Permissions saved');
 await p.go('/admin/roles'); await p.click('Finance','button'); await sleep(200);
 const rolePersisted = await p.ev(`document.querySelector('.role-mobile-permissions input').checked`) !== roleBefore;
 await p.ev(`document.querySelector('.role-mobile-permissions input').click(); true`);
 await p.click('Save permissions','button'); await waitFor(p,'Permissions saved');
 const roleRestored = await p.has('Permissions saved');
 const mobileRoles = roleSaved && rolePersisted && roleRestored;
 console.log('MOBILE_ROLE_PERSISTENCE',mobileRoles);
 await p.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await p.go('/console/overview');await p.click('New','button');await p.click('Add new client','button');await sleep(300);
 const focused=await p.ev(`document.querySelector('[role=dialog]')?.contains(document.activeElement)`);
 for(let i=0;i<18;i++) await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 const contained=await p.ev(`document.querySelector('[role=dialog]')?.contains(document.activeElement)`);
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await sleep(200);
 const closed=await p.ev(`!document.querySelector('[role=dialog]') && document.body.style.overflow !== 'hidden'`);
 console.log('DIALOG',JSON.stringify({focused,contained,closed}));
 await p.click('New','button'); await p.click('Record payment by hand','button'); await sleep(200);
 const paymentLabels = await p.ev(`([...document.querySelectorAll('[role=dialog] input,[role=dialog] select,[role=dialog] textarea')].filter(el=>el.type !== 'hidden')).every(el=>el.labels?.length || el.getAttribute('aria-label'))`);
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 console.log('PAYMENT_FORM_LABELS', paymentLabels);
 await p.go('/console/requests'); await p.click('Save view','button');
 await p.ev(`__t.set(document.querySelector('[role=dialog] input').id ? '#' + CSS.escape(document.querySelector('[role=dialog] input').id) : '[role=dialog] input', 'Offline review')`);
 await p.send('Network.setBlockedURLs',{urls:[base+'/console/requests']});
 await p.ev(`document.querySelector('[role=dialog] button[type=submit]').click(); true`);
 for(let i=0;i<40 && !(await p.ev(`!!document.querySelector('[role=dialog] [role=alert]')`));i++) await sleep(250);
 const saveFailure = await p.ev(`!!document.querySelector('[role=dialog] [role=alert]') && document.querySelector('[role=dialog] input')?.value === 'Offline review' && !document.querySelector('[role=dialog] button[type=submit]')?.disabled`);
 await p.send('Network.setBlockedURLs',{urls:[]});
 await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await p.go('/console/overview'); await p.click('Search requests, clients and references','button');
 await p.send('Network.setBlockedURLs',{urls:[base+'/console/overview']});
 await p.set('input[aria-label="Search requests, clients and services"]','company');
 for(let i=0;i<40 && !(await p.ev(`!!document.querySelector('[role=dialog] [role=alert]')`));i++) await sleep(250);
 const searchFailure = await p.ev(`!!document.querySelector('[role=dialog] [role=alert]') && [...document.querySelectorAll('[role=dialog] button')].some(b=>b.textContent.includes('Try search again'))`);
 await p.send('Network.setBlockedURLs',{urls:[]});
 await p.click('Try search again','button');
 for(let i=0;i<40 && !(await p.ev(`!!document.querySelector('[role=dialog] a')`));i++) await sleep(250);
 const searchRecovery = await p.ev(`!!document.querySelector('[role=dialog] a') && !document.querySelector('[role=dialog] [role=alert]')`);
 console.log('NETWORK_RECOVERY',JSON.stringify({saveFailure,searchFailure,searchRecovery}));


 writeFileSync('/tmp/inzira-ui-audit.json',JSON.stringify({pages:audit,dialog:{focused,contained,closed,paymentLabels},network:{saveFailure,searchFailure,searchRecovery},mobileRoles},null,2));
 console.log("UI review report: /tmp/inzira-ui-audit.json; screenshots: /tmp/inzira-ui-*.png");
 await p.close(); stop(audit.some(r=>!r.readableRecords||!r.consentOrder||r.overflow||r.main!==1||r.unlabeled.length||r.buttons.length||r.wrongRoute||r.errors.length)||!focused||!contained||!closed||!paymentLabels||!saveFailure||!searchFailure||!searchRecovery||!mobileRoles?1:0);
} catch(e) { console.error(e);writeFileSync('/tmp/inzira-ui-audit.json',JSON.stringify(audit,null,2));stop(1); }
