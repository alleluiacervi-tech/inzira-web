// Illustrative content for the Inzira prototype.
// IMPORTANT: official fees and processing times are EXAMPLES — verify every value
// with the responsible institution before launch.

export type StatusKey =
  | "new" | "info" | "rec" | "prep" | "sub" | "proc" | "act" | "done" | "rej"
  | "req" | "recd" | "appr" | "paid" | "unpaid" | "part" | "overdue" | "active" | "draft";

export const STATUS: Record<StatusKey, { label: string; bg: string; fg: string }> = {
  new: { label: "New", bg: "#EEF0F3", fg: "#3D4450" },
  info: { label: "Information required", bg: "#FDF1DC", fg: "#7A4A00" },
  rec: { label: "Documents received", bg: "#E3F1EE", fg: "#1C6555" },
  prep: { label: "In preparation", bg: "#EFEAF7", fg: "#5B3F8C" },
  sub: { label: "Submitted", bg: "#E6EEF8", fg: "#1F4E8C" },
  proc: { label: "Processing", bg: "#E6EEF8", fg: "#1F4E8C" },
  act: { label: "Action required", bg: "#FBE6DC", fg: "#A33C0C" },
  done: { label: "Completed", bg: "#E2F2E6", fg: "#1E6B3A" },
  rej: { label: "Rejected", bg: "#FBE3E3", fg: "#A12424" },
  req: { label: "Required", bg: "#EEF0F3", fg: "#3D4450" },
  recd: { label: "Received", bg: "#E3F1EE", fg: "#1C6555" },
  appr: { label: "Approved", bg: "#E2F2E6", fg: "#1E6B3A" },
  paid: { label: "Paid", bg: "#E2F2E6", fg: "#1E6B3A" },
  unpaid: { label: "Awaiting payment", bg: "#FDF1DC", fg: "#7A4A00" },
  part: { label: "Part-paid", bg: "#E6EEF8", fg: "#1F4E8C" },
  overdue: { label: "Overdue", bg: "#FBE3E3", fg: "#A12424" },
  active: { label: "Active", bg: "#E2F2E6", fg: "#1E6B3A" },
  draft: { label: "Draft", bg: "#EEF0F3", fg: "#3D4450" },
};

export const STEPS = [
  "New", "Information required", "Documents received", "In preparation",
  "Submitted", "Processing", "Action required", "Completed",
] as const;

export const DISCLAIMER =
  "Inzira is a private, independent assistance company. We are not Irembo, RRA, RDB, the Judiciary, or any government institution, and we do not provide legal representation or legal advice. Official fees are set and collected by the relevant institution; our assistance fee is separate and always shown on its own line.";

export const rwf = (n: number) => `RWF ${n.toLocaleString("en-US")}`;

export type Category = { id: string; icon: string; name: string; short: string; desc: string; count: string };
export const CATEGORIES: Category[] = [
  { id: "irembo", icon: "c-id", name: "Irembo / Public services", short: "Irembo", desc: "Certificates, ID, police clearance and other citizen services.", count: "38 services" },
  { id: "rra", icon: "c-tax", name: "RRA / Taxes", short: "RRA / Taxes", desc: "TIN, declarations, tax clearance and compliance.", count: "24 services" },
  { id: "ebm", icon: "c-ebm", name: "EBM", short: "EBM", desc: "Electronic Billing Machine setup, configuration and invoicing help.", count: "9 services" },
  { id: "rdb", icon: "c-biz", name: "RDB / Business registration", short: "RDB", desc: "Register, change or document your company or business name.", count: "17 services" },
  { id: "land", icon: "c-land", name: "Land services", short: "Land", desc: "Titles, transfers, ownership documents and land records.", count: "14 services" },
  { id: "judiciary", icon: "c-court", name: "Judiciary / Urukiko", short: "Judiciary", desc: "Forms, declarations and filing support. Administrative only — not legal advice.", count: "8 services" },
  { id: "compliance", icon: "c-comp", name: "Business & compliance", short: "Compliance", desc: "Permits, sector registrations and compliance documents.", count: "21 services" },
  { id: "other", icon: "c-other", name: "Other government services", short: "Other", desc: "RSSB, immigration, municipal and more — just ask.", count: "30+ services" },
];
export const catById = (id: string) => CATEGORIES.find((c) => c.id === id)!;

export type Service = {
  slug: string;
  name: string;
  aka?: string;
  category: string;
  authority: string;
  channel: string;
  via: string;
  summary: string;
  who: { title: string; body: string }[];
  requirements: string[];
  documents: { name: string; detail: string; required: boolean }[];
  steps: { title: string; body: string; you?: boolean }[];
  notes: { kind: "info" | "warn"; title: string; body: string }[];
  official: { amount: number | null; label?: string; note: string };
  ours: number;
  oursUnit?: string;
  time: string;
  docsShort: string;
  popular?: boolean;
  audience: ("individual" | "business" | "organization")[];
};

const genericSteps = (channel: string, authority: string): Service["steps"] => [
  { title: "You start the request", body: "Answer a few short questions. Takes about 3 minutes.", you: true },
  { title: "We check your documents", body: "Your agent confirms everything is correct, usually within 2 working hours." },
  { title: "You approve the fees", body: "You see the official fee and our fee separately, then pay by MoMo, Airtel Money or card.", you: true },
  { title: `We submit via ${channel}`, body: "We submit through the official channel and share the official reference number with you." },
  { title: `${authority} processes it`, body: "The institution reviews and decides. We follow up if it takes longer than usual." },
  { title: "You receive the result", body: "Delivered to your portal and WhatsApp, with official receipts." },
];

export const SERVICES: Service[] = [
  {
    slug: "criminal-record-certificate", name: "Criminal record certificate", aka: "Police clearance · certificate of good conduct · Icyemezo cy’uko utakatiwe n’inkiko",
    category: "irembo", authority: "National Public Prosecution Authority (NPPA)", channel: "Irembo", via: "Via Irembo · issued by NPPA",
    summary: "An official document that shows whether you have a criminal record in Rwanda. Employers, embassies, universities and licensing bodies often ask for it. It is issued by NPPA; we prepare and submit your application through Irembo and follow it up until you have the certificate.",
    who: [{ title: "Job applicants", body: "Especially banks, schools, NGOs and security roles." }, { title: "Visa & travel", body: "Work, study or residence visas abroad." }, { title: "Licences", body: "Some professional and business licences." }],
    requirements: ["You are 16 or older (or applying on behalf of someone with their consent)", "You have a valid Rwandan national ID, or a passport if you are a foreign resident", "You know why you need it (employment, visa, studies) — some embassies require a specific format"],
    documents: [{ name: "National ID or passport", detail: "Clear photo of both sides, or the passport data page", required: true }, { name: "Recent passport photo", detail: "Only if applying with a passport", required: false }, { name: "Purpose letter or visa form", detail: "Only if an embassy asks for a specific format", required: false }],
    steps: genericSteps("Irembo", "NPPA"),
    notes: [{ kind: "info", title: "Processing time is set by the institution", body: "2–5 working days is typical once submitted. Inzira cannot speed up or guarantee an official decision; we make sure nothing delays it on your side." }, { kind: "warn", title: "Check the purpose with your employer or embassy", body: "Some embassies require an apostille or a specific format. Tell us where it’s going and we’ll confirm before submitting." }],
    official: { amount: 1000, note: "Paid to NPPA through Irembo. Set by the institution, not by us. Passed on at cost." }, ours: 5000,
    time: "2–5 working days", docsShort: "National ID or passport", popular: true, audience: ["individual"],
  },
  {
    slug: "company-registration", name: "Private company registration (LTD)", category: "rdb", authority: "Rwanda Development Board (RDB)", channel: "RDB online registration", via: "Via RDB online registration",
    summary: "Register a private limited company so you can trade, open a business bank account and get a TIN. We check your company name, prepare the articles of association and shareholder details, and submit the registration to RDB for you.",
    who: [{ title: "New founders", body: "Starting a company for the first time." }, { title: "Growing sole traders", body: "Moving from a business name to a company." }, { title: "Foreign investors", body: "Setting up a Rwandan subsidiary." }],
    requirements: ["A proposed company name (we check availability)", "At least one shareholder and one director", "A registered address in Rwanda"],
    documents: [{ name: "IDs of shareholders & directors", detail: "National ID or passport for each person", required: true }, { name: "Proof of company address", detail: "Lease, title or host letter", required: true }, { name: "Shareholding split", detail: "Who owns what percentage", required: true }],
    steps: genericSteps("RDB", "RDB"),
    notes: [{ kind: "info", title: "Registration at RDB is free", body: "You only pay our assistance fee. We’ll also set up your TIN and, if you want, EBM in the right order." }],
    official: { amount: 0, note: "RDB does not charge for domestic company registration." }, ours: 30000,
    time: "1–2 working days", docsShort: "IDs of shareholders & directors, address", popular: true, audience: ["business"],
  },
  {
    slug: "tin-registration", name: "TIN registration", category: "rra", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA", via: "Via RRA",
    summary: "Get a Taxpayer Identification Number for yourself or your business. We prepare the registration, submit it to RRA and make sure your tax types (VAT, PAYE, income tax) are set up correctly from day one.",
    who: [{ title: "New businesses", body: "Required before invoicing and declaring." }, { title: "Individuals", body: "Rental income, consultancy or other taxable activity." }, { title: "Organizations", body: "NGOs and associations with employees." }],
    requirements: ["National ID (individuals) or company certificate (businesses)", "Business address and activity description", "Bank account details"],
    documents: [{ name: "National ID or company certificate", detail: "Clear copy", required: true }, { name: "Bank account details", detail: "Account name and number", required: true }],
    steps: genericSteps("RRA", "RRA"), notes: [],
    official: { amount: 0, note: "RRA does not charge for TIN registration." }, ours: 10000,
    time: "Same day – 2 days", docsShort: "National ID, business address", popular: true, audience: ["individual", "business", "organization"],
  },
  {
    slug: "ebm-setup", name: "EBM setup & configuration", category: "ebm", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA EBM", via: "Via RRA EBM",
    summary: "Set up your Electronic Billing Machine (software or device) so every sale produces a valid invoice. We handle the registration, configure your products and tax codes, and show your team how to issue and correct invoices.",
    who: [{ title: "VAT-registered businesses", body: "EBM invoices are required for VAT." }, { title: "Shops & restaurants", body: "Daily sales with many invoices." }, { title: "Service providers", body: "Consultants, agencies, contractors." }],
    requirements: ["An active TIN", "Business details and product/service list", "A device or computer for the software EBM"],
    documents: [{ name: "TIN certificate", detail: "Or your TIN number", required: true }, { name: "Product & price list", detail: "Spreadsheet or photo is fine", required: false }],
    steps: genericSteps("RRA EBM", "RRA"), notes: [{ kind: "info", title: "On-site setup available in Kigali", body: "An agent can visit to configure your device and train staff." }],
    official: { amount: 0, note: "Software EBM registration is free at RRA." }, ours: 25000,
    time: "3–5 working days", docsShort: "TIN, business details, device (if any)", audience: ["business"],
  },
  {
    slug: "vat-declaration", name: "Monthly VAT declaration", category: "rra", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA e-Tax", via: "Via RRA e-Tax",
    summary: "We prepare and file your monthly VAT declaration from your sales and purchase invoices, reconcile against EBM, and tell you exactly what to pay RRA before the deadline.",
    who: [{ title: "VAT-registered businesses", body: "Monthly or quarterly filers." }, { title: "SMEs without an accountant", body: "Stay compliant without hiring." }, { title: "Organizations", body: "With VAT obligations." }],
    requirements: ["An active TIN registered for VAT", "Sales and purchase invoices for the period", "Access to your e-Tax account (we guide you)"],
    documents: [{ name: "Sales invoices / EBM report", detail: "For the month", required: true }, { name: "Purchase invoices", detail: "With supplier TINs", required: true }],
    steps: genericSteps("RRA e-Tax", "RRA"), notes: [{ kind: "warn", title: "Deadline: 15th of the following month", body: "Send invoices by the 10th so we have time to check them." }],
    official: { amount: null, label: "Tax as assessed", note: "The VAT you owe is paid directly to RRA. We tell you the amount before the deadline." }, ours: 15000, oursUnit: "/ month",
    time: "Before the 15th", docsShort: "Sales & purchase invoices", popular: true, audience: ["business", "organization"],
  },
  {
    slug: "land-title-transfer", name: "Land title transfer (sale)", category: "land", authority: "Land administration", channel: "Irembo", via: "Via Irembo · land administration",
    summary: "Transfer ownership of a land parcel after a sale. We check the title and parcel details, prepare the transfer documents for both parties, submit through the official channel and follow up until the new title is issued.",
    who: [{ title: "Buyers", body: "Getting the title into your name." }, { title: "Sellers", body: "Completing the sale correctly." }, { title: "Families", body: "Transfers between relatives." }],
    requirements: ["The current land title / UPI", "A signed sale agreement", "IDs of both buyer and seller"],
    documents: [{ name: "Current land title", detail: "Or UPI number", required: true }, { name: "Sale agreement", detail: "Signed by both parties", required: true }, { name: "IDs of buyer and seller", detail: "Both sides", required: true }],
    steps: genericSteps("Irembo", "Land administration"), notes: [{ kind: "info", title: "Official fees vary by transaction", body: "We confirm the exact official fee with you before you pay anything." }],
    official: { amount: null, label: "Varies", note: "Depends on the transaction. Confirmed before you pay." }, ours: 40000,
    time: "2–4 weeks", docsShort: "Title, sale contract, IDs of both parties", audience: ["individual", "business"],
  },
  {
    slug: "birth-certificate", name: "Birth certificate", aka: "Icyemezo cy’amavuko", category: "irembo", authority: "Civil registration", channel: "Irembo", via: "Via Irembo · civil registration",
    summary: "Request a birth certificate for yourself or your child. We complete the Irembo application, pay the official fee on your behalf and deliver the certificate to your portal.",
    who: [{ title: "Parents", body: "School enrolment, passports, insurance." }, { title: "Adults", body: "Visa, marriage or employment files." }, { title: "Diaspora", body: "Applying from outside Rwanda." }],
    requirements: ["The person’s birth was registered in Rwanda", "Parent’s or applicant’s national ID"],
    documents: [{ name: "Parent’s or applicant’s ID", detail: "Clear copy", required: true }],
    steps: genericSteps("Irembo", "Civil registration"), notes: [],
    official: { amount: 500, note: "Paid through Irembo at cost." }, ours: 3000,
    time: "1–3 working days", docsShort: "Parent's ID, child's details", audience: ["individual"],
  },
  {
    slug: "tax-clearance-certificate", name: "Tax clearance certificate", category: "rra", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA", via: "Via RRA",
    summary: "Proof that your business is up to date with taxes — often required for tenders, licences and bank loans. We check your account for gaps, fix what we can and request the certificate.",
    who: [{ title: "Tender applicants", body: "Public and private procurement." }, { title: "Loan applicants", body: "Banks often ask for it." }, { title: "Licence renewals", body: "Some sectors require it." }],
    requirements: ["Active TIN", "All declarations filed and taxes paid"],
    documents: [{ name: "TIN", detail: "Number or certificate", required: true }],
    steps: genericSteps("RRA", "RRA"), notes: [],
    official: { amount: 0, note: "RRA does not charge for the certificate." }, ours: 8000,
    time: "2–3 working days", docsShort: "TIN, up-to-date declarations", audience: ["business", "organization"],
  },
  {
    slug: "court-filing-support", name: "Court filing support", category: "judiciary", authority: "Judiciary of Rwanda", channel: "the judiciary’s online case system", via: "Via the judiciary’s online case system",
    summary: "Administrative help to prepare forms and declarations and file them through the official online case system, then track hearing dates and notices. This is administrative assistance only — not legal representation or legal advice.",
    who: [{ title: "Self-represented parties", body: "Who need help with the forms and filing." }, { title: "Small businesses", body: "Filing debt-recovery paperwork." }, { title: "Families", body: "Succession and civil-status declarations." }],
    requirements: ["Your prepared claim or documents", "National ID", "Contact details of the other party (if applicable)"],
    documents: [{ name: "Your documents", detail: "Claims, contracts, evidence", required: true }, { name: "National ID", detail: "Clear copy", required: true }],
    steps: genericSteps("the online case system", "The court"),
    notes: [{ kind: "warn", title: "Administrative support only", body: "We do not give legal advice or represent you in court. For legal advice, consult a licensed advocate." }],
    official: { amount: null, label: "Court fee varies", note: "Set by the court depending on case type. Confirmed before you pay." }, ours: 20000,
    time: "Depends on the court", docsShort: "Your prepared documents, ID", audience: ["individual", "business"],
  },
  {
    slug: "rssb-employer-registration", name: "RSSB employer registration", category: "other", authority: "Rwanda Social Security Board (RSSB)", channel: "RSSB", via: "Via RSSB",
    summary: "Register your business as an employer with RSSB so you can declare staff and pay social security contributions correctly.",
    who: [{ title: "First-time employers", body: "Hiring your first staff." }, { title: "NGOs & schools", body: "With salaried employees." }, { title: "Cooperatives", body: "With employees or members on payroll." }],
    requirements: ["Company certificate", "TIN", "List of employees"],
    documents: [{ name: "Company certificate", detail: "From RDB", required: true }, { name: "Employee list", detail: "Names and IDs", required: true }],
    steps: genericSteps("RSSB", "RSSB"), notes: [],
    official: { amount: 0, note: "RSSB does not charge for registration." }, ours: 15000,
    time: "2–4 working days", docsShort: "Company certificate, TIN, employee list", audience: ["business", "organization"],
  },
];
export const serviceBySlug = (s: string) => SERVICES.find((x) => x.slug === s);
export const officialLabel = (s: Service) => (s.official.amount === null ? s.official.label ?? "Varies" : s.official.amount === 0 ? "Free" : rwf(s.official.amount));
export const oursLabel = (s: Service) => rwf(s.ours) + (s.oursUnit ? ` ${s.oursUnit}` : "");
export const totalLabel = (s: Service) =>
  s.official.amount === null ? (s.oursUnit ? `${rwf(s.ours)} + tax due` : "Confirmed before payment") : rwf(s.official.amount + s.ours);

// ---------------- customer ----------------
export type TimelineEvent = { state: "done" | "cur" | "todo"; title: string; meta?: string; body?: string };
export type DocItem = { name: string; meta: string; status: StatusKey; group?: string };
export type Request = {
  ref: string; officialRef?: string; service: string; slug: string; forWho: string; status: StatusKey; stage: number; agent: string; agentInitials: string;
  next: string; yourAction?: boolean; opened: string; stepDates: string[]; skipped?: number[];
  banner: { title: string; body: string };
  docs: DocItem[]; completed: DocItem[];
  payment: { officialLabel: string; official: string; ours: string; total: string; status: StatusKey; note: string };
  messages: { who: string; initials: string; me?: boolean; time: string; body: string }[];
  activity: TimelineEvent[];
};

export const CUSTOMER = { name: "Aline Uwase", first: "Aline", initials: "AU", account: "Personal · Umucyo Tech Ltd", phone: "+250 788 123 456" };

export const REQUESTS: Request[] = [
  {
    ref: "INZ-2026-04817", officialRef: "1240 8876 3321", service: "Criminal record certificate", slug: "criminal-record-certificate", forWho: "For: Aline Uwase · via Irembo",
    status: "act", stage: 6, agent: "Eric Niyonzima", agentInitials: "EN", next: "Upload a clearer photo of your ID (front). Eric can’t read the ID number.", yourAction: true,
    opened: "27 Sep 2026", stepDates: ["27 Sep", "—", "27 Sep", "27 Sep", "28 Sep", "28 Sep", "Today", ""], skipped: [1],
    banner: { title: "We need a clearer ID photo", body: "Irembo returned your application: the ID photo (front) is too blurry to read the ID number. Please upload a sharper photo — it takes a minute." },
    docs: [{ name: "National ID — front", meta: "Too blurry to read · returned by Irembo", status: "rej" }, { name: "National ID — back", meta: "id_back.jpg · checked 27 Sep", status: "appr" }],
    completed: [],
    payment: { officialLabel: "NPPA fee via Irembo", official: "RWF 1,000", ours: "RWF 5,000", total: "RWF 6,000", status: "paid", note: "Paid 27 Sep · MTN MoMo · receipt INZ-R-22190" },
    messages: [{ who: "Eric Niyonzima", initials: "EN", time: "Today 10:05", body: "Mwaramutse Aline — Irembo couldn’t read the ID number on the front photo. Could you retake it in daylight, without flash?" }],
    activity: [
      { state: "cur", title: "Action required", meta: "Today 10:05 · Eric N.", body: "Clearer ID photo needed." },
      { state: "done", title: "Processing", meta: "28 Sep", body: "Irembo application no. 1240 8876 3321" },
      { state: "done", title: "Submitted via Irembo", meta: "28 Sep · Eric N." },
      { state: "done", title: "Payment received", meta: "27 Sep · RWF 6,000" },
      { state: "done", title: "Request opened", meta: "27 Sep · You" },
    ],
  },
  {
    ref: "INZ-2026-04802", officialRef: "RDB-APP-778120", service: "Private company registration", slug: "company-registration", forWho: "For: Umucyo Tech Ltd · via RDB",
    status: "sub", stage: 4, agent: "Grace Ingabire", agentInitials: "GI", next: "RDB is reviewing. Usually 1–2 working days. We’ll message you.",
    opened: "21 Sep 2026", stepDates: ["21 Sep", "—", "22 Sep", "23 Sep", "Today 09:40", "", "", ""], skipped: [1],
    banner: { title: "With RDB now — nothing needed from you", body: "RDB usually decides within 1–2 working days. Grace will follow up tomorrow at 10:00 and message you as soon as the certificate is issued. Your TIN registration starts automatically after that." },
    docs: [
      { name: "National ID — Aline Uwase (director, 60%)", meta: "id_aline.jpg · checked 22 Sep", status: "appr" },
      { name: "National ID — Olivier Mugisha (shareholder, 40%)", meta: "id_olivier.pdf · checked 22 Sep", status: "appr" },
      { name: "Proof of company address", meta: "lease_kacyiru.pdf · checked 22 Sep", status: "appr" },
      { name: "Articles of association (signed)", meta: "Prepared by Grace · signed 22 Sep", status: "recd" },
    ],
    completed: [{ name: "Name reservation confirmation", meta: "Issued by RDB · 21 Sep", status: "done" }],
    payment: { officialLabel: "RDB registration fee", official: "Free", ours: "RWF 30,000", total: "RWF 30,000", status: "paid", note: "Paid 22 Sep · MTN MoMo · receipt INZ-R-22104" },
    messages: [
      { who: "Grace Ingabire", initials: "GI", time: "Mon 11:15", body: "Your name reservation for Umucyo Tech Ltd is confirmed. I’ve prepared the articles of association — please review the shareholder split (60/40) before I submit." },
      { who: "You", initials: "AU", me: true, time: "Mon 12:02", body: "Looks right. Please go ahead." },
      { who: "Grace Ingabire", initials: "GI", time: "Today 09:41", body: "Submitted to RDB this morning. Official ref RDB-APP-778120. I’ll check again tomorrow at 10:00." },
    ],
    activity: [
      { state: "cur", title: "Submitted to RDB", meta: "Today 09:40 · Grace I.", body: "Official ref RDB-APP-778120" },
      { state: "done", title: "Articles of association signed", meta: "22 Sep · You" },
      { state: "done", title: "Documents approved", meta: "22 Sep · Grace I." },
      { state: "done", title: "Payment received", meta: "22 Sep · RWF 30,000" },
      { state: "done", title: "Request opened", meta: "21 Sep · You" },
    ],
  },
  {
    ref: "INZ-2026-04761", service: "TIN registration", slug: "tin-registration", forWho: "For: Umucyo Tech Ltd · via RRA",
    status: "prep", stage: 3, agent: "Grace Ingabire", agentInitials: "GI", next: "Starts automatically once the company certificate is issued.",
    opened: "21 Sep 2026", stepDates: ["21 Sep", "—", "22 Sep", "Now", "", "", "", ""], skipped: [1],
    banner: { title: "Waiting for your company certificate", body: "TIN registration needs the certificate from RDB. Grace will start as soon as it’s issued. You can pay now or later." },
    docs: [{ name: "Bank account details", meta: "Needed before submission", status: "req" }, { name: "Company certificate", meta: "Will be added from INZ-2026-04802", status: "req" }],
    completed: [],
    payment: { officialLabel: "RRA TIN registration", official: "Free", ours: "RWF 10,000", total: "RWF 10,000", status: "unpaid", note: "Due before submission" },
    messages: [],
    activity: [{ state: "cur", title: "In preparation", meta: "22 Sep · Grace I." }, { state: "done", title: "Request opened", meta: "21 Sep · You" }],
  },
];
export const requestByRef = (r: string) => REQUESTS.find((x) => x.ref === r);

export const COMPLETED_REQUESTS = [
  { ref: "INZ-2026-04112", name: "Birth certificate — Ineza K.", delivered: "Delivered 2 Sep" },
  { ref: "INZ-2026-03390", name: "Tax clearance certificate", delivered: "Delivered 14 Aug" },
];

export const NOTIFICATIONS = [
  { icon: "alert", title: "Eric needs a clearer photo of your ID for INZ-2026-04817", meta: "12 min ago", unread: true, href: "/portal/requests/INZ-2026-04817" },
  { icon: "send", title: "Company registration submitted to RDB. Official ref RDB-APP-778120", meta: "Today, 09:40", unread: true, href: "/portal/requests/INZ-2026-04802" },
  { icon: "check", title: "Payment received — RWF 6,000 (RWF 1,000 official + RWF 5,000 ours)", meta: "Yesterday, 16:02", href: "/portal/requests/INZ-2026-04817" },
  { icon: "msg", title: "Grace: “Your name reservation for Umucyo Tech Ltd is confirmed.”", meta: "Mon, 11:15", href: "/portal/requests/INZ-2026-04802" },
];

export const DOC_LIBRARY: (DocItem & { group: string; action?: "replace" | "upload" | "download" })[] = [
  { group: "Identification", name: "National ID — front · Aline Uwase", meta: "For INZ-2026-04817 · returned by Irembo: too blurry", status: "rej", action: "replace" },
  { group: "Identification", name: "National ID — back · Aline Uwase", meta: "id_back.jpg · 1.1 MB · approved by Eric N.", status: "appr" },
  { group: "Business documents", name: "Articles of association (signed)", meta: "articles_umucyo.pdf · 420 KB · INZ-2026-04802", status: "recd" },
  { group: "Business documents", name: "Proof of company address", meta: "lease_kacyiru.pdf · 2.3 MB", status: "appr" },
  { group: "Tax documents", name: "Bank account details (for TIN)", meta: "Needed for INZ-2026-04761", status: "req", action: "upload" },
  { group: "Land documents", name: "No land documents yet", meta: "Title deeds, UPI extracts and sale agreements will appear here", status: "req" },
  { group: "Certificates", name: "Birth certificate — Ineza K.", meta: "Issued 2 Sep · delivered by Inzira", status: "done", action: "download" },
  { group: "Certificates", name: "Tax clearance certificate", meta: "Issued 14 Aug · delivered by Inzira", status: "done", action: "download" },
];

// ---------------- agent ----------------
export type Case = { customer: string; type: string; service: string; category: string; ref: string; agent: string; status: StatusKey; payment: StatusKey; updated: string };
export const CASES: Case[] = [
  { customer: "Aline Uwase", type: "Individual", service: "Criminal record certificate", category: "Irembo", ref: "INZ-2026-04817", agent: "Eric N.", status: "act", payment: "paid", updated: "10 min ago" },
  { customer: "Jean Claude Habimana", type: "Individual", service: "Land title transfer (sale)", category: "Land", ref: "INZ-2026-04821", agent: "Patrick N.", status: "new", payment: "unpaid", updated: "25 min ago" },
  { customer: "Kigali Fresh Foods Ltd", type: "Business", service: "EBM setup & configuration", category: "EBM", ref: "INZ-2026-04790", agent: "Eric N.", status: "prep", payment: "paid", updated: "1 h ago" },
  { customer: "Umucyo Tech Ltd", type: "Business", service: "Private company registration", category: "RDB", ref: "INZ-2026-04802", agent: "Grace I.", status: "sub", payment: "paid", updated: "Today 09:40" },
  { customer: "Hope Nursery School", type: "Organization", service: "Monthly VAT declaration", category: "RRA", ref: "INZ-2026-04788", agent: "Eric N.", status: "info", payment: "part", updated: "Yesterday" },
  { customer: "Claudine Uwimana", type: "Individual", service: "Court filing support", category: "Judiciary", ref: "INZ-2026-04779", agent: "Patrick N.", status: "proc", payment: "paid", updated: "Yesterday" },
  { customer: "Nyamirambo Hardware Ltd", type: "Business", service: "Tax clearance certificate", category: "RRA", ref: "INZ-2026-04770", agent: "Eric N.", status: "proc", payment: "paid", updated: "28 Sep" },
  { customer: "Musanze Coffee Cooperative", type: "Organization", service: "RSSB employer registration", category: "Other", ref: "INZ-2026-04741", agent: "Eric N.", status: "rec", payment: "overdue", updated: "26 Sep" },
  { customer: "Emmanuel Nsengimana", type: "Individual", service: "Birth certificate", category: "Irembo", ref: "INZ-2026-04764", agent: "Grace I.", status: "done", payment: "paid", updated: "28 Sep" },
];

export const FOLLOWUPS = [
  { time: "10:00", customer: "Umucyo Tech Ltd", what: "Check RDB decision · RDB-APP-778120", status: "sub" as StatusKey, ref: "INZ-2026-04802" },
  { time: "11:30", customer: "Nyamirambo Hardware Ltd", what: "Call RRA about tax clearance delay", status: "proc" as StatusKey, ref: "INZ-2026-04770" },
  { time: "14:00", customer: "Hope Nursery School", what: "Remind: purchase invoices for Sept VAT", status: "info" as StatusKey, ref: "INZ-2026-04788" },
  { time: "16:00", customer: "Musanze Coffee Cooperative", what: "Payment reminder · RWF 15,000 overdue", status: "overdue" as StatusKey, ref: "INZ-2026-04741" },
];

// ---------------- admin ----------------
export const AGENTS = [
  { name: "Eric Niyonzima", team: "Tax & EBM", active: 34, completed: 96, turnaround: "2.1 days", firstTime: "94%", rating: "4.8" },
  { name: "Grace Ingabire", team: "Business registration", active: 29, completed: 88, turnaround: "1.8 days", firstTime: "97%", rating: "4.9" },
  { name: "Patrick Nshimiyimana", team: "Land & Judiciary", active: 22, completed: 41, turnaround: "6.4 days", firstTime: "89%", rating: "4.6" },
  { name: "Olivier Mugisha", team: "Public services", active: 31, completed: 132, turnaround: "1.2 days", firstTime: "95%", rating: "4.7" },
  { name: "Claudine Uwimana", team: "Compliance", active: 18, completed: 55, turnaround: "3.0 days", firstTime: "91%", rating: "4.7" },
];

export const PAYMENTS = [
  { receipt: "INZ-R-22190", customer: "Aline Uwase", service: "Criminal record certificate", official: "RWF 1,000", ours: "RWF 5,000", method: "MTN MoMo", status: "paid" as StatusKey, officialReceipt: "Receipt attached" },
  { receipt: "INZ-R-22188", customer: "Kigali Fresh Foods Ltd", service: "EBM setup & configuration", official: "Free", ours: "RWF 25,000", method: "Bank transfer", status: "paid" as StatusKey, officialReceipt: "n/a" },
  { receipt: "INZ-R-22185", customer: "Jean Claude Habimana", service: "Land title transfer (sale)", official: "Pending quote", ours: "RWF 40,000", method: "—", status: "unpaid" as StatusKey, officialReceipt: "Awaiting assessment" },
  { receipt: "INZ-R-22181", customer: "Hope Nursery School", service: "Monthly VAT declaration", official: "RWF 214,600 tax", ours: "RWF 12,000", method: "Airtel Money", status: "part" as StatusKey, officialReceipt: "Tax paid · fee due" },
  { receipt: "INZ-R-22177", customer: "Claudine Uwimana", service: "Court filing support", official: "Court fee · receipted", ours: "RWF 20,000", method: "MTN MoMo", status: "paid" as StatusKey, officialReceipt: "Receipt attached" },
  { receipt: "INZ-R-22150", customer: "Musanze Coffee Cooperative", service: "RSSB employer registration", official: "Free", ours: "RWF 15,000", method: "—", status: "overdue" as StatusKey, officialReceipt: "n/a" },
];

export const AUDIT = [
  { time: "30 Sep 11:58", actor: "Eric Niyonzima", role: "Agent", action: "Viewed document", entity: "INZ-2026-04817 · id_front_new.jpg", source: "Kigali · Chrome/Android", fee: false },
  { time: "30 Sep 11:52", actor: "Aline Uwase", role: "Customer", action: "Uploaded document", entity: "INZ-2026-04817 · National ID — front", source: "Mobile web", fee: false },
  { time: "30 Sep 10:05", actor: "Eric Niyonzima", role: "Agent", action: "Changed status", entity: "INZ-2026-04817 · Processing → Action required", source: "Kigali · Chrome/Windows", fee: false },
  { time: "30 Sep 09:40", actor: "Grace Ingabire", role: "Agent", action: "Added official reference", entity: "INZ-2026-04802 · RDB-APP-778120", source: "Kigali · Edge/Windows", fee: false },
  { time: "29 Sep 17:21", actor: "Diane Mukamana", role: "Owner", action: "Changed assistance fee", entity: "Monthly VAT declaration · RWF 12,000 → RWF 15,000", source: "Kigali · Safari/macOS", fee: true },
  { time: "29 Sep 16:02", actor: "System", role: "—", action: "Payment reconciled", entity: "INZ-R-22190 · RWF 1,000 official + RWF 5,000 ours", source: "MoMo webhook", fee: true },
  { time: "29 Sep 14:47", actor: "Jean Paul Hakizimana", role: "Supervisor", action: "Approved fee override", entity: "INZ-2026-04788 · assistance fee −RWF 3,000 (NGO rate)", source: "Kigali · Chrome/Windows", fee: true },
  { time: "29 Sep 11:10", actor: "Diane Mukamana", role: "Owner", action: "Granted role", entity: "Claudine Uwimana → Agent", source: "Kigali · Safari/macOS", fee: false },
  { time: "28 Sep 15:20", actor: "Eric Niyonzima", role: "Agent", action: "Recorded official fee", entity: "INZ-2026-04817 · RWF 1,000 · receipt attached", source: "Kigali · Chrome/Windows", fee: true },
  { time: "28 Sep 09:03", actor: "System", role: "—", action: "Deleted documents", entity: "INZ-2026-03112 · 4 files · customer request", source: "Retention job", fee: false },
];

export const ROLES = [
  { name: "Owner", count: 1, desc: "Everything, including billing and deleting data" },
  { name: "Administrator", count: 2, desc: "Manage services, agents and settings" },
  { name: "Supervisor", count: 3, desc: "Assign cases, approve fee changes" },
  { name: "Agent", count: 14, desc: "Work on assigned cases" },
  { name: "Finance", count: 2, desc: "Payments, refunds, reconciliation" },
  { name: "Quality reviewer", count: 1, desc: "Read-only case review" },
];
export const PERMISSION_GROUPS: { group: string; items: { name: string; bits: string }[] }[] = [
  { group: "Cases", items: [{ name: "View assigned cases", bits: "111111" }, { name: "View all cases", bits: "111011" }, { name: "Assign / reassign cases", bits: "111000" }, { name: "Update case status", bits: "111100" }, { name: "Complete a case", bits: "111100" }] },
  { group: "Documents", items: [{ name: "Approve / reject documents", bits: "111100" }, { name: "Download customer documents", bits: "111101" }, { name: "Delete documents", bits: "100000" }] },
  { group: "Payments", items: [{ name: "Record official fees", bits: "111110" }, { name: "Change our assistance fee on a case", bits: "111000" }, { name: "Issue refunds", bits: "100010" }] },
  { group: "Administration", items: [{ name: "Edit services & prices", bits: "110000" }, { name: "Manage agents & roles", bits: "110000" }, { name: "View audit logs", bits: "110001" }] },
];
