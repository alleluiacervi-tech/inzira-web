// Database schema (Postgres). Mirrors the domain model in lib/types.ts.
// Change this file, then run `npm run db:generate` to write a migration into ./drizzle.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Locale } from "../i18n/locale";
import type { Checkout, Closed, DocGroup, DocStatus, Hold, IdPolicy, IdReview, MsgVars, OfficialMode, Request, Service, Stage, StaffRole } from "../types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ---------------- catalogue ----------------
export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  icon: text("icon").notNull(),
  name: text("name").notNull(),
  short: text("short").notNull(),
  desc: text("desc").notNull(),
  href: text("href"),
  position: integer("position").notNull().default(0),
});

export const services = pgTable("services", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  aka: text("aka"),
  category: text("category").notNull().references(() => categories.id),
  authority: text("authority").notNull(),
  channel: text("channel").notNull(),
  via: text("via").notNull(),
  summary: text("summary").notNull(),
  who: jsonb("who").$type<Service["who"]>().notNull(),
  requirements: jsonb("requirements").$type<string[]>().notNull(),
  documents: jsonb("documents").$type<Service["documents"]>().notNull(),
  steps: jsonb("steps").$type<Service["steps"]>().notNull(),
  notes: jsonb("notes").$type<Service["notes"]>().notNull(),
  officialAmount: integer("official_amount"),
  officialMode: text("official_mode").$type<OfficialMode>(),
  officialLabel: text("official_label"),
  officialNote: text("official_note").notNull(),
  officialVerifiedAt: ts("official_verified_at"),
  ours: integer("ours").notNull(),
  oursUnit: text("ours_unit"),
  time: text("time").notNull(),
  docsShort: text("docs_short").notNull(),
  popular: boolean("popular").notNull().default(false),
  audience: jsonb("audience").$type<Service["audience"]>().notNull(),
  purposes: jsonb("purposes").$type<string[]>(),
  purposeLabel: text("purpose_label"),
  noId: boolean("no_id").notNull().default(false),
  /** required: ask for a National ID. none: do not ask. unsure: optional, and an administrator should confirm the rule. */
  idPolicy: text("id_policy").$type<IdPolicy>().notNull().default("unsure"),
  flow: jsonb("flow").$type<Stage[]>(),
  stageLabels: jsonb("stage_labels").$type<Partial<Record<Stage, string>>>(),
  visible: boolean("visible").notNull().default(true),
  position: integer("position").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------------- people ----------------
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  first: text("first").notNull(),
  /** Nine digits after +250, e.g. 788123456. A contact number, and the sign-in for staff and for customers who
   *  have not added an email yet. Empty for someone who gave only an email. */
  phone: text("phone").unique(),
  /** Lower case. Confirmed with a code before it is saved, so only its owner can sign in with it. */
  email: text("email"),
  whatsapp: boolean("whatsapp").notNull().default(true),
  languages: jsonb("languages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  since: ts("since").notNull().defaultNow(),
  /** First time this person signed in to the portal. Empty for a client who never did (a walk-in entered by staff,
   *  or someone who only sent a request): they are contacts, not registered users. */
  registeredAt: ts("registered_at"),
  /** Set when the customer deleted their account. Personal details are then wiped; financial records stay. */
  deletedAt: ts("deleted_at"),
  /** Language of their portal and messages. */
  locale: text("locale").$type<Locale>().notNull().default("rw"),
}, (t) => [uniqueIndex("accounts_email_unique").on(sql`lower(${t.email})`)]);

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  kind: text("kind").$type<"person" | "business" | "organization">().notNull(),
  name: text("name").notNull(),
  relation: text("relation").$type<"self" | "family">(),
  idMasked: text("id_masked"),
  /** The full national ID number. Staff screens only; customers and the public see idMasked. */
  nationalId: text("national_id"),
  tinMasked: text("tin_masked"),
  tin: text("tin"),
  district: text("district"),
  /** As written on the ID, "YYYY-MM-DD". Entered by the customer; Inzira staff compare it with the ID photo. */
  dateOfBirth: text("date_of_birth"),
  /** When a member of staff compared the details with the ID photo. This is our own check, not a government one. */
  idCheckedAt: ts("id_checked_at"),
  idCheckedBy: text("id_checked_by"),
}, (t) => [index("profiles_account_idx").on(t.accountId)]);

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").unique(),
  /** Work email. In the demo, the owner signs in to the dashboard with admin@inzira.test. */
  email: text("email"),
  role: text("role").$type<StaffRole>().notNull(),
  team: text("team").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
  /** Authenticator-app secret, encrypted (lib/crypto.ts). Set when the person turns the second step on. */
  totpSecret: text("totp_secret"),
  totpEnabledAt: ts("totp_enabled_at"),
  /** The last 30-second step accepted, so one code cannot be used twice. */
  totpLastStep: integer("totp_last_step"),
  /** SHA-256 hashes of the unused recovery codes. */
  totpRecovery: jsonb("totp_recovery").$type<string[]>(),
}, (t) => [uniqueIndex("staff_email_unique").on(sql`lower(${t.email})`)]);

/** One row per role and permission; `allowed` is what the roles matrix in the admin console edits. */
export const rolePermissions = pgTable("role_permissions", {
  role: text("role").$type<StaffRole>().notNull(),
  permission: text("permission").notNull(),
  allowed: boolean("allowed").notNull(),
}, (t) => [primaryKey({ columns: [t.role, t.permission] })]);

// ---------------- requests ----------------
export const requests = pgTable("requests", {
  ref: text("ref").primaryKey(),
  serviceSlug: text("service_slug").notNull().references(() => services.slug),
  title: text("title"),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  agentId: text("agent_id").references(() => staff.id),
  openedAt: ts("opened_at").notNull().defaultNow(),
  stage: text("stage").$type<Stage>().notNull(),
  stageDates: jsonb("stage_dates").$type<Partial<Record<Stage, string>>>().notNull(),
  hold: jsonb("hold").$type<Hold>(),
  closed: jsonb("closed").$type<Closed>(),
  channel: text("channel").notNull(),
  officialRef: text("official_ref"),
  dependsOn: text("depends_on"),
  summary: jsonb("summary").$type<Request["summary"]>().notNull(),
  next: text("next").notNull(),
  purpose: text("purpose"),
  /** Copied from the service when the request was sent. */
  idPolicy: text("id_policy").$type<IdPolicy>().notNull().default("none"),
  /** True only when this application made a National ID number mandatory. */
  idRequired: boolean("id_required").notNull().default(false),
  idReview: text("id_review").$type<IdReview>(),
  /** Internal. The customer-facing correction is the hold, which does not contain the number. */
  idReviewNote: text("id_review_note"),
  idReviewAt: ts("id_review_at"),
  idReviewBy: text("id_review_by"),
  idConsent: boolean("id_consent").notNull().default(false),
  requirementsSnapshot: jsonb("requirements_snapshot").$type<string[]>(),
  followUp: jsonb("follow_up").$type<{ at: string; what: string }>(),
  /** Last note written when the case moved from one agent to another. */
  handover: jsonb("handover").$type<{ at: string; by: string; body: string }>(),
  /** Pay to submit (lib/pricing.ts). "open": started at checkout and not paid yet, so staff do not see it in their queues;
   *  "paid": paid at checkout and handed to staff; "none": an ordinary request, checked and quoted first. */
  checkout: text("checkout").$type<Checkout>().notNull().default("none"),
  // billing — always two lines: official (institution) and ours (Inzira)
  invoice: text("invoice").notNull().unique(),
  official: integer("official"),
  officialMode: text("official_mode").$type<OfficialMode>(),
  officialLabel: text("official_label").notNull(),
  ours: integer("ours").notNull(),
  oursStandard: integer("ours_standard").notNull(),
  oursUnit: text("ours_unit"),
  oursNote: text("ours_note"),
  quote: text("quote").$type<"estimate" | "confirmed" | "approved">().notNull(),
  dueAt: ts("due_at"),
  officialReceipt: text("official_receipt").$type<"attached" | "awaiting" | "na">().notNull(),
}, (t) => [
  index("requests_profile_idx").on(t.profileId),
  index("requests_agent_idx").on(t.agentId),
  index("requests_id_review_idx").on(t.idReview),
]);

export const requestDocuments = pgTable("request_documents", {
  id: text("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  position: integer("position").notNull().default(0),
  name: text("name").notNull(),
  group: text("group").$type<DocGroup>().notNull(),
  required: boolean("required").notNull(),
  status: text("status").$type<DocStatus>().notNull(),
  fileId: text("file_id"),
  fileName: text("file_name"),
  fileSize: text("file_size"),
  uploadedAt: ts("uploaded_at"),
  note: text("note"),
  reviewedAt: ts("reviewed_at"),
  reviewedBy: text("reviewed_by"),
}, (t) => [index("request_documents_ref_idx").on(t.ref)]);

export const deliverables = pgTable("deliverables", {
  id: text("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  name: text("name").notNull(),
  issuedAt: ts("issued_at").notNull(),
  issuedBy: text("issued_by").notNull(),
  fileId: text("file_id"),
}, (t) => [index("deliverables_ref_idx").on(t.ref)]);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  at: ts("at").notNull().defaultNow(),
  /** "customer" or a staff id. */
  by: text("by").notNull(),
  body: text("body").notNull(),
}, (t) => [index("messages_ref_idx").on(t.ref)]);

/** Internal. Never sent to a customer. */
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  at: ts("at").notNull().defaultNow(),
  by: text("by").notNull(),
  body: text("body").notNull(),
}, (t) => [index("notes_ref_idx").on(t.ref)]);

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  at: ts("at").notNull().defaultNow(),
  /** English. With `key`, the title (and the body, if the message has one) is shown in the reader's language. */
  title: text("title").notNull(),
  /** "customer", "system" or a staff id. */
  by: text("by"),
  body: text("body"),
  key: text("key"),
  vars: jsonb("vars").$type<MsgVars>(),
}, (t) => [index("events_ref_idx").on(t.ref)]);

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  receipt: text("receipt").notNull(),
  at: ts("at").notNull().defaultNow(),
  method: text("method").$type<"MTN MoMo" | "Airtel Money" | "Bank transfer" | "Card" | "Cash">().notNull(),
  official: integer("official").notNull(),
  ours: integer("ours").notNull(),
  status: text("status").$type<"pending" | "paid" | "failed" | "refunded">().notNull(),
  /** Phone the prompt was sent to, and the payment provider's own reference. */
  payer: text("payer"),
  providerRef: text("provider_ref"),
}, (t) => [
  index("transactions_ref_idx").on(t.ref),
  // The Airtel callback finds a payment by the start of its provider reference.
  index("transactions_provider_ref_idx").on(t.providerRef.op("text_pattern_ops")),
  // One prompt waiting per request, enforced by the database, so two taps cannot send two prompts.
  uniqueIndex("transactions_one_pending").on(t.ref).where(sql`${t.status} = 'pending'`),
]);

/** Uploaded files. The bytes live in file storage (lib/storage.ts); this row says who may read them. */
export const files = pgTable("files", {
  id: text("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  storageKey: text("storage_key").notNull(),
  name: text("name").notNull(),
  mime: text("mime").notNull(),
  bytes: integer("bytes").notNull(),
  uploadedAt: ts("uploaded_at").notNull().defaultNow(),
  uploadedBy: text("uploaded_by").notNull(),
}, (t) => [index("files_ref_idx").on(t.ref)]);

/** In-app alerts for staff. Customer portal notifications stay on `notifications`. */
export const staffNotifications = pgTable("staff_notifications", {
  id: serial("id").primaryKey(),
  staffId: text("staff_id").notNull().references(() => staff.id),
  icon: text("icon").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  href: text("href").notNull(),
  ref: text("ref"),
  at: ts("at").notNull().defaultNow(),
  unread: boolean("unread").notNull().default(true),
}, (t) => [index("staff_notifications_staff_idx").on(t.staffId, t.unread, t.at)]);

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  icon: text("icon").notNull(),
  /** English. With `key`, shown in the customer's language. */
  title: text("title").notNull(),
  key: text("key"),
  vars: jsonb("vars").$type<MsgVars>(),
  at: ts("at").notNull().defaultNow(),
  unread: boolean("unread").notNull().default(true),
  href: text("href").notNull(),
}, (t) => [index("notifications_account_idx").on(t.accountId)]);

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  cta: text("cta").notNull(),
  href: text("href").notNull(),
  dismissed: boolean("dismissed").notNull().default(false),
});

export const audit = pgTable("audit", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actor: text("actor").notNull(),
  role: text("role").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  source: text("source").notNull(),
  fee: boolean("fee").notNull().default(false),
}, (t) => [index("audit_at_idx").on(t.at)]);

// ---------------- console extensions ----------------
export const clientTags = pgTable("client_tags", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  tag: text("tag").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("client_tags_profile_idx").on(t.profileId)]);

export const clientNotes = pgTable("client_notes", {
  id: serial("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  at: ts("at").notNull().defaultNow(),
  by: text("by").notNull(),
  body: text("body").notNull(),
}, (t) => [index("client_notes_profile_idx").on(t.profileId)]);

export const savedViews = pgTable("saved_views", {
  id: text("id").primaryKey(),
  entity: text("entity").$type<"requests" | "clients">().notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
  columns: jsonb("columns").$type<string[]>(),
  sort: jsonb("sort").$type<{ col: string; dir: "asc" | "desc" }>(),
  isDefault: boolean("is_default").notNull().default(false),
  staffId: text("staff_id").references(() => staff.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const stageTargets = pgTable("stage_targets", {
  stage: text("stage").$type<Stage>().primaryKey(),
  targetHours: integer("target_hours").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

// ---------------- sign-in ----------------
export const otpCodes = pgTable("otp_codes", {
  phone: text("phone").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: ts("sent_at").notNull().defaultNow(),
});

/** Sign-in and confirmation codes sent by email: one live code per address, like otp_codes for phones. */
export const emailCodes = pgTable("email_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: ts("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: ts("sent_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  id: text("id").primaryKey(),
  kind: text("kind").$type<"customer" | "staff" | "pending">().notNull(),
  subjectId: text("subject_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
}, (t) => [index("sessions_subject_idx").on(t.subjectId), index("sessions_expires_idx").on(t.expiresAt)]);

/** Running numbers for request references and invoices. */
export const counters = pgTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull(),
});

/** Attempts per key (e.g. "code:ip:1.2.3.4") in the current window, for rate limiting. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull(),
});

/** One row per run of the scheduled job, so the admin console can show when it last ran and what it did. */
export const jobRuns = pgTable("job_runs", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  ok: boolean("ok").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  ms: integer("ms").notNull(),
});

/** A tax we watch for one client. The dates are generated; this row says which tax and who pays RRA. */
export const taxWatches = pgTable("tax_watches", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  kind: text("kind").notNull(),
  /** through_us: the client sends Inzira the tax money. themselves: they pay RRA, and we cannot see it. */
  payRoute: text("pay_route").notNull(),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
}, (t) => [index("tax_watches_profile_idx").on(t.profileId)]);

/** One deadline. Paid only when payment_ref (the RRA reference) is set. money_* is the client’s transfer to Inzira. */
export const taxPeriods = pgTable("tax_periods", {
  id: text("id").primaryKey(),
  watchId: text("watch_id").notNull().references(() => taxWatches.id),
  profileId: text("profile_id").notNull().references(() => profiles.id),
  kind: text("kind").notNull(),
  periodKey: text("period_key").notNull(),
  periodLabel: text("period_label").notNull(),
  legalDue: text("legal_due").notNull(),
  workBy: text("work_by").notNull(),
  recordsBy: text("records_by").notNull(),
  payRoute: text("pay_route").notNull(),
  declarationRef: text("declaration_ref"),
  paymentRef: text("payment_ref"),
  amountDue: integer("amount_due"),
  declaredAt: ts("declared_at"),
  paidAt: ts("paid_at"),
  paidBy: text("paid_by"),
  moneyAt: ts("money_at"),
  moneyReceipt: text("money_receipt"),
  moneyAmount: integer("money_amount"),
  requestRef: text("request_ref"),
}, (t) => [uniqueIndex("tax_periods_watch_period").on(t.watchId, t.periodKey), index("tax_periods_work_by_idx").on(t.workBy)]);

/** Email and SMS waiting to go out, or already sent (lib/outbox.ts). Written in the same transaction as the change it announces. */
export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  channel: text("channel").$type<"email" | "sms">().notNull(),
  /** An email address or a nine-digit phone number. */
  recipient: text("recipient").notNull(),
  /** The message while it waits; emptied once sent or given up on. */
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  ref: text("ref"),
  status: text("status").$type<"pending" | "sent" | "failed">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
}, (t) => [index("outbox_due_idx").on(t.status, t.nextAttemptAt), index("outbox_recipient_idx").on(t.recipient)]);
