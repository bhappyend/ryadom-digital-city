import { z } from 'zod';
import { CategoryIdSchema, CoordinatesSchema, DateTimeSchema, HttpUrlSchema, IdSchema, PlaceSchema, SlugSchema, responseSchema } from '@ryadom/types';
import { VersionSchema, pageSchema, plainText } from './common';

// Public contact URLs are display links only, never fetch targets. Controls are forbidden before URL parsing.
export const SafeContactUrlSchema = z.string().refine(v => !/[\u0000-\u0020\u007f]/u.test(v), 'URL controls or spaces forbidden').pipe(HttpUrlSchema);
export const PhoneSchema = z.string().regex(/^\+?[0-9 ()-]{5,30}$/);
export const OrganizationFieldsSchema = z.strictObject({ name: plainText(200), cityId: SlugSchema, categoryIds: z.array(CategoryIdSchema).min(1).max(14).refine(v => new Set(v).size === v.length), address: plainText(500), coordinates: CoordinatesSchema, description: plainText(5000).nullable(), phone: PhoneSchema.nullable(), website: SafeContactUrlSchema.nullable(), openingHours: plainText(2000).nullable() });
export const OrganizationProposalRequestSchema = z.strictObject({ organization: OrganizationFieldsSchema, rightsConfirmed: z.literal(true), sourceNote: plainText(1000, 10) });
export const ProposalStatusSchema = z.enum(['pending', 'approved', 'rejected', 'withdrawn']);
export const OrganizationProposalSchema = z.strictObject({ id: IdSchema, organization: OrganizationFieldsSchema, status: ProposalStatusSchema, version: VersionSchema, sourceNote: plainText(1000, 10), submittedAt: DateTimeSchema, placeId: IdSchema.nullable() });
export const ProposalResponseSchema = responseSchema(OrganizationProposalSchema);
export const ProposalsResponseSchema = responseSchema(pageSchema(OrganizationProposalSchema));
export const ProposalParamsSchema = z.strictObject({ proposalId: IdSchema });
export const ClaimCreateRequestSchema = z.strictObject({ placeId: IdSchema, relationship: z.enum(['owner', 'authorized_representative']), evidenceText: plainText(2000, 20), consent: z.literal(true) });
export const ClaimStatusSchema = z.enum(['pending', 'verified', 'rejected', 'withdrawn', 'revoked']);
export const ClaimSchema = z.strictObject({ id: IdSchema, placeId: IdSchema, businessId: IdSchema.nullable(), status: ClaimStatusSchema, version: VersionSchema, submittedAt: DateTimeSchema, reviewedAt: DateTimeSchema.nullable() }).refine(v => v.status !== 'verified' || (v.businessId !== null && v.reviewedAt !== null), 'Verified claim requires manual review and business');
export const ClaimResponseSchema = responseSchema(ClaimSchema);
export const ClaimsResponseSchema = responseSchema(pageSchema(ClaimSchema));
export const ClaimParamsSchema = z.strictObject({ claimId: IdSchema });
export const BusinessParamsSchema = z.strictObject({ businessId: IdSchema });
export const BranchParamsSchema = z.strictObject({ businessId: IdSchema, placeId: IdSchema });
export const BranchSchema = z.strictObject({ businessId: IdSchema, place: PlaceSchema, version: VersionSchema });
export const BranchesResponseSchema = responseSchema(pageSchema(BranchSchema));
export const BranchChangePatchSchema = z.strictObject({ name: plainText(200).optional(), description: plainText(5000).nullable().optional(), phone: PhoneSchema.nullable().optional(), website: SafeContactUrlSchema.nullable().optional(), openingHours: plainText(2000).nullable().optional() }).refine(v => Object.keys(v).length > 0, 'At least one allowed change required');
export const BranchChangeRequestSchema = z.strictObject({ expectedVersion: VersionSchema, patch: BranchChangePatchSchema, sourceNote: plainText(1000, 10), rightsConfirmed: z.literal(true) });
export const BranchAddRequestSchema = OrganizationProposalRequestSchema;
export const ChangeReceiptSchema = z.strictObject({ id: IdSchema, status: z.literal('pending'), version: VersionSchema, submittedAt: DateTimeSchema });
export const ChangeResponseSchema = responseSchema(ChangeReceiptSchema);
export const BusinessSummarySchema = z.strictObject({ id: IdSchema, name: plainText(200), ownership: z.literal('verified'), branchCount: z.number().int().nonnegative() });
export const BusinessMetricSchema = z.strictObject({ key: z.enum(['published_branches', 'published_reviews']), value: z.number().int().nonnegative(), measuredAt: DateTimeSchema, source: plainText(200) });
export const BusinessStatsSchema = z.strictObject({ businessId: IdSchema, metrics: z.array(BusinessMetricSchema).max(2).refine(v => new Set(v.map(m => m.key)).size === v.length) });
export const BusinessStatsResponseSchema = responseSchema(BusinessStatsSchema);
export const BusinessDashboardSchema = z.strictObject({ businesses: z.array(BusinessSummarySchema).max(50), pendingClaims: z.number().int().nonnegative(), pendingProposals: z.number().int().nonnegative(), hasMoreBusinesses: z.boolean() });
export const BusinessDashboardResponseSchema = responseSchema(BusinessDashboardSchema);
export type OrganizationProposal = z.infer<typeof OrganizationProposalSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type BranchChangeRequest = z.infer<typeof BranchChangeRequestSchema>;
export const FounderContactSchema = z.discriminatedUnion('channel', [
  z.strictObject({ channel: z.literal('vk'), url: z.literal('https://vk.ru/desktopcoder') }),
  z.strictObject({ channel: z.literal('telegram'), url: z.literal('https://t.me/desktopcoder') })
]);
export const ManualBillingModeSchema = z.strictObject({ mode: z.literal('founder-agreement'), renewal: z.literal('operator-confirmed-monthly'), providerRequired: z.literal(false), contacts: z.array(FounderContactSchema).length(2).refine(v => new Set(v.map(c => c.channel)).size === 2, 'Both approved founder channels required') });
export const MonthlyBillingSchema = z.strictObject({ billingInterval: z.literal('month'), currency: z.literal('RUB'), monthlyPriceRub: z.number().int().positive().nullable(), automaticBillingEnabled: z.literal(false), manual: ManualBillingModeSchema.optional() });
export const ListingSubscriptionSchema = z.strictObject({
  status: z.enum(['pending', 'active', 'past-due', 'cancelled', 'expired']), billing: MonthlyBillingSchema,
  startsAt: DateTimeSchema.nullable(), currentPeriodStartsAt: DateTimeSchema.nullable(), currentPeriodEndsAt: DateTimeSchema.nullable(),
  graceEndsAt: DateTimeSchema.nullable(), cancelledAt: DateTimeSchema.nullable(), endedAt: DateTimeSchema.nullable(),
  cancelAtPeriodEnd: z.boolean(), evaluatedAt: DateTimeSchema
}).refine(v => {
  const start = v.currentPeriodStartsAt === null ? null : Date.parse(v.currentPeriodStartsAt);
  const end = v.currentPeriodEndsAt === null ? null : Date.parse(v.currentPeriodEndsAt);
  const at = Date.parse(v.evaluatedAt);
  if ((start === null) !== (end === null) || (start !== null && end !== null && start >= end)) return false;
  if (v.startsAt !== null && start !== null && Date.parse(v.startsAt) > start) return false;
  if (v.graceEndsAt !== null && (end === null || Date.parse(v.graceEndsAt) < end)) return false;
  if (v.status === 'pending') return v.startsAt === null && start === null && v.graceEndsAt === null && v.cancelledAt === null && v.endedAt === null && !v.cancelAtPeriodEnd;
  if (v.billing.monthlyPriceRub === null || v.startsAt === null || start === null || end === null) return false;
  if (v.status === 'active') return start <= at && at < end && v.endedAt === null && !v.cancelAtPeriodEnd && v.cancelledAt === null;
  if (v.status === 'past-due') return end <= at && v.graceEndsAt !== null && at < Date.parse(v.graceEndsAt) && v.endedAt === null && v.cancelledAt === null && !v.cancelAtPeriodEnd;
  if (v.status === 'cancelled') return v.cancelledAt !== null && Date.parse(v.cancelledAt) <= at && (v.cancelAtPeriodEnd ? at < end && v.endedAt === null : v.endedAt !== null && Date.parse(v.endedAt) <= at);
  return v.endedAt !== null && Date.parse(v.endedAt) <= at && !v.cancelAtPeriodEnd;
}, 'Invalid subscription state, period, price or timestamps');
export type ListingSubscription = z.infer<typeof ListingSubscriptionSchema>;
export const ListingApplicationRequestSchema = z.strictObject({ placeId: IdSchema, placementRequest: plainText(2000, 10), termsConsent: z.literal(true) });
export const ListingSchema = z.strictObject({ id: IdSchema, placeId: IdSchema, version: VersionSchema, sourceState: z.enum(['public-source', 'business-submitted']), ownershipState: z.enum(['unclaimed', 'pending', 'verified', 'revoked']), placementState: z.enum(['pending-quote', 'pending-payment', 'pending-review', 'published', 'rejected', 'withdrawn']), amountRub: z.number().int().positive().nullable(), terms: plainText(3000).nullable(), paymentState: z.enum(['not-requested', 'pending', 'manually-confirmed']), paymentAvailable: z.literal(false) });
// Optional additive projection for existing stage2 consumers; new subscription-aware servers always emit it.
export const ListingWithSubscriptionSchema = ListingSchema.extend({ subscription: ListingSubscriptionSchema.optional(), quoteId: IdSchema.nullable().optional(), agreementId: IdSchema.nullable().optional() });
export const ListingResponseSchema = responseSchema(ListingWithSubscriptionSchema);
export const ListingsResponseSchema = responseSchema(pageSchema(ListingWithSubscriptionSchema));
export const ListingParamsSchema = z.strictObject({ listingId: IdSchema });
export const ListingQuoteRequestSchema = z.strictObject({ expectedVersion: VersionSchema, amountRub: z.number().int().positive(), terms: plainText(3000, 10) });
export const ManualPaymentRequestSchema = z.strictObject({ expectedVersion: VersionSchema, receiptReference: plainText(200, 10), amountRub: z.number().int().positive(), receivedAt: DateTimeSchema, reason: plainText(1000, 10) });
// Admin-only period confirmation input; does not accept client status/paid flags or uploaded proof.
export const ManualPeriodConfirmationRequestSchema = ManualPaymentRequestSchema.extend({ currency: z.literal('RUB'), quoteId: IdSchema, agreementReference: plainText(200, 10), periodStartsAt: DateTimeSchema, periodEndsAt: DateTimeSchema, idempotencyKey: IdSchema }).refine(v => Date.parse(v.periodStartsAt) < Date.parse(v.periodEndsAt), 'Period end must follow start');
export const BillingTimezoneSchema = z.string().min(1).max(80).refine(v => {
  try { new Intl.DateTimeFormat('en', { timeZone: v }); return v === 'UTC' || v.includes('/'); } catch { return false; }
}, 'Recognized IANA timezone required');
export const RecordFounderAgreementRequestSchema = z.strictObject({
  expectedVersion: VersionSchema, quoteId: IdSchema, ownerId: IdSchema,
  acceptedBy: plainText(200), acceptedAt: DateTimeSchema, channel: z.enum(['vk', 'telegram']),
  agreementReference: plainText(200, 10), verificationNote: plainText(1000, 10),
  billingTimezone: BillingTimezoneSchema, billingAnchorAt: DateTimeSchema, idempotencyKey: IdSchema
});
export const FounderAgreementSchema = z.strictObject({
  id: IdSchema, listingId: IdSchema, quoteId: IdSchema, ownerId: IdSchema, version: VersionSchema,
  acceptedBy: plainText(200), acceptedAt: DateTimeSchema, channel: z.enum(['vk', 'telegram']),
  agreementReference: plainText(200, 10), verificationNote: plainText(1000, 10),
  billingTimezone: BillingTimezoneSchema, billingAnchorAt: DateTimeSchema,
  recordedBy: IdSchema, recordedAt: DateTimeSchema, auditId: IdSchema
}).refine(v => Date.parse(v.acceptedAt) <= Date.parse(v.recordedAt), 'Acceptance cannot follow its recording');
export const FounderAgreementResponseSchema = responseSchema(FounderAgreementSchema);
export type RecordFounderAgreementRequest = z.infer<typeof RecordFounderAgreementRequestSchema>;
