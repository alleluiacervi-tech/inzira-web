CREATE TABLE IF NOT EXISTS "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"ref" text NOT NULL REFERENCES "requests"("ref"),
	"amount" integer NOT NULL,
	"phone" text NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"provider_ref" text,
	"code" text,
	"by" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payouts_ref_idx" ON "payouts" USING btree ("ref");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_one_pending" ON "payouts" USING btree ("ref") WHERE "payouts"."status" = 'pending';
