import { z } from 'zod';
import { DateTimeSchema, IdSchema, ProvenanceSchema, responseSchema } from '@ryadom/types';
import { OrganizationFieldsSchema, PhoneSchema, ManualBillingModeSchema, ListingSubscriptionSchema, BillingTimezoneSchema } from './business';
import { VersionSchema, PageQuerySchema, integerQuery, pageSchema, plainText } from './common';
import { ReviewRecordSchema } from './reviews';
import { CmsAssetSchema } from './media';
import { EmailSchema, PasswordSchema } from './auth';

export const OwnerAccessRequestSchema=z.strictObject({mode:z.enum(['create','reset']),expectedVersion:VersionSchema,email:EmailSchema,password:PasswordSchema,reason:plainText(1000,10)});
export const OwnerAccessSchema=z.strictObject({ownerId:IdSchema,accountId:IdSchema,version:VersionSchema,mode:z.enum(['create','reset']),sessionsRevoked:z.boolean()});
export const OwnerAccessResponseSchema=responseSchema(OwnerAccessSchema);

export const DataScopeSchema = z.enum(['production', 'demo']);
export const ScopedAdminQuerySchema = PageQuerySchema.extend({ dataScope: DataScopeSchema });
export const ScopedAdminQueryInputSchema = z.strictObject({ dataScope: DataScopeSchema, page: integerQuery.optional(), limit: integerQuery.optional() }).pipe(ScopedAdminQuerySchema);
export const CatalogBusinessParamsSchema = z.strictObject({ placeId: IdSchema });
export const CatalogAddressSchema = z.strictObject({ street: plainText(200), house: plainText(80).nullable() });
export const AdminCatalogBusinessCreateRequestSchema = z.strictObject({ organization: OrganizationFieldsSchema, addressParts: CatalogAddressSchema, provenance: z.array(ProvenanceSchema).min(1).max(20), photos: z.array(CmsAssetSchema).max(20), reason: plainText(1000, 10) });
export const AdminCatalogBusinessUpdateRequestSchema = AdminCatalogBusinessCreateRequestSchema.extend({ expectedVersion: VersionSchema });
export const AdminResourceDeleteRequestSchema = z.strictObject({ expectedVersion: VersionSchema, reason: plainText(1000, 10) });
export const AdminCatalogBusinessSchema = z.strictObject({ id: IdSchema, version: VersionSchema, dataScope: z.literal('production'), organization: OrganizationFieldsSchema, addressParts: CatalogAddressSchema, provenance: z.array(ProvenanceSchema).min(1).max(20), photos: z.array(CmsAssetSchema).max(20), status: z.enum(['draft', 'published', 'archived']), updatedAt: DateTimeSchema });
export const AdminCatalogBusinessResponseSchema = responseSchema(AdminCatalogBusinessSchema);
export const AdminCatalogBusinessesResponseSchema = responseSchema(pageSchema(AdminCatalogBusinessSchema));
export const OwnerParamsSchema = z.strictObject({ ownerId: IdSchema });
export const HiddenPhoneSchema = z.strictObject({ visibility: z.literal('hidden'), hasValue: z.boolean() });
export const OwnerContactWriteRequestSchema = z.strictObject({ expectedVersion: VersionSchema, phone: PhoneSchema.nullable(), reason: plainText(500, 10) });
export const OwnerPhoneRevealRequestSchema = z.strictObject({ reason: plainText(500, 10) });
export const OwnerPhoneRevealSchema = z.strictObject({ ownerId: IdSchema, phone: PhoneSchema.nullable(), revealedAt: DateTimeSchema, auditId: IdSchema });
export const OwnerPhoneRevealResponseSchema = responseSchema(OwnerPhoneRevealSchema);
export const OwnerCrmCreateRequestSchema = z.discriminatedUnion('dataScope', [
  z.strictObject({ dataScope: z.literal('production'), displayName: plainText(100), accountId: IdSchema.nullable(), notes: plainText(2000).nullable(), reason: plainText(500, 10) }),
  z.strictObject({ dataScope: z.literal('demo'), displayName: plainText(100), demoLabel: z.literal('Демонстрационные данные — вымышленный владелец'), remainingDays: z.number().int().min(22).max(30), reason: plainText(500, 10) })
]);
export const OwnerCrmUpdateRequestSchema = z.strictObject({ expectedVersion: VersionSchema, displayName: plainText(100), notes: plainText(2000).nullable(), reason: plainText(500, 10) });
export const OwnerFundedSubscriptionSchema = z.strictObject({
  listingId: IdSchema, placeId: IdSchema, businessId: IdSchema.nullable(),
  fundingSource: z.literal('confirmed-funds'), receiptId: IdSchema, agreementId: IdSchema,
  billingTimezone: BillingTimezoneSchema, subscription: ListingSubscriptionSchema
}).refine(v => v.subscription.status !== 'pending', 'Funded summary cannot project an unfunded pending subscription');
export const OwnerCrmSchema = z.discriminatedUnion('dataScope', [
  z.strictObject({ id: IdSchema, version: VersionSchema, dataScope: z.literal('production'), displayName: plainText(100), accountId: IdSchema.nullable(), phone: HiddenPhoneSchema, notes: plainText(2000).nullable(), manualBilling: ManualBillingModeSchema, updatedAt: DateTimeSchema, fundedSubscriptionSummary: OwnerFundedSubscriptionSchema.nullable().optional() }),
  z.strictObject({ id: IdSchema, version: VersionSchema, dataScope: z.literal('demo'), displayName: plainText(100), demoLabel: z.literal('Демонстрационные данные — вымышленный владелец'), phone: z.strictObject({ visibility: z.literal('hidden'), hasValue: z.literal(false) }), remainingDays: z.number().int().min(22).max(30), measuredAt: DateTimeSchema, demoExpiresAt: DateTimeSchema, productionEntitlement: z.literal(false), updatedAt: DateTimeSchema })
]);
export const OwnerCrmResponseSchema = responseSchema(OwnerCrmSchema);
export const OwnersCrmResponseSchema = responseSchema(pageSchema(OwnerCrmSchema));
export const ReviewCorrectionRequestSchema = z.strictObject({ expectedVersion: VersionSchema, correctedText: plainText(3000, 10), reason: plainText(1000, 10) });
export const ReviewCorrectionSchema = z.strictObject({ id: IdSchema, reviewId: IdSchema, authorId: IdSchema, originalText: plainText(3000, 10), correctedText: plainText(3000, 10), editorId: IdSchema, reason: plainText(1000, 10), createdAt: DateTimeSchema, version: VersionSchema, auditId: IdSchema });
export const AdminReviewEditorSchema = z.strictObject({ review: ReviewRecordSchema, originalText: plainText(3000, 10), corrections: z.array(ReviewCorrectionSchema).max(50), hasMoreCorrections: z.boolean() }).refine(v => v.corrections.every(c => c.reviewId === v.review.id && c.authorId === v.review.authorId && c.originalText === v.originalText), 'Correction must preserve original and authorship');
export const AdminReviewEditorResponseSchema = responseSchema(AdminReviewEditorSchema);
export const ReviewCorrectionResponseSchema = responseSchema(ReviewCorrectionSchema);
export const ReviewCorrectionsResponseSchema = responseSchema(pageSchema(ReviewCorrectionSchema));
export type AdminCatalogBusiness = z.infer<typeof AdminCatalogBusinessSchema>;
export type OwnerCrm = z.infer<typeof OwnerCrmSchema>;
export type ReviewCorrection = z.infer<typeof ReviewCorrectionSchema>;
export const OwnerBusinessLinkRequestSchema = z.strictObject({ placeId: IdSchema, expectedVersion: VersionSchema, reason: plainText(500, 10) });
export const OwnerBusinessLinkSchema = z.strictObject({ ownerId: IdSchema, placeId: IdSchema, relation: z.literal('crm-reference'), ownershipProven: z.literal(false), createdAt: DateTimeSchema });
export const OwnerBusinessLinkResponseSchema = responseSchema(OwnerBusinessLinkSchema);
export const OwnerBusinessLinksResponseSchema = responseSchema(pageSchema(OwnerBusinessLinkSchema));
export type AdminCatalogBusinessCreateRequest = z.infer<typeof AdminCatalogBusinessCreateRequestSchema>;
export type AdminCatalogBusinessUpdateRequest = z.infer<typeof AdminCatalogBusinessUpdateRequestSchema>;
export type OwnerCrmCreateRequest = z.infer<typeof OwnerCrmCreateRequestSchema>;
export type OwnerCrmUpdateRequest = z.infer<typeof OwnerCrmUpdateRequestSchema>;
export type ReviewCorrectionRequest = z.infer<typeof ReviewCorrectionRequestSchema>;
