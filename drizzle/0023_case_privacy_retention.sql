ALTER TABLE "files" ADD COLUMN "retention_class" text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_hold_reason" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_returned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "privacy_source" text;
--> statement-breakpoint
-- Older receipt uploads have no checklist/deliverable link. Preserve them for finance review.
UPDATE "files" f SET "retention_class" = 'financial'
WHERE f."retention_class" <> 'financial' AND NOT EXISTS (SELECT 1 FROM "request_documents" d WHERE d."file_id" = f."id")
  AND NOT EXISTS (SELECT 1 FROM "deliverables" d WHERE d."file_id" = f."id");
--> statement-breakpoint
-- Serializes attachment/message writes with the privacy claim, including stale browser submissions.
CREATE OR REPLACE FUNCTION inzira_case_content_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE started timestamptz;
BEGIN
  SELECT privacy_started_at INTO started FROM requests WHERE ref = NEW.ref FOR UPDATE;
  IF started IS NOT NULL THEN
    RAISE EXCEPTION 'Case content has been archived for privacy' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON files FOR EACH ROW WHEN (NEW.retention_class <> 'financial') EXECUTE FUNCTION inzira_case_content_guard();
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION inzira_case_content_guard();
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION inzira_case_content_guard();
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON request_documents FOR EACH ROW EXECUTE FUNCTION inzira_case_content_guard();
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON deliverables FOR EACH ROW EXECUTE FUNCTION inzira_case_content_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION inzira_archived_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.privacy_started_at IS NOT NULL
    AND NOT (OLD.privacy_purged_at IS NULL AND NEW.privacy_purged_at IS NOT NULL)
    AND (to_jsonb(NEW) - ARRAY['invoice','official','official_mode','official_label','ours','ours_standard','ours_unit','ours_note','quote','due_at','official_receipt','review_fee'])
      IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['invoice','official','official_mode','official_label','ours','ours_standard','ours_unit','ours_note','quote','due_at','official_receipt','review_fee'])
  THEN
    RAISE EXCEPTION 'Archived case content is read only' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE UPDATE ON requests FOR EACH ROW EXECUTE FUNCTION inzira_archived_case_guard();

--> statement-breakpoint
-- Financial settlement may continue after the operational purge, but not race the purge itself.
CREATE OR REPLACE FUNCTION inzira_pending_finance_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE started timestamptz; purged timestamptz;
BEGIN
  SELECT privacy_started_at, privacy_purged_at INTO started, purged FROM requests WHERE ref = NEW.ref FOR UPDATE;
  IF started IS NOT NULL AND purged IS NULL THEN
    RAISE EXCEPTION 'Case cleanup is in progress; retry financial operation later' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT ON transactions FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION inzira_pending_finance_guard();
--> statement-breakpoint
CREATE TRIGGER privacy_guard BEFORE INSERT ON payouts FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION inzira_pending_finance_guard();
