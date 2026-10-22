/** Dump display copy from the catalogue so it can be translated without touching stored English. */
import { writeFileSync } from "node:fs";
import { CATEGORIES, SERVICES } from "../lib/mock/catalogue";
import { OFFICES } from "../lib/institutions";
import { shortTime } from "../lib/format";

const services: Record<string, unknown> = {};
for (const s of SERVICES) {
  services[s.slug] = {
    name: s.name,
    ...(s.aka ? { aka: s.aka } : {}),
    ...(s.tagline ? { tagline: s.tagline } : {}),
    summary: s.summary,
    authority: s.authority,
    channel: s.channel,
    via: s.via,
    time: s.time,
    timeShort: shortTime(s.time),
    docsShort: s.docsShort,
    who: s.who.map((w) => ({ title: w.title, body: w.body })),
    requirements: s.requirements,
    documents: s.documents.map((d) => ({ name: d.name, detail: d.detail })),
    steps: s.steps.map((st) => ({ title: st.title, body: st.body })),
    notes: s.notes.map((n) => ({ title: n.title, body: n.body })),
    officialNote: s.official.note,
    ...(s.purposeLabel ? { purposeLabel: s.purposeLabel } : {}),
    ...(s.purposes ? { purposes: s.purposes } : {}),
    ...(s.questions?.length ? { questions: s.questions.map((q) => ({ label: q.label, ...(q.hint ? { hint: q.hint } : {}), ...(q.placeholder ? { placeholder: q.placeholder } : {}) })) } : {}),
    ...(s.stageLabels ? { stageLabels: s.stageLabels } : {}),
  };
}

const out = {
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, { name: c.name, short: c.short, desc: c.desc }])),
  offices: Object.fromEntries(OFFICES.map((o) => [o.code, { name: o.name, area: o.area, does: o.does }])),
  services,
  units: {
    "per year": "per year",
    "per month": "per month",
    "per UPI, per year": "per UPI, per year",
  },
  officialPhrases: {
    None: "None",
    Free: "Free",
    "To be confirmed": "To be confirmed",
    "Paid by you directly": "Paid by you directly",
    "Tax as assessed": "Tax as assessed",
    "tax due": "tax due",
    "official fee": "official fee",
  },
};

writeFileSync(new URL("../lib/i18n/catalogue-en.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`services ${Object.keys(services).length}`);
