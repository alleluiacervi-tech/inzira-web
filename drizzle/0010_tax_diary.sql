CREATE TABLE IF NOT EXISTS "tax_watches" (
  "id" text PRIMARY KEY NOT NULL,
  "profile_id" text NOT NULL REFERENCES "profiles"("id"),
  "kind" text NOT NULL,
  "pay_route" text NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" text NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_watches_profile_idx" ON "tax_watches" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_watches_one_kind" ON "tax_watches" ("profile_id", "kind") WHERE active AND kind <> 'custom';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_periods" (
  "id" text PRIMARY KEY NOT NULL,
  "watch_id" text NOT NULL REFERENCES "tax_watches"("id"),
  "profile_id" text NOT NULL REFERENCES "profiles"("id"),
  "kind" text NOT NULL,
  "period_key" text NOT NULL,
  "period_label" text NOT NULL,
  "legal_due" text NOT NULL,
  "work_by" text NOT NULL,
  "records_by" text NOT NULL,
  "pay_route" text NOT NULL,
  "declaration_ref" text,
  "payment_ref" text,
  "amount_due" integer,
  "declared_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "paid_by" text,
  "money_at" timestamp with time zone,
  "money_receipt" text,
  "money_amount" integer,
  "request_ref" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tax_periods_watch_period" ON "tax_periods" ("watch_id", "period_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_periods_work_by_idx" ON "tax_periods" USING btree ("work_by");
