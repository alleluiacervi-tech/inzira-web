-- Sign-in moves from SMS to email, and customers can follow a request from a private link without an account.
-- A phone number is now only a contact detail, so several people may share one.
ALTER TABLE "accounts" DROP CONSTRAINT IF EXISTS "accounts_phone_unique";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "locale" text DEFAULT 'rw' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "access_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "scope_ref" text;--> statement-breakpoint
-- Codes live ten minutes, so the table is recreated keyed by email instead of migrated.
DROP TABLE "otp_codes";--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"email" text PRIMARY KEY NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
