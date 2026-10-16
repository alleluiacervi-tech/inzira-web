ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "email" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_email_unique" ON "staff" (lower("email"));
