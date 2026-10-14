-- Before the database enforces one waiting prompt per request, close older duplicates (keep the newest).
UPDATE "transactions" t SET "status" = 'failed' WHERE t."status" = 'pending' AND EXISTS (
	SELECT 1 FROM "transactions" n WHERE n."ref" = t."ref" AND n."status" = 'pending' AND n."id" > t."id"
);--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_last_step" integer;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "totp_recovery" jsonb;--> statement-breakpoint
CREATE INDEX "outbox_due_idx" ON "outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbox_recipient_idx" ON "outbox" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit" USING btree ("at");--> statement-breakpoint
CREATE INDEX "deliverables_ref_idx" ON "deliverables" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "files_ref_idx" ON "files" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "notes_ref_idx" ON "notes" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "sessions_subject_idx" ON "sessions" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transactions_provider_ref_idx" ON "transactions" USING btree ("provider_ref" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_one_pending" ON "transactions" USING btree ("ref") WHERE "transactions"."status" = 'pending';