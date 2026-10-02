ALTER TABLE "profiles" ADD COLUMN "tin_masked" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "tin" text;--> statement-breakpoint
CREATE TABLE "client_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL REFERENCES "profiles"("id"),
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL REFERENCES "profiles"("id"),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"by" text NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"columns" jsonb,
	"sort" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"staff_id" text REFERENCES "staff"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_targets" (
	"stage" text PRIMARY KEY NOT NULL,
	"target_hours" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "client_tags_profile_idx" ON "client_tags" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "client_notes_profile_idx" ON "client_notes" USING btree ("profile_id");
