// Database schema (Postgres). Mirrors the domain model in lib/types.ts.
// Change this file, then run `npm run db:generate` to write a migration into ./drizzle.
import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Closed, DocGroup, DocStatus, Hold, OfficialMode, Service, Stage, StaffRole } from "../types";

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
  /** Nine digits after +250, e.g. 788123456. The login. */
  phone: text("phone").notNull().unique(),
  whatsapp: boolean("whatsapp").notNull().default(true),
  languages: jsonb("languages").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  since: ts("since").notNull().defaultNow(),
  /** Set when the customer deleted their account. Personal details are then wiped; financial records stay. */
  deletedAt: ts("deleted_at"),
});

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
}, (t) => [index("profiles_account_idx").on(t.accountId)]);

export const staff = pgTable("staff", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").unique(),
  role: text("role").$type<StaffRole>().notNull(),
  team: text("team").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
});

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
  summary: jsonb("summary").$type<{ title: string; body: string }>().notNull(),
  next: text("next").notNull(),
  purpose: text("purpose"),
  followUp: jsonb("follow_up").$type<{ at: string; what: string }>(),
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
}, (t) => [index("requests_profile_idx").on(t.profileId), index("requests_agent_idx").on(t.agentId)]);

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
});

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
});

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  ref: text("ref").notNull().references(() => requests.ref),
  at: ts("at").notNull().defaultNow(),
  title: text("title").notNull(),
  /** "customer", "system" or a staff id. */
  by: text("by"),
  body: text("body"),
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
}, (t) => [index("transactions_ref_idx").on(t.ref)]);

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
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => accounts.id),
  icon: text("icon").notNull(),
  title: text("title").notNull(),
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
});

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

export const sessions = pgTable("sessions", {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  id: text("id").primaryKey(),
  kind: text("kind").$type<"customer" | "staff">().notNull(),
  subjectId: text("subject_id").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

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
