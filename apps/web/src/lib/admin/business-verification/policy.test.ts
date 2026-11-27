import { describe, expect, it } from 'vitest';
import { AdminClaimSchema, ClaimDecisionRequestSchema, AdminListingLookupSchema } from '@ryadom/accounts-types';
import { claimDecisions, listingApprovalGaps } from './policy';

// Disposable in-memory examples only: never accounts/claims/funds in any database.
const applicant = '00000000-0000-4000-8000-000000000001';
const reviewer = '00000000-0000-4000-8000-000000000002';
const placeId = '00000000-0000-4000-8000-000000000003';
const claimId = '00000000-0000-4000-8000-000000000004';
const at = '2026-11-27T10:00:00Z';
const claim = AdminClaimSchema.parse({ claim: { id: claimId, placeId, businessId: null, status: 'pending', version: 1, submittedAt: at, reviewedAt: null }, applicantId: applicant, relationship: 'owner', evidenceText: 'Disposable evidence for isolated schema test only.', verificationNote: null, reviewerId: null });
const listing = AdminListingLookupSchema.parse({ listing: { id: claimId, placeId, version: 1, sourceState: 'public-source', ownershipState: 'pending', placementState: 'pending-review', amountRub: null, terms: null, paymentState: 'not-requested', paymentAvailable: false, quoteId: null, agreementId: null }, ownerId: null, businessName: 'Disposable fixture', ownerDisplayName: null, currentQuote: null, currentAgreement: null, fundedSubscriptionSummary: null });

describe('claim review guardrails', () => {
  it('offers no self-review or action for an unknown actor, including revocation', () => {
    expect(claimDecisions(claim, applicant)).toEqual([]);
    expect(claimDecisions(claim, '')).toEqual([]);
    expect(claimDecisions(claim, reviewer)).toEqual(['verify', 'reject']);
    const verified = AdminClaimSchema.parse({ ...claim, claim: { ...claim.claim, status: 'verified', businessId: placeId, reviewedAt: at } });
    expect(claimDecisions(verified, applicant)).toEqual([]);
    expect(claimDecisions(verified, reviewer)).toEqual(['revoke']);
    for (const status of ['rejected', 'revoked', 'withdrawn'] as const) expect(claimDecisions({ ...claim, claim: { ...claim.claim, status } }, reviewer)).toEqual([]);
  });
  it('cannot turn insufficient or missing evidence into a verification request', () => {
    const body = { decision: 'verify', expectedVersion: 1, verificationMethod: 'insufficient_evidence', verificationNote: 'Actual independent check must be recorded.' };
    expect(ClaimDecisionRequestSchema.safeParse(body).success).toBe(false);
    expect(ClaimDecisionRequestSchema.safeParse({ ...body, verificationMethod: 'in_person', verificationNote: '' }).success).toBe(false);
    expect(ClaimDecisionRequestSchema.safeParse({ ...body, verificationMethod: 'in_person', verified: true }).success).toBe(false);
    expect(ClaimDecisionRequestSchema.safeParse({ ...body, verificationMethod: 'independent_registry' }).success).toBe(true);
  });
});

describe('listing approval indicators never manufacture entitlement', () => {
  it('blocks unfunded/unverified records and cannot use a CRM owner as proof', () => {
    expect(listingApprovalGaps(listing)).toHaveLength(3);
    expect(listingApprovalGaps({ ...listing, ownerId: reviewer, ownerDisplayName: 'Disposable CRM fixture' })).toEqual(listingApprovalGaps(listing));
    expect(listingApprovalGaps({ ...listing, listing: { ...listing.listing, paymentState: 'manually-confirmed' } })).toContain('Права владельца не подтверждены.');
  });
  it('does not require an active summary before approval when actual current prerequisites exist', () => {
    const quoteId = '00000000-0000-4000-8000-000000000005';
    const agreementId = '00000000-0000-4000-8000-000000000006';
    const candidate = AdminListingLookupSchema.parse({ ...listing, ownerId: applicant, listing: { ...listing.listing, ownershipState: 'verified', paymentState: 'manually-confirmed', quoteId, agreementId }, currentQuote: { id: quoteId, listingId: claimId, amountRub: 1, currency: 'RUB', billingInterval: 'month', terms: 'Disposable fixture terms, never an actual product price.', createdAt: at }, currentAgreement: { id: agreementId, listingId: claimId, quoteId, ownerId: applicant, version: 1, acceptedBy: 'Disposable fixture', acceptedAt: at, channel: 'vk', agreementReference: 'Disposable fixture agreement', verificationNote: 'Isolated in-memory schema fixture only.', billingTimezone: 'Europe/Moscow', billingAnchorAt: at, recordedBy: reviewer, recordedAt: at, auditId: placeId } });
    expect(candidate.fundedSubscriptionSummary).toBeNull();
    expect(listingApprovalGaps(candidate)).toEqual([]); // Server must still check receipt/period and reviewer independence.
    expect(listingApprovalGaps({ ...candidate, listing: { ...candidate.listing, placementState: 'published' } })).toHaveLength(1);
  });
});
