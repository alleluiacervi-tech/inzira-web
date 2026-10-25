ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "fee_options" jsonb;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "fee_option_label" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "in_person" text;