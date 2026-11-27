-- Operator-created login is separate from owner consent and business/payment verification.
CREATE TABLE owner_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES owner_crm(id),
 account_id uuid NOT NULL REFERENCES users(id),actor_id uuid NOT NULL REFERENCES users(id),
 mode text NOT NULL CHECK(mode IN ('create','reset')),owner_version integer NOT NULL CHECK(owner_version>0),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000),
 audit_id uuid NOT NULL UNIQUE REFERENCES audit_events(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,owner_version)
);
CREATE TRIGGER owner_access_immutable BEFORE UPDATE OR DELETE ON owner_access_events FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
