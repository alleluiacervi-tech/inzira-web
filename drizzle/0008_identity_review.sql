-- Per-service National ID rule, and a snapshot of that rule on each request so a later catalogue
-- edit does not rewrite applications already sent. Review statuses are Inzira's own document check.
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "id_policy" text;--> statement-breakpoint
UPDATE "services" SET "id_policy" = CASE "slug"
  WHEN 'e-title' THEN 'required'
  WHEN 'land-spouse-update' THEN 'required'
  WHEN 'land-merging' THEN 'required'
  WHEN 'property-tax-tin' THEN 'required'
  WHEN 'irembo-training' THEN 'none'
  WHEN 'ebm-training' THEN 'none'
  ELSE CASE WHEN "no_id" THEN 'none' ELSE 'unsure' END
END
WHERE "id_policy" IS NULL;--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "id_policy" SET DEFAULT 'unsure';--> statement-breakpoint
ALTER TABLE "services" ALTER COLUMN "id_policy" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_policy" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_note" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_review_by" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "id_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "requirements_snapshot" jsonb;--> statement-breakpoint
-- Existing requests keep the rule they were actually collected under: a personal ID was mandatory
-- unless the service was marked no_id, and only for a person. Finished requests are not pushed into
-- the new review queue, and nothing is marked checked.
UPDATE "requests" AS r
SET "id_required" = (NOT s."no_id" AND p."kind" = 'person'),
    "id_policy" = CASE WHEN s."no_id" THEN 'none' ELSE 'required' END,
    "id_review" = CASE WHEN NOT s."no_id" AND p."kind" = 'person' AND r."closed" IS NULL AND r."stage" <> 'completed' THEN 'pending' ELSE NULL END,
    "requirements_snapshot" = s."requirements"
FROM "services" AS s, "profiles" AS p
WHERE r."service_slug" = s."slug" AND r."profile_id" = p."id" AND r."id_policy" IS NULL;--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "id_policy" SET DEFAULT 'none';--> statement-breakpoint
UPDATE "requests" SET "id_policy" = 'none' WHERE "id_policy" IS NULL;--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "id_policy" SET NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_id_review_idx" ON "requests" USING btree ("id_review");