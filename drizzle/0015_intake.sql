CREATE TABLE IF NOT EXISTS "catalogue_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "official_bill" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "answers" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "deliver_via" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "questions" jsonb;
