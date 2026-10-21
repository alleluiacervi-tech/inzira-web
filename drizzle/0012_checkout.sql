ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "checkout" text DEFAULT 'none' NOT NULL;
