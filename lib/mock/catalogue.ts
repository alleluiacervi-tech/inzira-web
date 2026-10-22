// The Inzira catalogue: the services we offer and OUR fee for each (set by Inzira, 1 Oct 2026).
//
// IMPORTANT before launch — the following are drafts and must be checked with each institution:
// - official fees: none has been verified yet (official.verifiedAt is unset), so customers see
//   "To be confirmed" and every quote is confirmed per case by the agent;
// - processing times ("time") and required documents.
import type { Category, DocGroup, Service, ServiceDocument } from "../types";

export const CATEGORIES: Category[] = [
  { id: "rdb", icon: "c-biz", name: "RDB / Business registration", short: "RDB", desc: "Register, change or keep your enterprise or company up to date." },
  { id: "tax", icon: "c-tax", name: "Taxes", short: "Taxes", desc: "Trading licence, property tax, vehicle income tax and monthly declarations." },
  { id: "ebm", icon: "c-ebm", name: "EBM", short: "EBM", desc: "Get an Electronic Billing Machine installed and learn to use it." },
  { id: "land", icon: "c-land", name: "Land services", short: "Land", desc: "E-titles, spouse changes in the land register and merging plots." },
  { id: "rura", icon: "c-car", name: "RURA / Transport", short: "RURA", desc: "Authorisations for vehicles that carry passengers or goods." },
  { id: "police", icon: "c-id", name: "Police services", short: "Police", desc: "A criminal record certificate, driving licences, traffic fines and vehicle inspection." },
  { id: "papers", icon: "c-comp", name: "Certificates", short: "Papers", desc: "Birth, marriage and other certificates, a passport and a replacement ID card. We file them and send the document when it is issued." },
  { id: "irembo", icon: "c-learn", name: "Irembo training", short: "Irembo", desc: "Learn to use Irembo yourself — online or at our office." },
  { id: "other", icon: "c-other", name: "Other online services", short: "Other", desc: "Need something else done online? We agree the process and our fee with you first.", href: "/start" },
];

const doc = (name: string, detail: string, required: boolean, group: DocGroup): ServiceDocument => ({ name, detail, required, group });

/** Official fee that Inzira collects and passes on. Not verified yet, so it is confirmed per case. */
const toConfirm = (who: string) => ({ amount: null, note: `Set by ${who}. Your agent confirms the exact amount before you pay anything.` });
/** Tax or fee the customer pays to the institution themselves. */
const direct = (label: string, note: string) => ({ amount: null, mode: "direct" as const, label, note });
/** No official fee: the whole price is our service. */
const none = { amount: 0, mode: "none" as const, note: "There is no government fee. This is a service by Inzira." };

const procedure = (channel: string, authority: string): Service["steps"] => [
  { title: "You start the request", body: "Answer a few short questions. Takes about 3 minutes.", you: true },
  { title: "We check your documents", body: "Your agent confirms everything is correct, usually within 2 working hours." },
  { title: "You approve the fees", body: "You see the official fee and our fee separately, then pay by MoMo or Airtel Money.", you: true },
  { title: `We submit via ${channel}`, body: "We submit through the official channel and share the official reference number with you." },
  { title: `${authority} processes it`, body: "The institution reviews and decides. We follow up if it takes longer than usual." },
  { title: "You receive the result", body: "Delivered to your portal and WhatsApp, with official receipts." },
];
const declaration = (what: string): Service["steps"] => [
  { title: "You send your records", body: `${what} — photos or files from your phone are fine.`, you: true },
  { title: "We prepare the declaration", body: "Your agent checks the figures and prepares the declaration for RRA." },
  { title: "You approve our fee", body: "Pay by MoMo or Airtel Money. Nothing is filed until you approve.", you: true },
  { title: "We file it with RRA", body: "Before the deadline. You receive the filing confirmation in your portal." },
  { title: "You pay the tax due", body: "We tell you the exact amount and how to pay it to RRA. It never passes through us.", you: true },
];
const training: Service["steps"] = [
  { title: "You book", body: "Tell us who will attend and whether you prefer online sessions or our office.", you: true },
  { title: "We schedule your sessions", body: "Your trainer confirms dates and times with you by WhatsApp." },
  { title: "You pay our fee", body: "Pay by MoMo or Airtel Money. There is no government fee.", you: true },
  { title: "You learn hands-on", body: "Practical sessions on real examples, at your pace, with time for questions." },
];
const onBehalf = (who: string): Service["notes"] => [
  { kind: "info", title: "We apply. You get the document.", body: `You send the details. We submit on Irembo for you and send the document as soon as ${who} issues it. Inzira is not ${who} and not Irembo.` },
];
const iremboBill = (who: string) => direct("Irembo fee", `The fee set by ${who} is paid on Irembo, by MoMo or Airtel Money. We tell you the amount before anything is submitted. It does not pass through Inzira.`);
/** A fixed Irembo fee, checked on Irembo's own page on that date. It is paid with our fee in one payment, and we pay the
 *  Irembo bill the moment it is issued, so a bill never lapses waiting for the customer. */
const IREMBO_CHECKED = "2026-10-22T00:00:00.000Z";
const iremboFee = (amount: number) => ({
  amount, label: "Irembo fee", verifiedAt: IREMBO_CHECKED,
  note: "Irembo’s own fee. You pay it with our fee in one payment, and we pay the Irembo bill for you as soon as it is issued. If the institution refuses, it is refunded.",
});
/** No government fee at all, though the request is still filed through the institution. */
const free = (who: string) => ({ amount: 0, mode: "none" as const, note: `${who} charges nothing for this. You pay our fee only.` });
const filed = (over: Pick<Service, "slug" | "name" | "summary" | "who" | "requirements" | "documents" | "ours" | "time" | "docsShort"> & Partial<Service> & { office: string }): Service => ({
  questions: over.questions,
  category: over.category ?? "police",
  authority: over.authority ?? over.office,
  channel: "Irembo",
  via: `Via Irembo · ${over.office}`,
  aka: over.aka,
  steps: procedure("Irembo", over.office),
  notes: [...onBehalf(over.office), ...(over.notes ?? [])],
  official: over.official ?? iremboBill(over.office),
  audience: over.audience ?? ["individual"],
  idPolicy: over.idPolicy ?? "required",
  purposes: over.purposes,
  purposeLabel: over.purposeLabel,
  popular: over.popular,
  visible: true,
  slug: over.slug, name: over.name, summary: over.summary, who: over.who, requirements: over.requirements, documents: over.documents, ours: over.ours, time: over.time, docsShort: over.docsShort,
});

const trainingFlow = {
  flow: ["received" as const, "preparing" as const, "completed" as const], stageLabels: { preparing: "Sessions scheduled" }, noId: true,
  purposeLabel: "How would you like to attend?", purposes: ["Online", "At the Inzira office", "Either is fine"],
};

export const SERVICES: Service[] = [
  // ---------------- RDB ----------------
  {
    slug: "enterprise-registration", name: "Enterprise registration", aka: "Sole proprietorship · business in your own name",
    category: "rdb", authority: "Rwanda Development Board (RDB)", channel: "RDB online registration", via: "Via RDB online registration",
    summary: "Register a business in your own name (a sole proprietorship) so you can trade legally, open a business bank account and get a TIN. We check your details, complete the RDB registration for you and send you the certificate.",
    who: [{ title: "Traders & shop owners", body: "Shops, market stalls, small wholesale." }, { title: "Freelancers", body: "Consultants, designers, technicians." }, { title: "Small service businesses", body: "Salons, tailors, repair workshops." }],
    requirements: ["A Rwandan National ID number, or a passport and residence permit", "The name and activity of your business", "Where the business operates (district, sector, cell)"],
    documents: [doc("Proof of business address", "Lease or a letter from the owner, if you have one", false, "Business documents")],
    steps: procedure("RDB", "RDB"), notes: [],
    questions: [{ key: "business", label: "Business name and what it does", placeholder: "e.g. Keza Shop, selling clothes", required: true }],
    official: free("RDB"), ours: 5000,
    time: "Usually 1–2 working days", docsShort: "National ID number, business name", audience: ["individual", "business"], visible: true,
  },
  {
    slug: "company-registration", name: "Company registration", aka: "Private limited company · LTD",
    category: "rdb", authority: "Rwanda Development Board (RDB)", channel: "RDB online registration", via: "Via RDB online registration",
    summary: "Register a private limited company so you can trade, open a business bank account and get a TIN. We check your company name, prepare the articles of association and shareholder details, and submit the registration to RDB for you.",
    who: [{ title: "New founders", body: "Starting a company for the first time." }, { title: "Growing sole traders", body: "Moving from an enterprise to a company." }, { title: "Foreign investors", body: "Setting up a Rwandan company." }],
    requirements: ["A proposed company name (we check it is available)", "At least one shareholder and one director", "A registered address in Rwanda"],
    documents: [doc("IDs of shareholders & directors", "National ID or passport for each person", true, "Identification"), doc("Proof of company address", "Lease, title or host letter", true, "Business documents"), doc("Shareholding split", "Who owns what percentage", true, "Business documents")],
    steps: procedure("RDB", "RDB"), notes: [{ kind: "info", title: "Next steps after registration", body: "Most new companies also need a trading licence and, if they issue invoices, an EBM. We can do both in the right order." }],
    official: free("RDB"), ours: 10000,
    time: "Usually 1–2 working days", docsShort: "IDs of shareholders & directors, address", popular: true, audience: ["business"], visible: true,
  },
  {
    slug: "business-amendment", name: "Business amendment", aka: "Change of company or enterprise details",
    category: "rdb", authority: "Rwanda Development Board (RDB)", channel: "RDB online registration", via: "Via RDB online registration",
    summary: "Change the details RDB holds about your business — address, activity, directors, shareholders or name. We prepare the amendment with the right supporting documents and submit it to RDB.",
    who: [{ title: "Companies changing hands", body: "New shareholders or directors." }, { title: "Businesses that moved", body: "A new address or district." }, { title: "Businesses that grew", body: "New activities or a new name." }],
    requirements: ["Your company code or enterprise certificate", "What is changing, and from when", "For companies: the shareholders’ or board decision approving the change"],
    documents: [doc("Company or enterprise certificate", "Or your company code", true, "Business documents"), doc("Decision approving the change", "Signed resolution, for companies", false, "Business documents"), doc("IDs of new directors or shareholders", "Only if people are being added", false, "Identification")],
    purposes: ["Change of address", "New or departing director", "Change of shareholders", "Change of activity", "Change of name"],
    questions: [{ key: "company", label: "Company code", hint: "On your RDB certificate", required: true }],
    steps: procedure("RDB", "RDB"), notes: [],
    official: toConfirm("RDB"), ours: 5000,
    time: "Usually a few working days", docsShort: "Certificate, decision, new IDs", audience: ["business", "organization"], visible: true,
  },
  {
    slug: "annual-return-filing", name: "Annual return filing",
    category: "rdb", authority: "Rwanda Development Board (RDB)", channel: "RDB online registration", via: "Via RDB online registration",
    summary: "Companies confirm their details to RDB once a year with an annual return. We prepare it from your records, check that directors, shareholders and address are still right, and file it for you.",
    who: [{ title: "Private companies", body: "Every registered company files once a year." }, { title: "Busy founders", body: "Who don’t want to miss the deadline." }, { title: "Companies that changed", body: "New directors or shareholders during the year." }],
    requirements: ["Your company code or certificate", "Any changes to directors, shareholders or address during the year"],
    documents: [doc("Company certificate", "Or your company code", true, "Business documents"), doc("Changes during the year", "New directors, shareholders or address, if any", false, "Business documents")],
    steps: procedure("RDB", "RDB"), notes: [{ kind: "warn", title: "Don’t leave it late", body: "Late annual returns can bring penalties. Tell us when your company was registered and we’ll remind you each year." }],
    questions: [{ key: "company", label: "Company code", hint: "On your RDB certificate", required: true }],
    official: toConfirm("RDB"), ours: 20000,
    time: "Usually 1–2 working days", docsShort: "Company certificate, any changes", audience: ["business"], visible: true,
  },

  // ---------------- Taxes ----------------
  {
    slug: "trading-licence-registration", name: "Trading licence registration", aka: "Patente",
    category: "tax", authority: "Rwanda Revenue Authority (RRA), for your district", channel: "RRA", via: "Via RRA · district tax",
    summary: "Register your business for the trading licence tax that districts charge on business activity. We register each place you operate, so your business is set up correctly from the start.",
    who: [{ title: "New businesses", body: "Just registered with RDB." }, { title: "New branches", body: "Opening a second shop or office." }, { title: "Informal businesses", body: "Getting properly registered." }],
    requirements: ["A TIN (from your RDB registration)", "The address and activity of each place you operate"],
    documents: [doc("TIN or company certificate", "Clear copy", true, "Tax documents"), doc("Lease or proof of location", "For each place you operate, if you have it", false, "Business documents")],
    steps: procedure("RRA", "RRA"), notes: [],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }],
    official: direct("Set by your district", "The trading licence tax depends on your activity and location. You pay it directly to RRA for your district; we tell you the amount first."), ours: 5000,
    time: "Usually 1–3 working days", docsShort: "TIN, business location", audience: ["business"], visible: true,
  },
  {
    slug: "property-tax-tin", name: "TIN for property tax", aka: "Taxpayer number for land and building owners",
    category: "tax", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA", via: "Via RRA",
    summary: "If you own land or a building, you need a TIN to declare and pay property tax. We register you with RRA and send you your TIN.",
    who: [{ title: "Land owners", body: "Plots in town or in the countryside." }, { title: "House owners", body: "Homes and rental buildings." }, { title: "Heirs", body: "Who have just inherited property." }],
    requirements: ["Your national ID", "The UPI of each property you own"],
    documents: [],
    questions: [{ key: "upi", label: "UPI of each property", hint: "The number on your land title or e-title, e.g. 1/02/03/04/1234", required: true }],
    steps: procedure("RRA", "RRA"), notes: [],
    official: toConfirm("RRA"), ours: 5000,
    time: "Usually 1–2 working days", docsShort: "National ID number, UPI", audience: ["individual"], idPolicy: "required", visible: true,
  },
  {
    slug: "vehicle-income-tax-declaration", name: "Motor vehicle income tax declaration",
    category: "tax", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA e-Tax", via: "Via RRA e-Tax",
    summary: "Vehicles that carry passengers or goods for money pay a yearly income tax. We prepare and file the declaration with RRA and tell you exactly what to pay and by when.",
    who: [{ title: "Taxi & moto owners", body: "Passenger transport." }, { title: "Truck owners", body: "Goods transport." }, { title: "Cooperatives & companies", body: "With several vehicles." }],
    requirements: ["Your TIN", "The registration details of each vehicle"],
    documents: [doc("TIN", "Number or certificate", true, "Tax documents"), doc("Vehicle registration certificate", "The yellow card, for each vehicle", true, "Other"), doc("RURA authorisation", "If the vehicle has one", false, "Other")],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }],
    steps: declaration("Your TIN and vehicle registration certificates"), notes: [],
    official: direct("Tax as assessed", "The tax depends on the vehicle. You pay it directly to RRA; we tell you the amount before the deadline."), ours: 10000, oursUnit: "per year",
    time: "Filed within 2 working days of your documents", docsShort: "TIN, vehicle yellow card", audience: ["individual", "business", "organization"], visible: true,
  },
  {
    slug: "trading-licence-declaration", name: "Trading licence declaration", aka: "Yearly patente declaration",
    category: "tax", authority: "Rwanda Revenue Authority (RRA), for your district", channel: "RRA e-Tax", via: "Via RRA e-Tax · district tax",
    summary: "Every year, businesses declare the trading licence tax for each place they operate. We prepare the declaration, file it with RRA and tell you the amount to pay and the deadline.",
    who: [{ title: "Shops & offices", body: "One declaration per place of business." }, { title: "Businesses with branches", body: "Several locations to declare." }, { title: "Anyone who missed last year", body: "We help you catch up." }],
    requirements: ["Your TIN", "Each place you operate and what you do there"],
    documents: [doc("TIN", "Number or certificate", true, "Tax documents"), doc("Last year’s declaration", "If you have it", false, "Tax documents")],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }],
    steps: declaration("Your TIN and the places you operate"), notes: [],
    official: direct("Tax as assessed", "Set by your district according to activity and location. You pay it directly to RRA; we tell you the amount first."), ours: 5000, oursUnit: "per year",
    time: "Filed within 2 working days of your documents", docsShort: "TIN, business locations", popular: true, audience: ["business"], visible: true,
  },
  {
    slug: "monthly-tax-declarations", name: "Monthly business tax declarations", aka: "PAYE · income tax · tourism tax and related taxes",
    category: "tax", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA e-Tax", via: "Via RRA e-Tax",
    summary: "For businesses that declare taxes every month — PAYE, income tax, tourism tax and related taxes. We prepare every declaration from your records, file it with RRA on time and tell you exactly what to pay.",
    who: [{ title: "Employers", body: "PAYE on staff salaries every month." }, { title: "Hotels, restaurants & tour operators", body: "Tourism tax and related taxes." }, { title: "SMEs without an accountant", body: "Stay compliant without hiring." }],
    requirements: ["An active TIN registered for the taxes you pay", "Your payroll and sales and purchase records for the month", "Access to your RRA e-Tax account (we guide you)"],
    documents: [doc("Payroll for the month", "Names, salaries and allowances", true, "Tax documents"), doc("Sales & purchase records", "Invoices or your EBM report", true, "Tax documents"), doc("Tourism tax records", "Only if your business pays tourism tax", false, "Tax documents")],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }],
    steps: declaration("Your payroll and sales records for the month"), notes: [{ kind: "warn", title: "Monthly deadline", body: "Most monthly declarations are due by the 15th of the following month. Send your records by the 10th so we have time to check them." }],
    official: direct("Tax as assessed", "The taxes you owe are paid directly to RRA. We tell you each amount before the deadline."), ours: 30000, oursUnit: "per month",
    time: "Before the 15th, every month", docsShort: "Payroll, sales & purchase records", popular: true, audience: ["business", "organization"], visible: true,
  },
  {
    slug: "property-tax-declaration", name: "Property tax declaration", aka: "Land and building tax",
    category: "tax", authority: "Rwanda Revenue Authority (RRA), for your district", channel: "RRA e-Tax", via: "Via RRA e-Tax · district tax",
    summary: "Owners of land and buildings declare property tax every year, plot by plot. We prepare the declaration for each UPI, file it with RRA and tell you what to pay. Our fee is per UPI.",
    who: [{ title: "Land owners", body: "One declaration per plot (UPI)." }, { title: "Landlords", body: "Rental houses and buildings." }, { title: "Families", body: "Several plots under one name." }],
    requirements: ["A TIN (we can get one for you)", "The UPI of each property", "What each property is used for"],
    documents: [],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }, { key: "upi", label: "UPI of each property", hint: "From the land title or e-title. Separate several with commas", required: true }],
    steps: declaration("Your TIN and the UPI of each property"), notes: [],
    official: direct("Tax as assessed", "Set by your district for each property. You pay it directly to RRA; we tell you the amount first."), ours: 1000, oursUnit: "per UPI, per year",
    time: "Filed within 2 working days of your documents", docsShort: "TIN and UPI numbers", audience: ["individual", "business", "organization"], visible: true,
  },

  // ---------------- EBM ----------------
  {
    slug: "ebm-installation", name: "EBM request and installation", aka: "Electronic Billing Machine",
    category: "ebm", authority: "Rwanda Revenue Authority (RRA)", channel: "RRA EBM", via: "Via RRA EBM",
    summary: "Get an Electronic Billing Machine so every sale produces a valid invoice. We request the EBM from RRA, install and configure it with your products and tax codes, and check that your first invoices are right.",
    who: [{ title: "VAT-registered businesses", body: "EBM invoices are required for VAT." }, { title: "Shops & restaurants", body: "Many sales every day." }, { title: "Service providers", body: "Consultants, agencies, contractors." }],
    requirements: ["An active TIN", "Your business details and product or service list", "A computer or device for the software EBM"],
    documents: [doc("TIN certificate", "Or your TIN number", true, "Tax documents"), doc("Product & price list", "Spreadsheet or photo is fine", false, "Business documents")],
    questions: [{ key: "tin", label: "TIN", hint: "The 9-digit taxpayer number, on your RDB certificate or RRA letters", required: true }],
    steps: procedure("RRA EBM", "RRA"), notes: [{ kind: "info", title: "Device or software", body: "Most businesses use the software EBM on a computer. If you need a physical EBM device, it is bought from a certified supplier — we confirm the cost with you first." }],
    official: toConfirm("RRA"), ours: 20000,
    time: "Usually 3–5 working days", docsShort: "TIN, product list", popular: true, audience: ["business"], visible: true,
  },
  {
    slug: "ebm-training", name: "EBM use training",
    category: "ebm", authority: "Inzira", channel: "Training by Inzira", via: "Training by Inzira",
    summary: "Hands-on training for you and your staff on the EBM: issuing invoices, correcting mistakes, daily reports and the records RRA expects to see.",
    who: [{ title: "New EBM users", body: "Just had an EBM installed." }, { title: "New cashiers", body: "Staff who issue invoices." }, { title: "Owners", body: "Who want to check their own records." }],
    requirements: ["An EBM already installed", "The people who will issue invoices"],
    documents: [],
    steps: training, notes: [], ...trainingFlow,
    official: none, ours: 20000,
    time: "Sessions agreed with you", docsShort: "No documents needed", audience: ["business"], visible: true,
  },

  // ---------------- Land ----------------
  {
    slug: "e-title", name: "E-title", aka: "Electronic land title",
    category: "land", authority: "Land administration", channel: "Irembo", via: "Via Irembo · land administration",
    summary: "Get the electronic title for your land. We check your UPI and ownership details, apply through Irembo and send you the e-title when it is issued.",
    who: [{ title: "Land owners", body: "Who need their title in electronic form." }, { title: "Buyers & sellers", body: "Preparing a sale or transfer." }, { title: "Borrowers", body: "Banks ask for the title as security." }],
    requirements: ["The UPI of the land", "The national ID of each registered owner"],
    documents: [doc("National ID of each other owner", "Only if the land has more than one owner", false, "Identification")],
    questions: [{ key: "upi", label: "UPI of the land", hint: "The number on your land title, e.g. 1/02/03/04/1234", required: true }],
    steps: procedure("Irembo", "Land administration"), notes: [],
    official: direct("Irembo fee", "You pay the Irembo bill for the land administration yourself, by MoMo or Airtel Money. We tell you the amount first."), ours: 2000,
    time: "Usually a few working days", docsShort: "UPI, owners’ ID numbers", popular: true, audience: ["individual", "business"], idPolicy: "required", visible: true,
  },
  {
    slug: "land-spouse-update", name: "Add or remove a spouse in the land register",
    category: "land", authority: "Land administration", channel: "Irembo", via: "Via Irembo · land administration",
    summary: "Update who is registered on a land title after a marriage, a divorce or a death. We prepare the request with the right supporting documents and submit it for you.",
    who: [{ title: "Newly married couples", body: "Adding a spouse to the title." }, { title: "After a divorce", body: "Removing a former spouse." }, { title: "Widows & widowers", body: "After a spouse has died." }],
    requirements: ["The UPI of the land", "IDs of the people concerned", "The document that proves the change"],
    documents: [doc("IDs of both spouses", "Clear photos of both sides", true, "Identification"), doc("Proof of the change", "Marriage certificate, divorce judgment or death certificate", true, "Other"), doc("UPI or land title", "The number or a photo of the title", true, "Land documents"), doc("Widow or widower certificate", "Only when removing a spouse after a death.", false, "Other"), doc("Property-sharing agreement or court decision", "Notarized agreement or final court decision. Only for a divorce or a separation of property, if you have one.", false, "Other")],
    purposes: ["Add a spouse after marriage", "Remove a spouse after divorce", "Remove a spouse after a death"],
    steps: procedure("Irembo", "Land administration"), notes: [{ kind: "info", title: "Both people may need to confirm", body: "The land office can ask both spouses to confirm the change. We tell you exactly who needs to do what before submitting." }],
    official: free("The land administration"), ours: 5000,
    time: "About 13 working days", docsShort: "IDs, marriage or other certificate, UPI", audience: ["individual"], idPolicy: "required", visible: true,
  },
  {
    slug: "land-merging", name: "Land merging", aka: "Combine plots into one UPI",
    category: "land", authority: "Land administration", channel: "Irembo", via: "Via Irembo · land administration",
    summary: "Combine neighbouring plots you own into a single parcel with one UPI. We check the plots, prepare the request and follow it up until the new title is issued.",
    who: [{ title: "Owners of neighbouring plots", body: "Who want one title." }, { title: "Builders", body: "Preparing a larger construction." }, { title: "Families", body: "Bringing inherited plots together." }],
    requirements: ["The plots are next to each other", "They are registered to the same owner or owners", "The UPI of every plot"],
    questions: [{ key: "upi", label: "UPI of each plot", hint: "Separate them with commas", required: true }],
    documents: [doc("IDs of the owners", "Clear photos of both sides", true, "Identification"), doc("Survey plan", "Only if the land office asks for one", false, "Land documents"), doc("Application form", "The official form from the land portal. We prepare it from your details for you to check.", true, "Land documents")],
    steps: procedure("Irembo", "Land administration"), notes: [{ kind: "info", title: "Official fees depend on the plots", body: "We confirm the official fees, and whether a surveyor is needed, before you pay anything." }],
    official: toConfirm("the land administration"), ours: 5000,
    time: "Usually 2–4 weeks", docsShort: "UPIs, owner IDs", audience: ["individual", "business"], idPolicy: "required", visible: true,
  },

  // ---------------- RURA ----------------
  {
    slug: "rura-vehicle-authorisation", name: "Vehicle authorisation (RURA)", aka: "Transport authorisation for passenger or goods vehicles",
    category: "rura", authority: "Rwanda Utilities Regulatory Authority (RURA)", channel: "RURA online services", via: "Via RURA online services",
    summary: "Get the RURA authorisation a vehicle needs to carry passengers or goods for money. We prepare the request, submit it to RURA and follow it up until the authorisation is issued.",
    who: [{ title: "Taxi & moto owners", body: "Passenger transport." }, { title: "Truck owners", body: "Goods transport." }, { title: "Transport companies", body: "Several vehicles at once." }],
    requirements: ["The vehicle’s registration certificate (yellow card)", "The owner’s ID or company certificate", "Valid insurance and technical inspection, where required"],
    documents: [doc("Vehicle registration certificate", "The yellow card", true, "Other"), doc("Owner’s ID or company certificate", "Clear copy", true, "Identification"), doc("Insurance and inspection certificates", "We confirm which ones your vehicle type needs", false, "Other")],
    questions: [{ key: "plate", label: "Plate number", placeholder: "e.g. RAD 123 A", required: true }],
    steps: procedure("RURA", "RURA"), notes: [],
    official: direct("RURA fee", "Set by RURA for your vehicle type. You pay it to RURA yourself; we tell you the amount first."), ours: 5000,
    time: "Usually a few working days", docsShort: "Yellow card, owner ID", audience: ["individual", "business", "organization"], visible: true,
  },
  {
    slug: "rura-authorisation-suspension", name: "Suspension of vehicle authorisation",
    category: "rura", authority: "Rwanda Utilities Regulatory Authority (RURA)", channel: "RURA online services", via: "Via RURA online services",
    summary: "Suspend a vehicle’s RURA authorisation while it is off the road — for repairs, a sale or a break in operations. We submit the request and confirm when it is done.",
    who: [{ title: "Vehicles under repair", body: "Off the road for a while." }, { title: "Vehicles being sold", body: "Before the change of owner." }, { title: "Seasonal operators", body: "A break in operations." }],
    requirements: ["The current authorisation details", "The vehicle’s registration certificate", "Why and from when the vehicle stops operating"],
    documents: [doc("Vehicle registration certificate", "The yellow card", false, "Other")],
    questions: [{ key: "authorisation", label: "RURA authorisation number, or the plate number", required: true }, { key: "from", label: "From when the vehicle stops operating", placeholder: "e.g. 1 November", required: true }],
    steps: procedure("RURA", "RURA"), notes: [],
    official: toConfirm("RURA"), ours: 3000,
    time: "Usually 1–3 working days", docsShort: "Authorisation or plate number", audience: ["individual", "business", "organization"], visible: true,
  },

  // ---------------- Police, filed on Irembo ----------------
  // The names follow the police list people meet on Irembo. Inzira files the application and returns the document.
  filed({
    slug: "criminal-record", office: "National Public Prosecution Authority (NPPA)", name: "Criminal record certificate", aka: "Police clearance",
    summary: "Request a criminal record certificate for a job, a visa or a tender. We file it on Irembo and send you the e-certificate when NPPA issues it. It is valid for 6 months.",
    who: [{ title: "Job applicants", body: "An employer asked for it." }, { title: "Visa and travel", body: "An embassy asked for it." }, { title: "Tenders", body: "A bid needs a recent certificate." }],
    requirements: ["Your National ID number", "What you need the certificate for"],
    documents: [doc("Passport photo", "Only if you are not Rwandan, a refugee or under 16", false, "Identification")],
    official: iremboFee(1200),
    ours: 3000, time: "About 21 days", docsShort: "National ID number", popular: true,
    purposeLabel: "What is it for?", purposes: ["A job", "A visa", "A tender", "Something else"],
  }),
  filed({
    slug: "driving-licence-copy", office: "Rwanda National Police", name: "Copy of a driving licence", aka: "Duplicate of a lost or damaged licence",
    summary: "Ask the police for another copy of a driving licence. We fill in the Irembo application with your details and send you the copy when it is ready.",
    who: [{ title: "Lost or stolen licences", body: "You need a copy to keep driving." }, { title: "Damaged cards", body: "The photo or the text can no longer be read." }, { title: "A licence left somewhere", body: "You cannot get the original back." }],
    requirements: ["Your National ID number", "The police station where you will collect it"],
    documents: [],
    questions: [{ key: "station", label: "Police station to collect it from", placeholder: "e.g. Remera", required: true }],
    notes: [{ kind: "info", title: "What to bring when you collect it", body: "A photocopy of your National ID, a letter to the Commissioner for Testing and Licensing saying why you need a copy, and the Irembo receipt we send you." }],
    official: direct("Irembo fee", "Irembo charges Rwf 25,000 for a copy. We send you the Irembo bill to pay with MoMo or Airtel Money; it does not pass through Inzira."),
    ours: 3000, time: "Within 21 days", docsShort: "National ID number", popular: true,
  }),
  filed({
    slug: "traffic-fine", office: "Rwanda National Police", name: "Pay a traffic fine", aka: "Contravention",
    summary: "Pay a traffic fine without filling in the Irembo form yourself. Send a photo of the ticket or the plate number. We submit that payment and keep the receipt. We do not search a police register.",
    who: [{ title: "Drivers", body: "A fine from a traffic stop." }, { title: "Vehicle owners", body: "A fine recorded on the plate." }, { title: "Someone helping a relative", body: "The fine is in another person’s name." }],
    requirements: ["The plate number and the TIN on the yellow card, or the ticket number"],
    documents: [doc("Photo of the ticket", "If you have it", false, "Other")],
    questions: [{ key: "plate", label: "Plate number or ticket number", placeholder: "e.g. RAD 123 A", required: true }, { key: "tin", label: "TIN on the yellow card", hint: "Not needed if you gave the ticket number" }],
    notes: [{ kind: "warn", title: "The fine is paid within the hour", body: "Irembo cancels a fine bill after one hour. We look the fine up, send you one total with our fee, and pay the bill as soon as you pay us." }],
    official: toConfirm("Rwanda National Police"), idPolicy: "none",
    ours: 2000, time: "Usually the same day", docsShort: "Plate number and TIN, or the ticket",
    purposeLabel: "Whose fine is it?", purposes: ["Mine", "A family member", "A vehicle I own"],
  }),
  filed({
    slug: "burundi-licence-exchange", office: "Rwanda National Police", name: "Exchange a Burundi driving licence", aka: "Replace a Burundi licence with a Rwandan one",
    summary: "Turn a Burundi driving licence into a Rwandan one. We prepare the police application on Irembo and tell you if a test or extra paper is still required.",
    who: [{ title: "Burundian drivers in Rwanda", body: "Who need a Rwandan licence." }, { title: "New residents", body: "Settling and starting work." }],
    requirements: ["The Burundi licence", "A passport or a national ID", "Where you live in Rwanda"],
    documents: [doc("Burundi driving licence", "Clear photo of both sides", true, "Certificates"), doc("Passport or national ID", "The page with your photo", true, "Identification"), doc("Passport photo", "A recent photo of your face", true, "Identification")],
    ours: 8000, time: "Usually 1–2 weeks", docsShort: "Burundi licence, passport or ID", idPolicy: "unsure",
  }),
  filed({
    slug: "driving-licence-correction", office: "Rwanda National Police", name: "Correct a driving licence",
    summary: "Fix a mistake on a driving licence, such as a name, a date or a category. We submit the correction and send you the corrected card.",
    who: [{ title: "A wrong name or date", body: "It does not match your ID." }, { title: "A missing category", body: "The card left off a class you passed." }],
    requirements: ["Your National ID number", "What is wrong, and what it should say"],
    questions: [{ key: "wrong", label: "What is wrong, and what it should say", placeholder: "e.g. the name should read Mukamana Aline", required: true }],
    documents: [doc("The licence to correct", "Clear photo of both sides", true, "Certificates"), doc("Paper that shows the right detail", "Only if the ID alone does not prove it", false, "Other")],
    ours: 3000, time: "Usually a few working days", docsShort: "National ID, current licence",
  }),
  filed({
    slug: "driving-licence-issuance", office: "Rwanda National Police", name: "Collect a driving licence you passed", aka: "Licence after a successful test",
    summary: "Get the driving licence after you have passed the test. We file the request for the card and send it to you when the police issue it.",
    who: [{ title: "New drivers", body: "The test is already passed." }, { title: "An extra category", body: "You passed a class to add to your licence." }],
    requirements: ["Your National ID number", "The test you passed, and when", "The police station where you will collect it"],
    documents: [doc("Test slip or provisional permit", "If the centre gave you one", false, "Certificates")],
    questions: [{ key: "station", label: "Police station to collect it from", placeholder: "e.g. Remera", required: true }],
    ours: 3000, time: "Usually a few working days", docsShort: "National ID number",
  }),
  filed({
    slug: "driving-test-results", office: "Rwanda National Police", name: "Driving test results", aka: "Marks from the driving exam",
    summary: "Get the result of a driving test. We request it with your details and send you what the police recorded. A result is not a licence.",
    who: [{ title: "Candidates waiting", body: "Who want the marks in writing." }, { title: "People who sat the test", body: "And were not told the score clearly." }],
    requirements: ["Your National ID number", "When and where you sat the test, if you know"],
    documents: [doc("Candidate number", "If the testing centre gave you one", false, "Other")],
    ours: 2000, time: "Usually 1–3 working days", docsShort: "National ID number",
  }),
  filed({
    slug: "driving-test-booking", office: "Rwanda National Police", name: "Book a driving test", aka: "Register to sit the driving exam",
    summary: "Register for a driving test. We book it on Irembo in the category you need and send you the date and place.",
    who: [{ title: "First licence", body: "Booking the theory or practical test." }, { title: "Another category", body: "Adding a class to a licence you have." }],
    requirements: ["Your National ID number", "The category you want to sit", "For the definitive test: your physical provisional licence"],
    documents: [doc("Provisional licence", "For the definitive test only", false, "Certificates")],
    questions: [{ key: "centre", label: "Test centre and the date you would like", placeholder: "e.g. Busanza, any day next week", required: true }],
    notes: [{ kind: "warn", title: "Pay the Irembo bill within 8 hours", body: "Irembo releases the test slot if its bill is not paid within 8 hours, and the details cannot be changed once the bill exists. We send it the moment we book: pay it straight away." }],
    official: direct("Irembo fee", "Rwf 5,000 for a provisional test and Rwf 10,000 for a definitive test (Busanza costs more). You pay the Irembo bill we send you with MoMo or Airtel Money."),
    ours: 4000, time: "The date depends on the testing centre", docsShort: "National ID number",
    purposeLabel: "Which test?", purposes: ["Category A (motorcycle)", "Category B (car)", "Another category", "I am not sure"],
  }),
  filed({
    slug: "driving-licence-renewal", office: "Rwanda National Police", name: "Renew a driving licence", aka: "Extend a licence that is expiring",
    summary: "Renew a driving licence in the 14 days before it expires. We submit the renewal and tell you when the new card is ready at the police station you chose.",
    who: [{ title: "Licences about to expire", body: "Renew before the date on the card." }, { title: "Licences already expired", body: "We tell you if a test is required again." }],
    requirements: ["Your National ID number", "The police station where you will collect it", "The expiry date on your licence"],
    documents: [],
    questions: [{ key: "station", label: "Police station to collect it from", placeholder: "e.g. Remera", required: true }, { key: "expiry", label: "Expiry date on your licence", hint: "Renewal opens 14 days before it", placeholder: "e.g. 30 November 2026" }],
    official: iremboFee(5000),
    ours: 3000, time: "About 7 days", docsShort: "National ID number", popular: true,
  }),
  filed({
    slug: "vehicle-inspection", office: "Rwanda National Police", name: "Vehicle inspection and emissions", aka: "Technical inspection and exhaust check",
    summary: "Book the technical inspection and the emissions check for a vehicle. We prepare the request, tell you where to take the vehicle, and send you the certificate when it passes.",
    who: [{ title: "Car and moto owners", body: "The inspection is due." }, { title: "Vehicles for sale", body: "A buyer asked for a valid inspection." }, { title: "Transport operators", body: "A vehicle that works every day." }],
    requirements: ["The plate number", "The owner’s National ID number"],
    documents: [doc("Yellow card", "Vehicle registration certificate", false, "Other"), doc("Insurance certificate", "If it is still valid", false, "Other")],
    questions: [{ key: "plate", label: "Plate number", placeholder: "e.g. RAD 123 A", required: true }],
    ours: 5000, time: "The day you take the vehicle in, then a few days for the certificate", docsShort: "Plate number, owner’s ID number",
  }),

  // ---------------- Certificates and identity papers, filed on Irembo ----------------
  filed({
    slug: "birth-certificate", office: "Civil registration", category: "papers", name: "Birth certificate",
    summary: "Request a birth certificate for you or your child. We file it on Irembo and send you the e-certificate, usually the next working day.",
    who: [{ title: "Parents", body: "A certificate for a child." }, { title: "Adults", body: "A certificate in your own name." }, { title: "Schools and travel", body: "A form asked for a recent copy." }],
    requirements: ["The National ID number, or the child’s application number"],
    documents: [],
    official: iremboFee(500),
    ours: 2000, time: "Usually the next working day", docsShort: "National ID number", popular: true,
    purposeLabel: "Who is it for?", purposes: ["Myself", "My child", "Another family member"],
  }),
  filed({
    slug: "marriage-certificate", office: "Civil registration", category: "papers", name: "Marriage certificate",
    summary: "Request a marriage certificate. We file the application and send you the certificate when it is issued.",
    who: [{ title: "Married couples", body: "A bank, a school or travel asked for it." }, { title: "Recently married", body: "The first certificate after the wedding." }],
    requirements: ["Your National ID number"],
    documents: [],
    official: iremboFee(500),
    ours: 2000, time: "Usually the next working day", docsShort: "National ID number",
  }),
  filed({
    slug: "death-certificate", office: "Civil registration", category: "papers", name: "Death certificate",
    summary: "Request a death certificate for a relative. We file it and send you the certificate so you can use it for the family, the bank or the land.",
    who: [{ title: "Families", body: "After a death in the household." }, { title: "Heirs", body: "A bank or the land office asked for it." }],
    requirements: ["Your National ID number", "The ID number of the person who died"],
    documents: [doc("Burial or hospital paper", "Only if the death has never been registered", false, "Certificates")],
    questions: [{ key: "deceased", label: "ID number of the person who died", hint: "If you know it" }],
    notes: [{ kind: "info", title: "A death never registered before", body: "Irembo then also needs two witnesses and a declarant. We tell you who and what before anything is filed." }],
    official: iremboFee(1500),
    ours: 2000, time: "Usually the next working day", docsShort: "Your ID number and theirs",
  }),
  filed({
    slug: "residence-certificate", office: "Civil registration", category: "papers", name: "Certificate of residence",
    summary: "Request a certificate of where you live. We file it with your address and send you the certificate.",
    who: [{ title: "Banks and schools", body: "A form asked for proof of address." }, { title: "New arrivals in a cell", body: "You have just moved." }],
    requirements: ["Your National ID number", "Where you live now"],
    documents: [],
    questions: [{ key: "address", label: "Where you live now", hint: "District, sector, cell and village", placeholder: "e.g. Gasabo, Remera, Rukiri I, Amahoro", required: true }],
    official: iremboFee(1500),
    ours: 2000, time: "Usually the next working day", docsShort: "National ID number, address",
  }),
  filed({
    slug: "single-status", office: "Civil registration", category: "papers", name: "Certificate of being single",
    summary: "Request a certificate that you are not married. We file it and send you the certificate. It is not a check of any other country’s records.",
    who: [{ title: "People about to marry", body: "The office asked for it." }, { title: "Visa files", body: "An embassy asked for it." }],
    requirements: ["Your National ID number", "NIDA must already list you as single"],
    documents: [],
    notes: [{ kind: "warn", title: "Only if NIDA lists you as single", body: "Irembo refuses this certificate when NIDA shows another civil status. If yours is wrong, it has to be corrected at your sector first." }],
    official: iremboFee(500),
    ours: 2000, time: "Usually the next working day", docsShort: "National ID number",
  }),
  filed({
    slug: "passport-application", office: "Immigration", category: "papers", name: "Passport application", aka: "First passport, renewal or replacement",
    summary: "Apply for a Rwandan passport, or renew or replace one. We prepare the file and submit it. You still attend any appointment the immigration office requires, and we tell you when.",
    who: [{ title: "First passport", body: "You have never held one." }, { title: "Renewal", body: "The current passport is full or expiring." }, { title: "Lost passport", body: "A replacement after a loss." }],
    requirements: ["Your national ID", "Whether this is a first passport, a renewal or a replacement"],
    documents: [doc("Passport photo", "A recent photo on a white background", true, "Identification"), doc("Your signature", "Sign on white paper and take a photo", true, "Identification"), doc("Copy of your National ID", "Both sides", true, "Identification"), doc("Current passport", "Photo of the data page, for a renewal", false, "Certificates")],
    ours: 8000, time: "About 4 working days, then collection at the office you choose", docsShort: "Photo, signature, ID copy", popular: true,
    purposeLabel: "Which application?", purposes: ["First passport", "Renewal", "Replacement of a lost passport"],
  }),
  filed({
    slug: "id-card-replacement", office: "National identification", category: "papers", name: "Replacement of a national ID card", aka: "Lost, stolen or damaged ID card",
    summary: "Ask for a new national ID card when yours is lost, stolen or damaged. We file the request on Irembo; RIB then asks you to visit once before the card is made, and you collect it where you chose.",
    who: [{ title: "Lost or stolen cards", body: "You need a card to keep using services." }, { title: "Damaged cards", body: "The photo or the text can no longer be read." }],
    requirements: ["Your ID number, if you know it", "The RIB office to visit and where to collect the new card"],
    documents: [doc("Any remaining piece of the card", "A photo, if you still have it", false, "Identification")],
    questions: [{ key: "office", label: "RIB office and where to collect the new card", placeholder: "e.g. RIB Remera, collect at Remera sector", required: true }],
    official: iremboFee(1500),
    ours: 5000, time: "About 30 days", docsShort: "ID number, RIB office", idPolicy: "unsure",
    purposeLabel: "What happened?", purposes: ["Lost", "Stolen", "Damaged"],
    notes: [{ kind: "info", title: "One visit to RIB", body: "RIB asks you to come once before the card is made. A temporary ID costs Rwf 3,000 more on Irembo; ask us if you need one." }],
  }),

  // ---------------- not in the catalogue ----------------
  // Requests started from "Describe what you need" use this until the agent knows what applies.
  {
    slug: "other-online-service", name: "Other online service", aka: "Process and fee agreed with you",
    category: "other", authority: "To be confirmed", channel: "To be confirmed", via: "Process agreed with you",
    summary: "A service that is not in our catalogue. Your agent works out which procedure applies and agrees our fee with you before anything starts.",
    who: [], requirements: [], documents: [], steps: procedure("the official channel", "The institution"), notes: [],
    official: toConfirm("the institution"), ours: 0,
    time: "Agreed with you", docsShort: "Your agent tells you", audience: ["individual", "business", "organization"], visible: false,
  },

  // ---------------- Irembo ----------------
  {
    slug: "irembo-training", name: "Irembo training", aka: "Learn to use Irembo services yourself",
    category: "irembo", authority: "Inzira", channel: "Training by Inzira", via: "Online or at our office",
    summary: "Learn to use Irembo confidently: find the right service, fill in applications, pay bills and follow up on results. Sessions run online or at our office, and the fee is per month.",
    who: [{ title: "Cyber cafés & service agents", body: "Who apply on behalf of customers." }, { title: "Office staff", body: "Who handle applications for a business." }, { title: "Individuals", body: "Who want to do it themselves." }],
    requirements: ["A phone or computer with internet", "An email address or phone number for your Irembo account"],
    documents: [],
    steps: training, notes: [], ...trainingFlow,
    official: none, ours: 50000, oursUnit: "per month",
    time: "Online or at our office", docsShort: "No documents needed", audience: ["individual", "business", "organization"], visible: true,
  },
];
