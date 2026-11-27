import { z } from 'zod';
import { DateTimeSchema, IdSchema, responseSchema } from '@ryadom/types';
import { CmsTextSchema, VersionSchema, pageSchema, plainText } from './common';
import { SafeContactUrlSchema, MonthlyBillingSchema } from './business';
import { CmsAssetSchema } from './media';

export const CmsKeySchema = z.enum(['homepage', 'about', 'faq', 'contacts', 'terms', 'privacy', 'pricing', 'site-settings', 'brand']);
export const CmsParamsSchema = z.strictObject({ key: CmsKeySchema });
export const AdminCmsKeySchema = z.enum(['homepage', 'about', 'faq', 'contacts', 'terms', 'privacy', 'brand']);
export const AdminSettingsKeySchema = z.enum(['pricing', 'site-settings']);
export const AdminCmsParamsSchema = z.strictObject({ key: AdminCmsKeySchema });
export const AdminSettingsParamsSchema = z.strictObject({ key: AdminSettingsKeySchema });
export const CmsRevisionParamsSchema = z.strictObject({ key: CmsKeySchema, revisionId: IdSchema });
export const CmsLinkSchema = z.strictObject({ label: plainText(100).refine(v => !/[<>]/u.test(v)), url: SafeContactUrlSchema });
export const CmsBlockSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('heading'), text: CmsTextSchema }), z.strictObject({ kind: z.literal('paragraph'), text: CmsTextSchema }), z.strictObject({ kind: z.literal('link'), link: CmsLinkSchema }), z.strictObject({ kind: z.literal('image'), asset: CmsAssetSchema, caption: CmsTextSchema.nullable() })]);
export const PaidListingPricingSchema = z.strictObject({ model: z.literal('paid-listing'), amountRub: z.number().int().positive().nullable(), terms: CmsTextSchema, paymentAvailable: z.literal(false), billing: MonthlyBillingSchema.optional() }).refine(v => v.billing === undefined || v.amountRub === v.billing.monthlyPriceRub, 'Legacy amount must match monthly RUB price');
export const HomepageHeroSchema = z.strictObject({ heading: plainText(200).refine(v => !/[<>]/u.test(v)), subheading: plainText(1000).refine(v => !/[<>]/u.test(v)), primaryCta: z.strictObject({ label: plainText(80).refine(v => !/[<>]/u.test(v)), href: z.literal('#quick-search') }), secondaryCta: z.strictObject({ label: plainText(80).refine(v => !/[<>]/u.test(v)), href: z.literal('/map') }) });
export const CmsDocumentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('brand'), logo: CmsAssetSchema, logoMark: CmsAssetSchema, hero: CmsAssetSchema.nullable() }),
  z.strictObject({ kind: z.literal('section'), title: CmsTextSchema, blocks: z.array(CmsBlockSchema).max(12), homepageHero: HomepageHeroSchema.optional() }),
  z.strictObject({ kind: z.literal('faq'), items: z.array(z.strictObject({ question: plainText(300).refine(v => !/[<>]/u.test(v)), answer: CmsTextSchema })).max(12) }),
  z.strictObject({ kind: z.literal('contacts'), links: z.array(CmsLinkSchema).max(10) }),
  z.strictObject({ kind: z.literal('legal'), documentVersion: plainText(80), title: CmsTextSchema, paragraphs: z.array(CmsTextSchema).min(1).max(12) }),
  z.strictObject({ kind: z.literal('pricing'), listing: PaidListingPricingSchema }),
  z.strictObject({ kind: z.literal('settings'), siteTitle: plainText(100).refine(v => !/[<>]/u.test(v)), description: CmsTextSchema, indexingEnabled: z.boolean() })
]).refine(v => new TextEncoder().encode(JSON.stringify(v)).byteLength <= 12_000, 'CMS document exceeds UTF-8 budget');
export const CMS_KIND_BY_KEY = Object.freeze({ homepage: 'section', about: 'section', faq: 'faq', contacts: 'contacts', terms: 'legal', privacy: 'legal', pricing: 'pricing', 'site-settings': 'settings', brand: 'brand' } as const);
export const CmsWriteRequestSchema = z.strictObject({ expectedVersion: VersionSchema.nullable(), document: CmsDocumentSchema, changeNote: plainText(500, 5) });
export const CmsPublishRequestSchema = z.strictObject({ expectedVersion: VersionSchema, revisionId: IdSchema });
export const CmsRollbackRequestSchema = z.strictObject({ expectedVersion: VersionSchema, revisionId: IdSchema, changeNote: plainText(500, 5) });
export const CmsRevisionSchema = z.strictObject({ id: IdSchema, key: CmsKeySchema, version: VersionSchema, state: z.enum(['draft', 'published', 'archived']), document: CmsDocumentSchema, createdAt: DateTimeSchema, publishedAt: DateTimeSchema.nullable(), authorId: IdSchema, changeNote: plainText(500, 5) }).refine(v => CMS_KIND_BY_KEY[v.key] === v.document.kind && (v.state !== 'published' || v.publishedAt !== null) && (v.document.kind !== 'section' || v.document.homepageHero === undefined || v.key === 'homepage'), 'Invalid CMS key/document/publication combination');
export const CmsRevisionResponseSchema = responseSchema(CmsRevisionSchema);
export const CmsRevisionsResponseSchema = responseSchema(pageSchema(CmsRevisionSchema));
export const PublicCmsSchema = z.strictObject({ key: CmsKeySchema, revisionId: IdSchema, version: VersionSchema, document: CmsDocumentSchema, publishedAt: DateTimeSchema }).refine(v => CMS_KIND_BY_KEY[v.key] === v.document.kind && (v.document.kind !== 'section' || v.document.homepageHero === undefined || v.key === 'homepage'), 'Invalid CMS key/document combination');
export const PublicCmsResponseSchema = responseSchema(PublicCmsSchema);
export type CmsDocument = z.infer<typeof CmsDocumentSchema>;
export type CmsRevision = z.infer<typeof CmsRevisionSchema>;
export type HomepageHero = z.infer<typeof HomepageHeroSchema>;

