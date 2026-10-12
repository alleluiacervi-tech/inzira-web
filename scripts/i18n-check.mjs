// Checks the two message files against each other, so a missing or broken translation fails CI
// instead of showing a raw key to a customer:
// - every key exists in both languages, with the same {placeholders};
// - SMS texts use only the GSM-7 alphabet (one character outside it makes the SMS UCS-2: 70
//   characters a segment instead of 160) and stay within two segments with typical values.
import { readFileSync } from "node:fs";

const load = (l) => JSON.parse(readFileSync(new URL(`../lib/i18n/${l}.json`, import.meta.url), "utf8"));
const en = load("en"), rw = load("rw");

function leaves(node, path = "", out = new Map()) {
  if (typeof node === "string") out.set(path, node);
  else if (Array.isArray(node)) node.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}
const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

const problems = [];
const E = leaves(en), R = leaves(rw);
for (const k of E.keys()) if (!R.has(k)) problems.push(`rw.json is missing ${k}`);
for (const k of R.keys()) if (!E.has(k)) problems.push(`en.json is missing ${k} (only in rw.json)`);
for (const [k, v] of E) {
  if (!R.has(k)) continue;
  if (placeholders(v) !== placeholders(R.get(k))) problems.push(`${k}: placeholders differ (en {${placeholders(v)}}, rw {${placeholders(R.get(k))}})`);
}

// GSM 03.38 basic set plus the extension table (each extension character costs two).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXT = "^{}\\[~]|€";
// Typical values: a long service name, a reference, the site address, amounts.
const SAMPLE = { ref: "INZ-2026-04817", code: "123456", url: "https://inzira.rw", service: "Change of company details on RDB", doc: "National ID copy", stage: "With the institution",
  amount: "RWF 120,000", official: "RWF 12,000", officialText: "official RWF 12,000", ours: "RWF 15,000", total: "RWF 27,000", date: "12 Oct 2026", n: 3, name: "Aline", agent: "Jean Bosco", message: "Please bring the original lease.", why: "Customer asked to stop.", channel: "Irembo", receipt: "INV-2026-0042" };
const PREFIX = "Inzira INZ-2026-04817: ";
for (const [locale, all] of [["en", E], ["rw", R]]) {
  for (const [k, v] of all) {
    if (!k.startsWith("sms.")) continue;
    const bad = [...new Set([...v.replace(/\{\w+\}/g, "")].filter((c) => !GSM.includes(c) && !EXT.includes(c)))];
    if (bad.length) problems.push(`${locale} ${k}: not GSM-7 (${bad.map((c) => JSON.stringify(c)).join(" ")})`);
    const filled = PREFIX + v.replace(/\{(\w+)\}/g, (_, n) => String(SAMPLE[n] ?? "x".repeat(20)));
    const units = [...filled].reduce((n, c) => n + (EXT.includes(c) ? 2 : 1), 0);
    if (units > 306) problems.push(`${locale} ${k}: about ${units} characters with typical values, more than two SMS`);
  }
}

if (problems.length) {
  console.error(`i18n check: ${problems.length} problem(s)\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`i18n check: ${E.size} keys in both languages, SMS texts are GSM-7 and within two segments.`);
