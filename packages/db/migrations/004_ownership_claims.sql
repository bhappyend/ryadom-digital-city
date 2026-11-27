-- Real account ownership claims only. No fixtures or automatic ownership grants.
CREATE TABLE owner_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 applicant_id uuid NOT NULL REFERENCES users(id),place_id uuid NOT NULL REFERENCES places(id),business_id uuid REFERENCES businesses(id),
 relationship text NOT NULL CHECK(relationship IN ('owner','authorized_representative')),
 evidence_text text NOT NULL CHECK(length(evidence_text) BETWEEN 20 AND 2000),consented_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','withdrawn','revoked')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewer_id uuid REFERENCES users(id),reviewed_at timestamptz,verification_method text CHECK(verification_method IN ('independent_registry','existing_verified_contact','in_person','insufficient_evidence')),
 verification_note text CHECK(length(verification_note) BETWEEN 20 AND 2000),
 CHECK(reviewer_id IS NULL OR reviewer_id<>applicant_id),
 CHECK(status<>'verified' OR (business_id IS NOT NULL AND reviewed_at IS NOT NULL AND reviewer_id IS NOT NULL AND verification_method<>'insufficient_evidence'))
);
CREATE UNIQUE INDEX claim_pending_applicant_place ON owner_claims(applicant_id,place_id) WHERE status='pending';
CREATE UNIQUE INDEX claim_verified_place ON owner_claims(place_id) WHERE status='verified';
CREATE INDEX claim_applicant ON owner_claims(applicant_id,submitted_at DESC,id);
CREATE INDEX claim_queue ON owner_claims(status,submitted_at,id);
CREATE TABLE ownership_claim_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),claim_id uuid NOT NULL REFERENCES owner_claims(id),version integer NOT NULL,
 decision text NOT NULL CHECK(decision IN ('verify','reject','revoke','withdraw')),
 actor_id uuid NOT NULL REFERENCES users(id),verification_method text,verification_note text,
 audit_id uuid NOT NULL UNIQUE REFERENCES audit_events(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(claim_id,version)
);
CREATE TRIGGER claim_decision_immutable BEFORE UPDATE OR DELETE ON ownership_claim_decisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
CREATE TABLE listing_review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),listing_id uuid NOT NULL REFERENCES listing_applications(id),version integer NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approve','reject')),reviewer_id uuid NOT NULL REFERENCES users(id),
 note text NOT NULL CHECK(length(note) BETWEEN 10 AND 1000),claim_id uuid REFERENCES owner_claims(id),
 agreement_id uuid REFERENCES founder_agreements(id),receipt_id uuid REFERENCES manual_subscription_payments(id),
 audit_id uuid NOT NULL UNIQUE REFERENCES audit_events(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(listing_id,version),
 CHECK(decision<>'approve' OR (claim_id IS NOT NULL AND agreement_id IS NOT NULL AND receipt_id IS NOT NULL))
);
CREATE TRIGGER listing_decision_immutable BEFORE UPDATE OR DELETE ON listing_review_decisions FOR EACH ROW EXECUTE FUNCTION reject_immutable_mutation();
