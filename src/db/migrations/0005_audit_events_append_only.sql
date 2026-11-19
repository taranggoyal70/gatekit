-- Audit events are append-only. UPDATE is always rejected. DELETE is rejected
-- unless it is the cascade from deleting the owning organization, which runs
-- inside the foreign key's own trigger (pg_trigger_depth() > 1).
-- TRUNCATE is not covered: it needs table ownership, and the hash chain
-- (src/lib/audit-chain.ts) is what detects tampering by a database owner.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_seq_positive" CHECK ("seq" >= 1);--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_hash_format" CHECK ("hash" ~ '^[0-9a-f]{64}$' AND "prev_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint
CREATE OR REPLACE FUNCTION "audit_events_reject_mutation"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "audit_events_append_only"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION "audit_events_reject_mutation"();
