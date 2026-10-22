// Domain model for Inzira.
// A request is ONE record. The customer, the agent and the admin all look at the same request;
// what differs is which fields each of them may see (lib/repo.ts decides that).
// Money is whole Rwandan francs. Dates are ISO 8601 strings.

export type Tone = "neutral" | "info" | "ok" | "warn" | "err" | "act" | "teal" | "violet";

// ---------------- catalogue ----------------
/** `href` sends the category somewhere other than the filtered catalogue (e.g. "other" opens /start). */
export type Category = { id: string; icon: string; name: string; short: string; desc: string; href?: string };
export type Audience = "individual" | "business" | "organization";
/** Whether a service asks for a National ID number. "unsure" means it is optional and an administrator should confirm the rule. */
export type IdPolicy = "required" | "none" | "unsure";
/**
 * Manual review of an ID that was required for one request.
 * "checked" means a member of staff compared the documents the client sent. It is not a government verification.
 */
export type IdReview = "pending" | "checked" | "correction" | "unable";
export type OfficialMode = "direct" | "none";
export type DocGroup = "Identification" | "Business documents" | "Tax documents" | "Land documents" | "Certificates" | "Other";
export type ServiceDocument = { name: string; detail: string; required: boolean; group: DocGroup };
/** A short question a service asks when a request is started, such as the plate number or the pickup station.
 *  `key` stays the same across languages; the answer reaches the agent under the English label. */
export type ServiceQuestion = { key: string; label: string; hint?: string; placeholder?: string; required?: boolean };
/** An answer to a ServiceQuestion, kept on the request. */
export type ServiceAnswer = { key: string; label: string; value: string };
/** Where a customer wants the finished document sent. */
export type DeliverVia = "whatsapp" | "email";

export type Service = {
  slug: string;
  name: string;
  aka?: string;
  /** One line of 12 words or fewer, shown under the name: what the customer gets. The summary keeps the detail. */
  tagline?: string;
  category: string;
  authority: string;
  channel: string;
  via: string;
  summary: string;
  who: { title: string; body: string }[];
  requirements: string[];
  documents: ServiceDocument[];
  steps: { title: string; body: string; you?: boolean }[];
  notes: { kind: "info" | "warn"; title: string; body: string }[];
  /**
   * The institution's side of the price.
   * - mode unset: passed through Inzira. amount = fixed fee, 0 = free, null = confirmed per case.
   * - mode "direct": the customer pays the institution themselves (taxes, Irembo bills). amount is null.
   * - mode "none": there is no official fee at all (our trainings).
   * verifiedAt is unset until someone has checked the amount with the institution.
   */
  official: { amount: number | null; mode?: OfficialMode; label?: string; note: string; verifiedAt?: string };
  ours: number;
  oursUnit?: string;
  time: string;
  docsShort: string;
  popular?: boolean;
  audience: Audience[];
  /** Choices offered when a customer starts a request, under `purposeLabel` (default "What is it for?"). */
  purposes?: string[];
  purposeLabel?: string;
  /** The service's own questions, asked with the name and ID (0 to 3). Documents are asked for separately. */
  questions?: ServiceQuestion[];
  /** True when we do not need the customer's national ID number to start (e.g. booking a training). Kept in step with `idPolicy === "none"`. */
  noId?: boolean;
  /** Whether this service collects a National ID number. Unset on older catalogue rows: see idPolicyOf. */
  idPolicy?: IdPolicy;
  /** The stages this kind of work goes through. Default: all five. Trainings skip the institution. */
  flow?: Stage[];
  /** Wording for a stage when the default does not fit this service. */
  stageLabels?: Partial<Record<Stage, string>>;
  visible: boolean;
};

export type { Permission } from "./permissions";
import type { Locale } from "./i18n/locale";

/** A sentence kept as a message key and its values (lib/i18n/stored.ts), so each reader sees it in
 *  their own language. Rows keep the English sentence as well, for anything that reads them raw. */
export type MsgVars = Record<string, string | number>;
export type Msg = { key: string; vars?: MsgVars };

// ---------------- people ----------------
/** An account is one login (a phone number). It can hold several profiles. */
export type Account = { id: string; name: string; first: string; phone: string; email?: string; /** Has signed in to the portal at least once. */ registered?: boolean; whatsapp: boolean; languages: string[]; since: string;
  /** The language of their portal and of every SMS we send them. */
  locale: Locale };
/** Who a request is for: the account holder, a family member, or a business they act for. */
export type Profile = {
  id: string; accountId: string; kind: "person" | "business" | "organization"; name: string;
  relation?: "self" | "family"; idMasked?: string; tinMasked?: string | null; district?: string; phone?: string; email?: string;
  /** As typed from the ID, "YYYY-MM-DD", and when Inzira staff compared it with the ID photo. */
  dateOfBirth?: string; idChecked?: string;
};
// The full national ID and TIN never leave the server: screens get the masked forms, and staff
// reveal the full number through an audited action (app/actions/console.ts).
export type StaffRole = "Owner" | "Administrator" | "Supervisor" | "Agent" | "Finance" | "Quality reviewer";
export type Staff = { id: string; name: string; role: StaffRole; team: string; title: string; active: boolean };

// ---------------- requests ----------------
/** Progress. A request only ever sits in one stage, and each stage says who has the work. */
export const STAGES = ["received", "checking", "preparing", "institution", "completed"] as const;
export type Stage = (typeof STAGES)[number];

/** A blocker on the current stage. It never replaces the stage: clear it and the request carries on. */
export type Hold = {
  reason: "document" | "information" | "payment";
  title: string;
  detail: string;
  since: string;
  /** True when the institution sent the application back. */
  returned?: boolean;
  /** title (and detail, unless the detail is someone's own words) as a message. */
  msg?: Msg;
};
/** How a request ended when it did not complete. `msg` is set when the reason is ours, not typed by staff. */
export type Closed = { kind: "cancelled" | "rejected"; at: string; reason: string; msg?: Msg };
/** The minimum needed to show where a request is: enough for a badge and the timeline. */
export type Progress = {
  stage: Stage; stageDates: Partial<Record<Stage, string>>; hold?: { returned?: boolean }; closed?: { kind: Closed["kind"]; at: string };
  /** The stages this request goes through, and their wording. Default: all five, standard labels. */
  flow?: readonly Stage[]; labels?: Partial<Record<Stage, string>>;
};

export type DocStatus = "required" | "received" | "approved" | "rejected";
export type RequestDoc = {
  id: string; name: string; group: DocGroup; required: boolean; status: DocStatus;
  file?: { name: string; size: string; uploadedAt: string; id?: string };
  note?: string; reviewedAt?: string; reviewedBy?: string;
};
export type Deliverable = { id: string; name: string; issuedAt: string; issuedBy: string; fileId?: string };

/** `by` is "customer", "system" or a staff id. `name` is filled in by the repo. */
/** `key` names the stored message (e.g. "ev.resubmitted"), when the event has one. */
export type RequestEvent = { at: string; key?: string; title: string; by?: string; name?: string; body?: string };
export type Message = { id: string; at: string; by: string; name?: string; body: string };
export type Note = { id: string; at: string; by: string; name?: string; body: string };

export type PayMethod = "MTN MoMo" | "Airtel Money" | "Bank transfer" | "Card" | "Cash";
export type Transaction = { receipt: string; at: string; method: PayMethod; official: number; ours: number; status: "pending" | "paid" | "failed" | "refunded"; payer?: string; providerRef?: string };
export type Billing = {
  invoice: string;
  /** null until the agent has confirmed what the institution charges for this case. */
  official: number | null;
  officialLabel: string;
  /** "direct": the customer pays the institution themselves, so it never passes through us.
   *  "none": there is no official fee. Unset: passed through Inzira. */
  officialMode?: OfficialMode;
  ours: number;
  /** The catalogue price. If `ours` differs, a supervisor approved the change. */
  oursStandard: number;
  oursUnit?: string;
  /** How `ours` was worked out when it is not simply the catalogue price, e.g. "2 UPIs × RWF 1,000". */
  oursNote?: string;
  /** estimate: amounts not final · confirmed: agent sent the quote · approved: customer agreed. */
  quote: "estimate" | "confirmed" | "approved";
  dueAt?: string;
  officialReceipt: "attached" | "awaiting" | "na";
  /** Paid to send a quoted request (lib/pricing.ts), then counted toward our fee like any other payment. */
  reviewFee?: number;
  transactions: Transaction[];
};

/** Pay to submit: "open" until the checkout is paid, then "paid". "none" for a request that is checked and quoted first. */
export type Checkout = "none" | "open" | "paid";

export type Request = {
  ref: string;
  serviceSlug: string;
  /** Shown instead of the service name when one service recurs, e.g. "Monthly tax declarations · September 2026". */
  title?: string;
  profileId: string;
  agentId: string | null;
  openedAt: string;
  stage: Stage;
  /** When each stage was entered. */
  stageDates: Partial<Record<Stage, string>>;
  hold?: Hold;
  closed?: Closed;
  channel: string;
  officialRef?: string;
  dependsOn?: string;
  /** The reason the customer picked when starting, e.g. "Add a spouse after marriage". */
  purpose?: string;
  /** Answers to the service's own questions (plate number, pickup station…). */
  answers?: ServiceAnswer[];
  /** Where the customer wants the finished document. Unset on requests sent before they could choose. */
  deliverVia?: DeliverVia;
  /** The institution's bill number (an Irembo Bill ID), once staff have filed. */
  officialBill?: string;
  /** The service's ID rule at the moment this request was sent. Later catalogue edits do not change it. */
  idPolicy?: IdPolicy;
  /** True when this application required a National ID number. Review exists only then. */
  idRequired?: boolean;
  /** Manual review outcome. Empty when no ID was required, or when this request predates a review. */
  idReview?: IdReview;
  /** Staff note on the review. Never sent to the customer. */
  idReviewNote?: string;
  idReviewedAt?: string;
  idReviewedBy?: string;
  /** True when the client acknowledged the ID privacy notice before the number was stored. */
  idConsent?: boolean;
  /** Service requirements copied at submission, so a later edit does not rewrite what this client was told. */
  requirementsSnapshot?: string[];
  /** What the customer reads at the top of the request when nothing is blocking it. With `msg`, the
   *  message also gives `next`. */
  summary: { title: string; body: string; msg?: Msg };
  /** One line for lists: what happens next and who does it. */
  next: string;
  billing: Billing;
  documents: RequestDoc[];
  deliverables: Deliverable[];
  messages: Message[];
  events: RequestEvent[];
  /** Internal. Never sent to the customer. */
  notes: Note[];
  followUp?: { at: string; what: string };
  handover?: { at: string; by: string; body: string };
  /** Absent for an ordinary request. */
  checkout?: Exclude<Checkout, "none">;
};
export type StaffAlert = {
  id: string; icon: string; title: string; body?: string; href: string; ref?: string; at: string; unread: boolean;
};

/** A request joined with the records it points to. This is what staff screens receive. */
export type RequestView = Request & {
  service: Service; profile: Profile; account: Account; agent: Staff | null; updatedAt: string;
  /** title or service name. */
  name: string;
  flow: Stage[];
  labels: Partial<Record<Stage, string>>;
};
/** What the customer's own screens receive: the same request without internal fields. */
export type CustomerRequest = Omit<RequestView, "notes" | "followUp" | "handover" | "idReviewNote" | "idReviewedBy">;

export type LibraryDoc = {
  key: string; ref: string; name: string; group: DocGroup;
  status: DocStatus | "issued"; meta: string; action?: "replace" | "upload" | "download";
  /** Set when there is a stored file that can be downloaded. */
  fileId?: string;
};
export type Notification = { id: string; icon: string; title: string; at: string; unread?: boolean; href: string };
export type AuditEntry = { at: string; actor: string; role: string; action: string; entity: string; source: string; fee: boolean };
export type TrackResult = {
  ref: string; name: string; via: string; stage: Stage; stageDates: Request["stageDates"]; flow: Stage[]; labels: Partial<Record<Stage, string>>;
  hold?: Pick<Hold, "reason" | "title" | "since" | "returned">; closed?: Closed; next: string;
  /** Set only when this request required a National ID. Absent otherwise, so tracking does not show an irrelevant status. */
  idReview?: IdReview;
};

// ---------------- console extensions ----------------
export type SavedView = {
  id: string;
  entity: "requests" | "clients";
  name: string;
  filters: Record<string, unknown>;
  columns?: string[];
  sort?: { col: string; dir: "asc" | "desc" };
  isDefault?: boolean;
  staffId?: string | null;
};

export type StageTarget = {
  stage: Stage;
  targetHours: number;
};

export type ClientTag = {
  id: number;
  profileId: string;
  tag: string;
};

export type ClientSummary = {
  id: string; // profileId
  accountId: string;
  name: string;
  kind: "person" | "business" | "organization";
  phone: string;
  district?: string;
  idMasked?: string;
  tinMasked?: string;
  openRequests: number;
  totalRequests: number;
  totalPaidOurs: number;
  totalPaidOfficial: number;
  balanceDue: number;
  lastActivity: string;
  tags: string[];
  since: string;
};

export type ClientDetail = ClientSummary & {
  account: Account;
  profile: Profile;
  requests: RequestView[];
  documents: LibraryDoc[];
  messages: Message[];
  notes: Note[];
  events: RequestEvent[];
};

