// Domain model for Inzira.
// A request is ONE record. The customer, the agent and the admin all look at the same request;
// what differs is which fields each of them may see (lib/repo.ts decides that).
// Money is whole Rwandan francs. Dates are ISO 8601 strings.

export type Tone = "neutral" | "info" | "ok" | "warn" | "err" | "act" | "teal" | "violet";

// ---------------- catalogue ----------------
/** `href` sends the category somewhere other than the filtered catalogue (e.g. "other" opens /start). */
export type Category = { id: string; icon: string; name: string; short: string; desc: string; href?: string };
export type Audience = "individual" | "business" | "organization";
export type OfficialMode = "direct" | "none";
export type DocGroup = "Identification" | "Business documents" | "Tax documents" | "Land documents" | "Certificates" | "Other";
export type ServiceDocument = { name: string; detail: string; required: boolean; group: DocGroup };

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
  /** True when we do not need the customer's national ID number to start (e.g. booking a training). */
  noId?: boolean;
  /** The stages this kind of work goes through. Default: all five. Trainings skip the institution. */
  flow?: Stage[];
  /** Wording for a stage when the default does not fit this service. */
  stageLabels?: Partial<Record<Stage, string>>;
  visible: boolean;
};

export type { Permission } from "./permissions";

// ---------------- people ----------------
/** An account is one login (a phone number). It can hold several profiles. */
export type Account = { id: string; name: string; first: string; phone: string; email?: string | null; whatsapp: boolean; languages: string[]; since: string };
/** Who a request is for: the account holder, a family member, or a business they act for. */
export type Profile = {
  id: string; accountId: string; kind: "person" | "business" | "organization"; name: string;
  relation?: "self" | "family"; idMasked?: string; nationalId?: string | null; tin?: string | null; tinMasked?: string | null; district?: string; phone?: string; email?: string;
};
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
};
/** How a request ended when it did not complete. */
export type Closed = { kind: "cancelled" | "rejected"; at: string; reason: string };
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
export type RequestEvent = { at: string; title: string; by?: string; name?: string; body?: string };
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
  transactions: Transaction[];
};

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
  /** What the customer reads at the top of the request when nothing is blocking it. */
  summary: { title: string; body: string };
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
export type CustomerRequest = Omit<RequestView, "notes" | "followUp">;

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
  nationalId?: string;
  idMasked?: string;
  tin?: string;
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

