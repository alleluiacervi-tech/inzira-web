ALTER TABLE "accounts" ADD COLUMN "email" text;
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "email" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_idx" ON "accounts" USING btree ("email");
--> statement-breakpoint
CREATE UNIQUE INDEX "staff_email_idx" ON "staff" USING btree ("email");
