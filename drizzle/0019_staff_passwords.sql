CREATE TABLE IF NOT EXISTS "staff_devices" (
	"staff_id" text NOT NULL REFERENCES "staff"("id"),
	"device" text NOT NULL,
	"label" text NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_devices_staff_id_device_pk" PRIMARY KEY("staff_id","device")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL REFERENCES "staff"("id"),
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "step_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "trusted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "device" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "password_hash" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "password_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "failed_logins" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_username_unique" ON "staff" USING btree (lower("username"));
