ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "institution" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "mark_data" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "mark_type" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "mark_rev" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "categories" SET "featured" = true WHERE "id" IN ('rdb', 'tax', 'land', 'rura', 'police', 'papers');
--> statement-breakpoint
UPDATE "categories" SET "short" = 'Business registration' WHERE "id" = 'rdb' AND "short" = 'RDB';--> statement-breakpoint
UPDATE "categories" SET "short" = 'Transport' WHERE "id" = 'rura' AND "short" = 'RURA';--> statement-breakpoint
UPDATE "categories" SET "short" = 'Certificates' WHERE "id" = 'papers' AND "short" = 'Papers';--> statement-breakpoint
UPDATE "categories" SET "short" = 'Irembo training' WHERE "id" = 'irembo' AND "short" = 'Irembo';
