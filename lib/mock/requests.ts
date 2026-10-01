// Seed requests for the prototype. Each one is a single record that the customer portal,
// the agent workspace and the admin console all read (through lib/repo.ts).
// Official amounts recorded on these cases are examples, like everything in lib/mock.
import type { AuditEntry, Billing, Notification, PayMethod, Request, RequestDoc, Transaction } from "../types";
import { SERVICES } from "./catalogue";

const t = (monthDay: string, time = "09:00") => `2026-${monthDay}T${time}:00+02:00`;
const svc = (slug: string) => SERVICES.find((s) => s.slug === slug)!;
const paid = (receipt: string, at: string, method: PayMethod, official: number, ours: number, status: Transaction["status"] = "paid"): Transaction =>
  ({ receipt, at, method, official, ours, status });

/** Billing that starts from the catalogue price of the service. */
function bill(slug: string, invoice: string, over: Partial<Billing> = {}): Billing {
  const s = svc(slug);
  return {
    invoice, official: s.official.mode ? null : s.official.amount, officialMode: s.official.mode,
    officialLabel: s.official.mode === "none" ? "Official fee" : `${s.official.label ?? "Official fee"} · ${s.channel}`,
    ours: s.ours, oursStandard: s.ours, oursUnit: s.oursUnit,
    quote: "approved", officialReceipt: s.official.amount ? "attached" : "na", transactions: [], ...over,
  };
}
/** The service's document checklist, with the state of each document on this request. */
function docs(slug: string, ref: string, state: Partial<RequestDoc>[] = []): RequestDoc[] {
  return svc(slug).documents.map((d, i) => ({ id: `${ref}-d${i + 1}`, name: d.name, group: d.group, required: d.required, status: "required", ...state[i] }));
}
const ok = (name: string, size: string, at: string, by: string): Pick<RequestDoc, "status" | "file" | "reviewedAt" | "reviewedBy"> =>
  ({ status: "approved", file: { name, size, uploadedAt: at }, reviewedAt: at, reviewedBy: by });

export const REQUESTS: Request[] = [
  // ---------- Aline Uwase's account ----------
  {
    ref: "INZ-2026-04817", serviceSlug: "e-title", profileId: "p-aline", agentId: "s-patrick", openedAt: t("09-27", "14:10"),
    stage: "institution", stageDates: { received: t("09-27", "14:10"), checking: t("09-27", "15:00"), preparing: t("09-27", "16:30"), institution: t("09-28", "15:20") },
    hold: { reason: "document", returned: true, since: t("09-30", "10:05"), title: "We need a clearer ID photo", detail: "Irembo returned your e-title application: the ID photo (front) is too blurry to read the ID number. Please upload a sharper photo — it takes a minute." },
    channel: "Irembo", officialRef: "1240 8876 3321",
    summary: { title: "With the land administration — nothing needed from you", body: "Patrick will message you as soon as your e-title is issued." },
    next: "Upload a clearer photo of your ID (front). Patrick can’t read the ID number.",
    billing: bill("e-title", "INZ-R-22190", { officialLabel: "Irembo fee · you pay the Irembo bill", transactions: [paid("INZ-R-22190", t("09-27", "16:02"), "MTN MoMo", 0, 2000)] }),
    documents: [
      { id: "INZ-2026-04817-d1", name: "National ID — front", group: "Identification", required: true, status: "rejected", file: { name: "id_front.jpg", size: "1.4 MB", uploadedAt: t("09-27", "14:12") }, note: "Too blurry to read · returned by Irembo", reviewedAt: t("09-30", "10:05"), reviewedBy: "s-patrick" },
      { id: "INZ-2026-04817-d2", name: "National ID — back", group: "Identification", required: true, ...ok("id_back.jpg", "1.1 MB", t("09-27", "15:00"), "s-patrick") },
      { id: "INZ-2026-04817-d3", name: "UPI or old land title", group: "Land documents", required: true, ...ok("title_kacyiru.jpg", "2.0 MB", t("09-27", "15:00"), "s-patrick") },
    ],
    deliverables: [],
    messages: [{ id: "m1", at: t("09-30", "10:05"), by: "s-patrick", body: "Mwaramutse Aline — Irembo couldn’t read the ID number on the front photo. Could you retake it in daylight, without flash?" }],
    events: [
      { at: t("09-30", "10:05"), title: "Returned by Irembo", by: "s-patrick", body: "Clearer ID photo needed." },
      { at: t("09-28", "15:20"), title: "Submitted via Irembo", by: "s-patrick", body: "Irembo application no. 1240 8876 3321" },
      { at: t("09-27", "16:02"), title: "Payment received", by: "system", body: "RWF 2,000 assistance fee" },
      { at: t("09-27", "15:00"), title: "Documents checked", by: "s-patrick" },
      { at: t("09-27", "14:10"), title: "Request opened", by: "customer" },
    ],
    notes: [
      { id: "n1", at: t("09-28", "15:20"), by: "s-patrick", body: "Submitted on Irembo, app no. 1240 8876 3321. Customer paid the Irembo bill herself." },
      { id: "n2", at: t("09-30", "10:05"), by: "s-patrick", body: "Irembo returned: ID front unreadable. Asked customer for a new photo via WhatsApp + portal." },
    ],
    followUp: { at: t("09-30", "15:00"), what: "Check for the new ID photo" },
  },
  {
    ref: "INZ-2026-04802", serviceSlug: "company-registration", profileId: "p-umucyo", agentId: "s-grace", openedAt: t("09-21", "10:30"),
    stage: "institution", stageDates: { received: t("09-21", "10:30"), checking: t("09-22", "09:15"), preparing: t("09-23", "11:00"), institution: t("09-30", "09:40") },
    channel: "RDB online registration", officialRef: "RDB-APP-778120",
    summary: { title: "With RDB now — nothing needed from you", body: "RDB usually decides within 1–2 working days. Grace will follow up tomorrow at 10:00 and message you as soon as the certificate is issued. Your EBM request starts automatically after that." },
    next: "RDB is reviewing. Usually 1–2 working days. We’ll message you.",
    billing: bill("company-registration", "INZ-R-22104", { official: 0, officialLabel: "RDB registration fee", transactions: [paid("INZ-R-22104", t("09-22", "12:30"), "MTN MoMo", 0, 10000)] }),
    documents: [
      { id: "INZ-2026-04802-d1", name: "National ID — Aline Uwase (director, 60%)", group: "Identification", required: true, ...ok("id_aline.jpg", "1.2 MB", t("09-22", "09:15"), "s-grace") },
      { id: "INZ-2026-04802-d2", name: "National ID — Yves Mutabazi (shareholder, 40%)", group: "Identification", required: true, ...ok("id_yves.pdf", "890 KB", t("09-22", "09:15"), "s-grace") },
      { id: "INZ-2026-04802-d3", name: "Proof of company address", group: "Business documents", required: true, ...ok("lease_kacyiru.pdf", "2.3 MB", t("09-22", "09:20"), "s-grace") },
      { id: "INZ-2026-04802-d4", name: "Articles of association (signed)", group: "Business documents", required: true, ...ok("articles_umucyo.pdf", "420 KB", t("09-28", "12:10"), "s-grace") },
    ],
    deliverables: [{ id: "INZ-2026-04802-o1", name: "Name reservation confirmation", issuedAt: t("09-21", "16:00"), issuedBy: "RDB" }],
    messages: [
      { id: "m1", at: t("09-28", "11:15"), by: "s-grace", body: "I’ve prepared the articles of association for Umucyo Tech Ltd — please review the shareholder split (60/40) before I submit." },
      { id: "m2", at: t("09-28", "12:02"), by: "customer", body: "Looks right. Please go ahead." },
      { id: "m3", at: t("09-30", "09:41"), by: "s-grace", body: "Submitted to RDB this morning. Official ref RDB-APP-778120. I’ll check again tomorrow at 10:00." },
    ],
    events: [
      { at: t("09-30", "09:40"), title: "Submitted to RDB", by: "s-grace", body: "Official ref RDB-APP-778120" },
      { at: t("09-28", "12:10"), title: "Articles of association signed", by: "customer" },
      { at: t("09-22", "12:30"), title: "Payment received", by: "system", body: "RWF 10,000" },
      { at: t("09-22", "09:20"), title: "Documents approved", by: "s-grace" },
      { at: t("09-21", "10:30"), title: "Request opened", by: "customer" },
    ],
    notes: [{ id: "n1", at: t("09-30", "09:42"), by: "s-grace", body: "Submitted on the RDB portal. Name reservation is valid until 21 Oct." }],
    followUp: { at: t("10-01", "10:00"), what: "Check RDB decision · RDB-APP-778120" },
  },
  {
    ref: "INZ-2026-04761", serviceSlug: "ebm-installation", profileId: "p-umucyo", agentId: "s-eric", openedAt: t("09-21", "10:35"),
    stage: "preparing", stageDates: { received: t("09-21", "10:35"), checking: t("09-22", "09:20"), preparing: t("09-22", "14:00") },
    channel: "RRA EBM", dependsOn: "INZ-2026-04802",
    summary: { title: "Waiting for your company registration", body: "The EBM is requested with the company’s TIN, which comes with the RDB registration. Eric will request it as soon as the certificate is issued. You can pay now or later." },
    next: "Starts automatically once the company is registered.",
    billing: bill("ebm-installation", "INZ-R-22107", { official: 0, officialLabel: "RRA software EBM", quote: "confirmed" }),
    documents: [
      { id: "INZ-2026-04761-d1", name: "TIN certificate", group: "Tax documents", required: true, status: "required", note: "Will be added from INZ-2026-04802" },
      { id: "INZ-2026-04761-d2", name: "Product & price list", group: "Business documents", required: false, status: "required", note: "Optional — helps us set up your products" },
    ],
    deliverables: [], messages: [],
    events: [
      { at: t("09-22", "14:00"), title: "Preparation started", by: "s-eric", body: "Waiting for the company registration from INZ-2026-04802." },
      { at: t("09-21", "10:35"), title: "Request opened", by: "customer" },
    ],
    notes: [{ id: "n1", at: t("09-22", "14:00"), by: "s-eric", body: "Software EBM on one laptop. Customer agreed no physical device for now." }],
  },
  {
    ref: "INZ-2026-04112", serviceSlug: "property-tax-declaration", title: "Property tax declaration · 2 plots", profileId: "p-aline", agentId: "s-claudine", openedAt: t("08-31", "09:20"),
    stage: "completed", stageDates: { received: t("08-31", "09:20"), checking: t("08-31", "10:00"), preparing: t("08-31", "11:30"), institution: t("09-01", "14:00"), completed: t("09-02", "10:15") },
    channel: "RRA e-Tax",
    summary: { title: "Completed", body: "Both declarations were filed with RRA. You paid the property tax directly to RRA." }, next: "Filed 1 Sep.",
    billing: bill("property-tax-declaration", "INZ-R-21877", { ours: 2000, oursStandard: 2000, oursUnit: undefined, oursNote: "2 UPIs × RWF 1,000", officialLabel: "Property tax · paid by you to RRA", transactions: [paid("INZ-R-21877", t("08-31", "11:40"), "MTN MoMo", 0, 2000)] }),
    documents: docs("property-tax-declaration", "INZ-2026-04112", [ok("tin_aline.pdf", "240 KB", t("08-31", "10:00"), "s-claudine"), ok("upis.jpg", "1.6 MB", t("08-31", "10:00"), "s-claudine")]),
    deliverables: [{ id: "INZ-2026-04112-o1", name: "Property tax declarations · 2 UPIs", issuedAt: t("09-02", "10:15"), issuedBy: "RRA" }],
    messages: [],
    events: [{ at: t("09-02", "10:15"), title: "Filing confirmations delivered", by: "s-claudine" }, { at: t("09-01", "14:00"), title: "Filed with RRA", by: "s-claudine" }, { at: t("08-31", "09:20"), title: "Request opened", by: "customer" }],
    notes: [],
  },
  {
    ref: "INZ-2026-03390", serviceSlug: "property-tax-tin", profileId: "p-aline", agentId: "s-claudine", openedAt: t("08-12", "15:05"),
    stage: "completed", stageDates: { received: t("08-12", "15:05"), checking: t("08-13", "09:00"), preparing: t("08-13", "10:30"), institution: t("08-13", "11:45"), completed: t("08-14", "16:20") },
    channel: "RRA", officialRef: "RRA-REG-2026-66012",
    summary: { title: "Completed", body: "Your TIN certificate was delivered to your portal and WhatsApp." }, next: "Delivered 14 Aug.",
    billing: bill("property-tax-tin", "INZ-R-21530", { official: 0, officialLabel: "RRA TIN registration", transactions: [paid("INZ-R-21530", t("08-13", "10:40"), "MTN MoMo", 0, 5000)] }),
    documents: docs("property-tax-tin", "INZ-2026-03390", [ok("id_aline.jpg", "1.2 MB", t("08-13", "09:00"), "s-claudine"), ok("titles.jpg", "1.9 MB", t("08-13", "09:00"), "s-claudine")]),
    deliverables: [{ id: "INZ-2026-03390-o1", name: "TIN certificate — Aline Uwase", issuedAt: t("08-14", "16:20"), issuedBy: "RRA" }],
    messages: [],
    events: [{ at: t("08-14", "16:20"), title: "Certificate delivered", by: "s-claudine" }, { at: t("08-13", "11:45"), title: "Submitted to RRA", by: "s-claudine" }, { at: t("08-12", "15:05"), title: "Request opened", by: "customer" }],
    notes: [],
  },

  // ---------- other customers (seen by agents and admins) ----------
  {
    ref: "INZ-2026-04821", serviceSlug: "land-merging", profileId: "p-jc", agentId: "s-patrick", openedAt: t("09-30", "11:40"),
    stage: "received", stageDates: { received: t("09-30", "11:40") }, channel: "Irembo",
    summary: { title: "We’ve received your request", body: "Patrick will check your documents within 2 working hours and confirm the official fees before you pay anything." },
    next: "An agent checks your documents within 2 working hours.",
    billing: bill("land-merging", "INZ-R-22185", { officialLabel: "Land administration fees", quote: "estimate", officialReceipt: "awaiting" }),
    documents: docs("land-merging", "INZ-2026-04821", [{ status: "received", file: { name: "upis_bugesera.pdf", size: "1.8 MB", uploadedAt: t("09-30", "11:41") } }, { status: "received", file: { name: "id_jeanclaude.jpg", size: "1.2 MB", uploadedAt: t("09-30", "11:42") } }]),
    deliverables: [], messages: [],
    events: [{ at: t("09-30", "11:40"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-30", "11:45"), by: "s-patrick", body: "Two neighbouring plots in Bugesera, same owner. Check whether a survey plan is needed." }],
  },
  {
    ref: "INZ-2026-04790", serviceSlug: "ebm-installation", profileId: "p-kff", agentId: "s-eric", openedAt: t("09-25", "10:10"),
    stage: "checking", stageDates: { received: t("09-25", "10:10"), checking: t("09-25", "11:30") }, channel: "RRA EBM",
    summary: { title: "Eric is checking your documents", body: "We received your product and price list this morning. Eric will confirm it and then request the EBM." },
    next: "Eric is checking your product list.",
    billing: bill("ebm-installation", "INZ-R-22188", { official: 0, officialLabel: "RRA software EBM", transactions: [paid("INZ-R-22188", t("09-26", "09:50"), "Bank transfer", 0, 20000)] }),
    documents: docs("ebm-installation", "INZ-2026-04790", [ok("tin_certificate.pdf", "280 KB", t("09-25", "11:30"), "s-eric"), { status: "received", file: { name: "price_list_sept.pdf", size: "640 KB", uploadedAt: t("09-30", "11:20") } }]),
    deliverables: [],
    messages: [{ id: "m1", at: t("09-30", "11:21"), by: "customer", body: "Here is our product list. Some prices changed last week — the PDF is the latest." }],
    events: [
      { at: t("09-30", "11:20"), title: "Document uploaded", by: "customer", body: "Product & price list" },
      { at: t("09-26", "09:50"), title: "Payment received", by: "system", body: "RWF 20,000" },
      { at: t("09-25", "11:30"), title: "Document check started", by: "s-eric" },
      { at: t("09-25", "10:10"), title: "Request opened", by: "customer" },
    ],
    notes: [{ id: "n1", at: t("09-26", "10:05"), by: "s-eric", body: "Software EBM, 2 tills. They may want EBM training after installation." }],
    followUp: { at: t("09-30", "13:00"), what: "Review product & price list" },
  },
  {
    ref: "INZ-2026-04788", serviceSlug: "monthly-tax-declarations", title: "Monthly tax declarations · September 2026", profileId: "p-hope", agentId: "s-eric", openedAt: t("09-24", "08:45"),
    stage: "checking", stageDates: { received: t("09-24", "08:45"), checking: t("09-24", "10:00") }, channel: "RRA e-Tax",
    hold: { reason: "information", since: t("09-29", "14:50"), title: "We need your September payroll", detail: "We have your sales records. Please send the September payroll (names, salaries and allowances) by 10 October so we can file PAYE before the 15th." },
    summary: { title: "Preparing your September declarations", body: "Eric files before the 15th and tells you each amount to pay RRA." },
    next: "Send your September payroll by 10 Oct.",
    billing: bill("monthly-tax-declarations", "INZ-R-22181", { officialLabel: "Taxes due · paid by you to RRA", ours: 25000, officialReceipt: "awaiting", transactions: [paid("INZ-R-22181", t("09-29", "15:10"), "Airtel Money", 0, 10000)] }),
    documents: docs("monthly-tax-declarations", "INZ-2026-04788", [{}, ok("sales_sept.pdf", "1.1 MB", t("09-24", "10:00"), "s-eric")]),
    deliverables: [],
    messages: [{ id: "m1", at: t("09-29", "14:50"), by: "s-eric", body: "Mwiriwe Josiane, could you send the September payroll? I need it by the 10th to file PAYE on time." }],
    events: [
      { at: t("09-29", "15:10"), title: "Part payment received", by: "system", body: "RWF 10,000 of RWF 25,000" },
      { at: t("09-29", "14:50"), title: "Information requested", by: "s-eric", body: "September payroll" },
      { at: t("09-29", "14:47"), title: "Assistance fee changed", by: "s-jp", body: "RWF 30,000 → RWF 25,000 (school rate)" },
      { at: t("09-24", "08:45"), title: "Request opened", by: "customer" },
    ],
    notes: [{ id: "n1", at: t("09-29", "14:47"), by: "s-eric", body: "School rate approved by Jean Paul. Sales side reconciles with EBM." }],
    followUp: { at: t("09-30", "14:00"), what: "Remind: September payroll for PAYE" },
  },
  {
    ref: "INZ-2026-04779", serviceSlug: "land-spouse-update", profileId: "p-chantal", agentId: "s-patrick", openedAt: t("09-22", "13:20"),
    stage: "institution", stageDates: { received: t("09-22", "13:20"), checking: t("09-22", "15:00"), preparing: t("09-23", "10:00"), institution: t("09-29", "11:10") },
    channel: "Irembo", officialRef: "1239 5521 0874",
    summary: { title: "With the land administration", body: "Your request to add your husband to the title was submitted. Patrick will tell you if the land office asks either of you to confirm." },
    next: "Waiting for the land office.",
    billing: bill("land-spouse-update", "INZ-R-22177", { officialLabel: "Irembo fee · you pay the Irembo bill", transactions: [paid("INZ-R-22177", t("09-23", "16:30"), "MTN MoMo", 0, 5000)] }),
    documents: docs("land-spouse-update", "INZ-2026-04779", [ok("ids_couple.pdf", "2.2 MB", t("09-22", "15:00"), "s-patrick"), ok("marriage_cert.jpg", "1.4 MB", t("09-22", "15:00"), "s-patrick"), ok("title_remera.jpg", "1.7 MB", t("09-22", "15:00"), "s-patrick")]),
    deliverables: [], messages: [],
    events: [{ at: t("09-29", "11:10"), title: "Submitted via Irembo", by: "s-patrick", body: "Application no. 1239 5521 0874" }, { at: t("09-23", "16:30"), title: "Payment received", by: "system", body: "RWF 5,000" }, { at: t("09-22", "13:20"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-29", "11:12"), by: "s-patrick", body: "Purpose: add spouse after marriage. Both spouses’ IDs attached." }],
  },
  {
    ref: "INZ-2026-04770", serviceSlug: "business-amendment", profileId: "p-nyamirambo", agentId: "s-grace", openedAt: t("09-23", "09:30"),
    stage: "institution", stageDates: { received: t("09-23", "09:30"), checking: t("09-23", "11:00"), preparing: t("09-24", "09:00"), institution: t("09-25", "10:20") },
    channel: "RDB online registration", officialRef: "RDB-AMD-2026-41187",
    summary: { title: "With RDB — taking longer than usual", body: "RDB normally approves this kind of change in a few working days. Grace is calling RDB today to find out what is holding it up." },
    next: "Grace is chasing RDB about the delay.",
    billing: bill("business-amendment", "INZ-R-22141", { official: 0, officialLabel: "RDB amendment fee", transactions: [paid("INZ-R-22141", t("09-24", "09:10"), "MTN MoMo", 0, 5000)] }),
    documents: docs("business-amendment", "INZ-2026-04770", [ok("certificate_nyamirambo.pdf", "260 KB", t("09-23", "11:00"), "s-grace"), ok("resolution_new_director.pdf", "310 KB", t("09-23", "11:00"), "s-grace"), ok("id_new_director.jpg", "1.0 MB", t("09-23", "11:00"), "s-grace")]),
    deliverables: [], messages: [],
    events: [{ at: t("09-28", "10:00"), title: "Followed up with RDB", by: "s-grace", body: "No decision yet." }, { at: t("09-25", "10:20"), title: "Submitted to RDB", by: "s-grace", body: "Ref RDB-AMD-2026-41187" }, { at: t("09-23", "09:30"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-28", "10:00"), by: "s-grace", body: "New director added. RDB desk says it is in the queue; call again Wednesday." }],
    followUp: { at: t("09-30", "11:30"), what: "Call RDB about the amendment" },
  },
  {
    ref: "INZ-2026-04741", serviceSlug: "vehicle-income-tax-declaration", title: "Motor vehicle income tax · 2026", profileId: "p-musanze", agentId: "s-eric", openedAt: t("09-18", "11:00"),
    stage: "checking", stageDates: { received: t("09-18", "11:00"), checking: t("09-19", "09:00") }, channel: "RRA e-Tax",
    hold: { reason: "payment", since: t("09-26", "09:00"), title: "Payment of RWF 10,000 is overdue", detail: "Your declaration is ready. We’ll file it with RRA as soon as the assistance fee is paid." },
    summary: { title: "Ready to file", body: "Your declaration is checked and ready to send to RRA." },
    next: "Pay the assistance fee so we can file with RRA.",
    billing: bill("vehicle-income-tax-declaration", "INZ-R-22150", { officialLabel: "Vehicle income tax · paid by you to RRA", quote: "confirmed", dueAt: t("09-25", "18:00") }),
    documents: docs("vehicle-income-tax-declaration", "INZ-2026-04741", [ok("tin_cooperative.pdf", "350 KB", t("09-19", "09:00"), "s-eric"), ok("yellow_card_truck.jpg", "1.3 MB", t("09-19", "09:00"), "s-eric")]),
    deliverables: [], messages: [],
    events: [{ at: t("09-26", "09:00"), title: "Payment reminder sent", by: "system", body: "RWF 10,000 overdue" }, { at: t("09-19", "09:00"), title: "Documents approved", by: "s-eric" }, { at: t("09-18", "11:00"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-26", "09:05"), by: "s-eric", body: "One truck. Treasurer is travelling until the 30th. Reminder set." }],
    followUp: { at: t("09-30", "16:00"), what: "Payment reminder · RWF 10,000 overdue" },
  },
  {
    ref: "INZ-2026-04764", serviceSlug: "rura-vehicle-authorisation", profileId: "p-emmanuel", agentId: "s-patrick", openedAt: t("09-25", "14:00"),
    stage: "completed", stageDates: { received: t("09-25", "14:00"), checking: t("09-25", "15:00"), preparing: t("09-25", "16:00"), institution: t("09-26", "09:30"), completed: t("09-28", "11:00") },
    channel: "RURA online services", officialRef: "RURA-TR-2026-08812",
    summary: { title: "Completed", body: "The RURA authorisation was delivered to your portal and WhatsApp." }, next: "Delivered 28 Sep.",
    billing: bill("rura-vehicle-authorisation", "INZ-R-22160", { officialLabel: "RURA fee · paid by you to RURA", transactions: [paid("INZ-R-22160", t("09-25", "16:10"), "Airtel Money", 0, 5000)] }),
    documents: docs("rura-vehicle-authorisation", "INZ-2026-04764", [ok("yellow_card_taxi.jpg", "1.1 MB", t("09-25", "15:00"), "s-patrick"), ok("id_emmanuel.jpg", "980 KB", t("09-25", "15:00"), "s-patrick"), ok("insurance_inspection.pdf", "760 KB", t("09-25", "15:00"), "s-patrick")]),
    deliverables: [{ id: "INZ-2026-04764-o1", name: "RURA authorisation — taxi", issuedAt: t("09-28", "11:00"), issuedBy: "RURA" }],
    messages: [],
    events: [{ at: t("09-28", "11:00"), title: "Authorisation delivered", by: "s-patrick" }, { at: t("09-26", "09:30"), title: "Submitted to RURA", by: "s-patrick" }, { at: t("09-25", "14:00"), title: "Request opened", by: "customer" }],
    notes: [],
  },
  {
    ref: "INZ-2026-04795", serviceSlug: "irembo-training", title: "Irembo training · October 2026", profileId: "p-ubumwe", agentId: "s-olivier", openedAt: t("09-28", "10:00"),
    stage: "preparing", stageDates: { received: t("09-28", "10:00"), preparing: t("09-29", "09:30") }, channel: "Training by Inzira",
    summary: { title: "Your sessions are booked", body: "Tuesdays and Thursdays at 14:00 from 6 October, at our office. Olivier will confirm the room the day before." },
    next: "First session Tuesday 6 Oct, 14:00.",
    billing: bill("irembo-training", "INZ-R-22172", { transactions: [paid("INZ-R-22172", t("09-29", "09:20"), "MTN MoMo", 0, 50000)] }),
    documents: [], deliverables: [],
    messages: [{ id: "m1", at: t("09-29", "09:35"), by: "s-olivier", body: "Murakoze Clarisse — you and your two colleagues are booked from 6 October. Bring a laptop if you can." }],
    events: [{ at: t("09-29", "09:30"), title: "Sessions scheduled", by: "s-olivier", body: "Tue & Thu, 14:00, from 6 Oct" }, { at: t("09-29", "09:20"), title: "Payment received", by: "system", body: "RWF 50,000" }, { at: t("09-28", "10:00"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-29", "09:32"), by: "s-olivier", body: "3 people from the cyber café. Focus: land and civil-status services, bill payments." }],
  },
  {
    ref: "INZ-2026-04702", serviceSlug: "company-registration", profileId: "p-inema", agentId: "s-grace", openedAt: t("09-15", "10:00"),
    stage: "preparing", stageDates: { received: t("09-15", "10:00"), checking: t("09-15", "14:00"), preparing: t("09-16", "10:00") },
    closed: { kind: "cancelled", at: t("09-19", "15:30"), reason: "The company name was not available and the customer chose not to continue. Assistance fee refunded in full." },
    channel: "RDB online registration",
    summary: { title: "Cancelled and refunded", body: "The company name was not available and you chose not to continue. Your assistance fee was refunded in full on 19 Sep." },
    next: "Closed. Refunded 19 Sep.",
    billing: bill("company-registration", "INZ-R-22031", { official: 0, officialLabel: "RDB registration fee", transactions: [paid("INZ-R-22031", t("09-16", "10:20"), "MTN MoMo", 0, 10000, "refunded")] }),
    documents: docs("company-registration", "INZ-2026-04702", [ok("id_alice.jpg", "1.1 MB", t("09-15", "14:00"), "s-grace"), ok("lease_kimironko.pdf", "1.9 MB", t("09-15", "14:00"), "s-grace"), ok("shareholding.pdf", "120 KB", t("09-15", "14:00"), "s-grace")]),
    deliverables: [], messages: [],
    events: [{ at: t("09-19", "15:30"), title: "Cancelled and refunded", by: "s-solange", body: "RWF 10,000 returned to MTN MoMo." }, { at: t("09-18", "11:00"), title: "Company name not available", by: "s-grace" }, { at: t("09-15", "10:00"), title: "Request opened", by: "customer" }],
    notes: [{ id: "n1", at: t("09-18", "11:05"), by: "s-grace", body: "Three alternative names offered; customer declined." }],
  },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "nt1", icon: "alert", title: "Patrick needs a clearer photo of your ID for INZ-2026-04817", at: t("09-30", "10:05"), unread: true, href: "/portal/requests/INZ-2026-04817" },
  { id: "nt2", icon: "send", title: "Company registration submitted to RDB. Official ref RDB-APP-778120", at: t("09-30", "09:40"), unread: true, href: "/portal/requests/INZ-2026-04802" },
  { id: "nt3", icon: "msg", title: "Grace: “I’ve prepared the articles of association — please review the shareholder split.”", at: t("09-28", "11:15"), href: "/portal/requests/INZ-2026-04802" },
  { id: "nt4", icon: "check", title: "Payment received — RWF 2,000 assistance fee for your e-title. The Irembo fee is paid on Irembo.", at: t("09-27", "16:02"), href: "/portal/requests/INZ-2026-04817" },
];

export const AUDIT: AuditEntry[] = [
  { at: t("09-30", "11:31"), actor: "Eric Niyonzima", role: "Agent", action: "Viewed document", entity: "INZ-2026-04790 · price_list_sept.pdf", source: "Kigali · Chrome/Windows", fee: false },
  { at: t("09-30", "11:20"), actor: "Samuel Rukundo", role: "Customer", action: "Uploaded document", entity: "INZ-2026-04790 · Product & price list", source: "Mobile web", fee: false },
  { at: t("09-30", "10:05"), actor: "Patrick Nshimiyimana", role: "Agent", action: "Put on hold", entity: "INZ-2026-04817 · returned by Irembo, waiting on customer", source: "Kigali · Chrome/Windows", fee: false },
  { at: t("09-30", "09:40"), actor: "Grace Ingabire", role: "Agent", action: "Added official reference", entity: "INZ-2026-04802 · RDB-APP-778120", source: "Kigali · Edge/Windows", fee: false },
  { at: t("09-29", "17:21"), actor: "Diane Mukamana", role: "Owner", action: "Changed assistance fee", entity: "Monthly business tax declarations · RWF 25,000 → RWF 30,000", source: "Kigali · Safari/macOS", fee: true },
  { at: t("09-29", "15:10"), actor: "System", role: "—", action: "Payment reconciled", entity: "INZ-R-22181 · RWF 10,000 ours (part payment)", source: "Airtel Money webhook", fee: true },
  { at: t("09-29", "14:47"), actor: "Jean Paul Hakizimana", role: "Supervisor", action: "Approved fee override", entity: "INZ-2026-04788 · assistance fee −RWF 5,000 (school rate)", source: "Kigali · Chrome/Windows", fee: true },
  { at: t("09-29", "11:10"), actor: "Diane Mukamana", role: "Owner", action: "Granted role", entity: "Claudine Uwimana → Agent", source: "Kigali · Safari/macOS", fee: false },
  { at: t("09-29", "09:20"), actor: "System", role: "—", action: "Payment reconciled", entity: "INZ-R-22172 · RWF 50,000 ours (Irembo training)", source: "MoMo webhook", fee: true },
  { at: t("09-27", "16:02"), actor: "System", role: "—", action: "Payment reconciled", entity: "INZ-R-22190 · RWF 2,000 ours · Irembo fee paid by customer", source: "MoMo webhook", fee: true },
  { at: t("09-19", "15:30"), actor: "Solange Ishimwe", role: "Finance", action: "Issued refund", entity: "INZ-R-22031 · RWF 10,000 ours · INZ-2026-04702 cancelled", source: "Kigali · Chrome/Windows", fee: true },
  { at: t("09-18", "09:03"), actor: "System", role: "—", action: "Deleted documents", entity: "INZ-2026-03112 · 4 files · customer request", source: "Retention job", fee: false },
];
