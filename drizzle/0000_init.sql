CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"first" text NOT NULL,
	"phone" text NOT NULL,
	"whatsapp" boolean DEFAULT true NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"role" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"source" text NOT NULL,
	"fee" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"icon" text NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"desc" text NOT NULL,
	"href" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"name" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"issued_by" text NOT NULL,
	"file_id" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"by" text,
	"body" text
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"storage_key" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"icon" text NOT NULL,
	"title" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread" boolean DEFAULT true NOT NULL,
	"href" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"phone" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"relation" text,
	"id_masked" text,
	"national_id" text,
	"district" text
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cta" text NOT NULL,
	"href" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"group" text NOT NULL,
	"required" boolean NOT NULL,
	"status" text NOT NULL,
	"file_id" text,
	"file_name" text,
	"file_size" text,
	"uploaded_at" timestamp with time zone,
	"note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"ref" text PRIMARY KEY NOT NULL,
	"service_slug" text NOT NULL,
	"title" text,
	"profile_id" text NOT NULL,
	"agent_id" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage" text NOT NULL,
	"stage_dates" jsonb NOT NULL,
	"hold" jsonb,
	"closed" jsonb,
	"channel" text NOT NULL,
	"official_ref" text,
	"depends_on" text,
	"summary" jsonb NOT NULL,
	"next" text NOT NULL,
	"purpose" text,
	"follow_up" jsonb,
	"invoice" text NOT NULL,
	"official" integer,
	"official_mode" text,
	"official_label" text NOT NULL,
	"ours" integer NOT NULL,
	"ours_standard" integer NOT NULL,
	"ours_unit" text,
	"ours_note" text,
	"quote" text NOT NULL,
	"due_at" timestamp with time zone,
	"official_receipt" text NOT NULL,
	CONSTRAINT "requests_invoice_unique" UNIQUE("invoice")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"allowed" boolean NOT NULL,
	CONSTRAINT "role_permissions_role_permission_pk" PRIMARY KEY("role","permission")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"aka" text,
	"category" text NOT NULL,
	"authority" text NOT NULL,
	"channel" text NOT NULL,
	"via" text NOT NULL,
	"summary" text NOT NULL,
	"who" jsonb NOT NULL,
	"requirements" jsonb NOT NULL,
	"documents" jsonb NOT NULL,
	"steps" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	"official_amount" integer,
	"official_mode" text,
	"official_label" text,
	"official_note" text NOT NULL,
	"official_verified_at" timestamp with time zone,
	"ours" integer NOT NULL,
	"ours_unit" text,
	"time" text NOT NULL,
	"docs_short" text NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"audience" jsonb NOT NULL,
	"purposes" jsonb,
	"purpose_label" text,
	"no_id" boolean DEFAULT false NOT NULL,
	"flow" jsonb,
	"stage_labels" jsonb,
	"visible" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"role" text NOT NULL,
	"team" text NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL,
	"receipt" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text NOT NULL,
	"official" integer NOT NULL,
	"ours" integer NOT NULL,
	"status" text NOT NULL,
	"payer" text,
	"provider_ref" text
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_service_slug_services_slug_fk" FOREIGN KEY ("service_slug") REFERENCES "public"."services"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_agent_id_staff_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_categories_id_fk" FOREIGN KEY ("category") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_ref_requests_ref_fk" FOREIGN KEY ("ref") REFERENCES "public"."requests"("ref") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_ref_idx" ON "events" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "messages_ref_idx" ON "messages" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "notifications_account_idx" ON "notifications" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "profiles_account_idx" ON "profiles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "request_documents_ref_idx" ON "request_documents" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "requests_profile_idx" ON "requests" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "requests_agent_idx" ON "requests" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "transactions_ref_idx" ON "transactions" USING btree ("ref");