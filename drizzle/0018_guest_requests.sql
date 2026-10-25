CREATE TABLE IF NOT EXISTS "request_links" (
	"id" text PRIMARY KEY NOT NULL,
	"ref" text NOT NULL REFERENCES "requests"("ref"),
	"kind" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "contact_phone" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "contact_email" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_links_ref_idx" ON "request_links" USING btree ("ref");
