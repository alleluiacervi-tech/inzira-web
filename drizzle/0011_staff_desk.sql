ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "handover" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL REFERENCES "staff"("id"),
	"icon" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text NOT NULL,
	"ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread" boolean DEFAULT true NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_notifications_staff_idx" ON "staff_notifications" USING btree ("staff_id","unread","at");
