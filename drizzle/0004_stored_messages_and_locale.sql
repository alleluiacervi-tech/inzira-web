ALTER TABLE "accounts" ADD COLUMN "locale" text DEFAULT 'rw' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "vars" jsonb;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "vars" jsonb;