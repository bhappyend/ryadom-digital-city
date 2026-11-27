import { z } from 'zod';
import { CategorySchema, CitySchema, DateTimeSchema, IdSchema, PlaceSchema, StatsSchema, responseSchema } from '@ryadom/types';
import { AccountSchema } from './auth';
import { ClaimSchema, OrganizationFieldsSchema, ProposalStatusSchema, BranchChangePatchSchema, SafeContactUrlSchema, ListingSchema, ListingWithSubscriptionSchema, FounderAgreementSchema } from './business';
import { OwnerFundedSubscriptionSchema } from './admin-catalog';
import { ConsentRecordSchema, VersionSchema, integerQuery, pageSchema, PageQuerySchema, plainText } from './common';
import { RoleListSchema } from './rbac';
import { ReviewRecordSchema } from './reviews';

export const UserParamsSchema = z.strictObject({ userId: IdSchema });
export const RoleGrantRequestSchema = z.strictObject({ roles: RoleListSchema, expectedVersion: VersionSchema, reason: plainText(500, 10) });
export const UserStatusRequestSchema = z.strictObject({ status: z.enum(['active', 'suspended']), expectedVersion: VersionSchema, reason: plainText(500, 10) });
export const AdminUserSchema = z.strictObject({ account: AccountSchema, version: VersionSchema });
export const AdminUserResponseSchema = responseSchema(AdminUserSchema);
export const AdminUsersResponseSchema = responseSchema(pageSchema(AdminUserSchema));
export const ModerationKindSchema = z.enum(['place-review', 'platform-review', 'organization-proposal', 'branch-change']);
export const ModerationParamsSchema = z.strictObject({ kind: ModerationKindSchema, id: IdSchema });
export const ModerationDecisionRequestSchema = z.strictObject({ decision: z.enum(['approve', 'reject']), expectedVersion: VersionSchema, note: plainText(1000, 10) });
export const ClaimDecisionRequestSchema = z.strictObject({ decision: z.enum(['verify', 'reject', 'revoke']), expectedVersion: VersionSchema, verificationMethod: z.enum(['independent_registry', 'existing_verified_contact', 'in_person', 'insufficient_evidence']), verificationNote: plainText(2000, 20) }).refine(v => v.decision !== 'verify' || v.verificationMethod !== 'insufficient_evidence', 'Independent verification required');
export const AdminClaimSchema = z.strictObject({ claim: ClaimSchema, applicantId: IdSchema, relationship: z.enum(['owner', 'authorized_representative']), evidenceText: plainText(2000, 20), verificationNote: plainText(2000, 20).nullable(), reviewerId: IdSchema.nullable() });
export const AdminClaimsResponseSchema = responseSchema(pageSchema(AdminClaimSchema));
export const AdminClaimResponseSchema = responseSchema(AdminClaimSchema);
export const ModerationItemSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('place-review'), id: IdSchema, version: VersionSchema, submitterId: IdSchema, review: ReviewRecordSchema }),
  z.strictObject({ kind: z.literal('platform-review'), id: IdSchema, version: VersionSchema, submitterId: IdSchema, review: ReviewRecordSchema }),
  z.strictObject({ kind: z.literal('organization-proposal'), id: IdSchema, version: VersionSchema, submitterId: IdSchema, status: ProposalStatusSchema, organization: OrganizationFieldsSchema, sourceNote: plainText(1000, 10) }),
  z.strictObject({ kind: z.literal('branch-change'), id: IdSchema, version: VersionSchema, submitterId: IdSchema, status: ProposalStatusSchema, businessId: IdSchema.nullable(), placeId: IdSchema, basePlaceVersion: VersionSchema, patch: BranchChangePatchSchema, sourceNote: plainText(1000, 10) })
]);
export const ModerationQuerySchema = PageQuerySchema.extend({ kind: ModerationKindSchema.optional() });
export const ModerationQueryInputSchema = z.strictObject({ page: integerQuery.optional(), limit: integerQuery.optional(), kind: ModerationKindSchema.optional() }).pipe(ModerationQuerySchema);
export const ModerationResponseSchema = responseSchema(ModerationItemSchema);
export const ModerationPageResponseSchema = responseSchema(pageSchema(ModerationItemSchema));
export const AdminOrganizationsResponseSchema = responseSchema(pageSchema(PlaceSchema));
export const AdminCategoriesResponseSchema = responseSchema(z.array(CategorySchema).length(14));
export const AdminCitiesResponseSchema = responseSchema(pageSchema(CitySchema));
export const AdminStatsResponseSchema = responseSchema(StatsSchema);
export const DataSourceSummarySchema = z.strictObject({ id: plainText(100), name: plainText(200), license: plainText(200), attribution: plainText(500), sourceUrl: SafeContactUrlSchema.nullable(), enabled: z.boolean() });
export const AdminSourcesResponseSchema = responseSchema(pageSchema(DataSourceSummarySchema));
export const ImportJobSummarySchema = z.strictObject({ id: IdSchema, sourceId: plainText(100), status: z.enum(['running', 'completed', 'failed']), startedAt: DateTimeSchema, finishedAt: DateTimeSchema.nullable(), importedCount: z.number().int().nonnegative(), skippedCount: z.number().int().nonnegative(), failedCount: z.number().int().nonnegative() });
export const AdminImportsResponseSchema = responseSchema(pageSchema(ImportJobSummarySchema));
export const AuditEventSchema = z.strictObject({ id: IdSchema, occurredAt: DateTimeSchema, actorId: IdSchema.nullable(), action: plainText(100), resourceType: plainText(80), resourceId: plainText(120).nullable(), requestId: IdSchema, outcome: z.enum(['allowed', 'denied', 'failed']), changedFields: z.array(plainText(80)).max(30) });
export const AuditResponseSchema = responseSchema(pageSchema(AuditEventSchema));
export const ExportSectionSchema = z.enum(['profile', 'consents', 'favorites', 'place-reviews', 'platform-reviews', 'claims', 'proposals']);
export const ExportParamsSchema = z.strictObject({ exportId: IdSchema });
export const ExportJobSchema = z.strictObject({ id: IdSchema, status: z.enum(['queued', 'ready', 'failed']), requestedAt: DateTimeSchema, expiresAt: DateTimeSchema, failureCode: z.enum(['LIMIT_EXCEEDED', 'STORAGE_UNAVAILABLE']).nullable() }).refine(v => (v.status === 'failed') === (v.failureCode !== null));
export const ExportJobResponseSchema = responseSchema(ExportJobSchema);
export const ExportPageQuerySchema = z.strictObject({ section: ExportSectionSchema, cursor: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/).optional() });
export const ExportRecordSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('profile'), account: AccountSchema }),
  z.strictObject({ kind: z.literal('consents'), consent: ConsentRecordSchema }),
  z.strictObject({ kind: z.literal('favorites'), placeId: IdSchema, savedAt: DateTimeSchema }),
  z.strictObject({ kind: z.literal('place-reviews'), review: ReviewRecordSchema }),
  z.strictObject({ kind: z.literal('platform-reviews'), review: ReviewRecordSchema }),
  z.strictObject({ kind: z.literal('claims'), claim: ClaimSchema, evidenceText: plainText(2000, 20) }),
  z.strictObject({ kind: z.literal('proposals'), id: IdSchema, organization: OrganizationFieldsSchema, sourceNote: plainText(1000, 10) })
]);
export const ExportPageSchema = z.strictObject({ section: ExportSectionSchema, items: z.array(ExportRecordSchema).max(50), nextCursor: z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/).nullable() }).refine(v => v.items.every(i => i.kind === v.section), 'Export section mismatch');
export const ExportPageResponseSchema = responseSchema(ExportPageSchema);
export type ModerationItem = z.infer<typeof ModerationItemSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export const AdminListingsQuerySchema = PageQuerySchema.extend({ q: plainText(200, 2).optional(), ownerId: IdSchema.optional(), placeId: IdSchema.optional(), status: ListingSchema.shape.placementState.optional() });
export const AdminListingsQueryInputSchema = z.strictObject({ page: integerQuery.optional(), limit: integerQuery.optional(), q: plainText(200, 2).optional(), ownerId: IdSchema.optional(), placeId: IdSchema.optional(), status: ListingSchema.shape.placementState.optional() }).pipe(AdminListingsQuerySchema);
export const AdminListingQuoteSchema = z.strictObject({ id: IdSchema, listingId: IdSchema, amountRub: z.number().int().positive(), currency: z.literal('RUB'), billingInterval: z.literal('month'), terms: plainText(3000, 10), createdAt: DateTimeSchema });
export const AdminListingLookupSchema = z.strictObject({
  listing: ListingWithSubscriptionSchema, ownerId: IdSchema.nullable(), businessName: plainText(200), ownerDisplayName: plainText(100).nullable(),
  currentQuote: AdminListingQuoteSchema.nullable(), currentAgreement: FounderAgreementSchema.nullable(), fundedSubscriptionSummary: OwnerFundedSubscriptionSchema.nullable()
}).refine(v =>
  (v.currentQuote === null || (v.currentQuote.listingId === v.listing.id && v.currentQuote.id === v.listing.quoteId)) &&
  (v.currentAgreement === null || (v.currentAgreement.listingId === v.listing.id && v.currentAgreement.id === v.listing.agreementId && v.currentAgreement.quoteId === v.currentQuote?.id && v.currentAgreement.ownerId === v.ownerId)) &&
  (v.fundedSubscriptionSummary === null || (v.fundedSubscriptionSummary.listingId === v.listing.id && v.fundedSubscriptionSummary.placeId === v.listing.placeId)), 'Lookup references must belong to this listing/current quote/owner');
export const AdminListingLookupResponseSchema = responseSchema(AdminListingLookupSchema);
export const AdminListingsLookupResponseSchema = responseSchema(pageSchema(AdminListingLookupSchema));
export type AdminListingsQuery = z.infer<typeof AdminListingsQuerySchema>;
export type AdminListingLookup = z.infer<typeof AdminListingLookupSchema>;
