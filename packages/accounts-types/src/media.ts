import { z } from 'zod';
import { DateTimeSchema, IdSchema, responseSchema } from '@ryadom/types';
import { pageSchema, plainText } from './common';

export const MEDIA_LIMITS = Object.freeze({ uploadBytes: 2_097_152, maxDimension: 4096, maxPixels: 16_000_000, uploadsPerHour: 20 });
export const RasterMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const LocalRasterUrlSchema = z.string().regex(/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/);
export const SuppliedBrandUrlSchema = z.enum(['/assets/brand/logo-horizontal.svg', '/assets/brand/logo-mark.svg', '/assets/backgrounds/hero-city.webp', '/assets/backgrounds/hero-city-small.webp']);
export const CmsAssetSchema = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('supplied'), url: SuppliedBrandUrlSchema, alt: plainText(300) }),
  z.strictObject({ source: z.literal('uploaded'), mediaId: IdSchema, url: LocalRasterUrlSchema, alt: plainText(300) })
]);
export const MediaParamsSchema = z.strictObject({ mediaId: IdSchema });
export const MediaUploadCreateRequestSchema = z.strictObject({ purpose: z.enum(['logo', 'content-image', 'business-photo']), mime: RasterMimeSchema, byteLength: z.number().int().min(1).max(MEDIA_LIMITS.uploadBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/), rightsConfirmed: z.literal(true), attribution: plainText(500), license: plainText(200) });
export const MediaUploadTicketSchema = z.strictObject({ id: IdSchema, state: z.literal('awaiting-upload'), expiresAt: DateTimeSchema, maxBytes: z.literal(2_097_152) });
export const MediaUploadTicketResponseSchema = responseSchema(MediaUploadTicketSchema);
// Raw stream, not a base64 JSON string; generator declares the transport separately.
export const MediaBinaryRequestSchema = z.string().min(1).max(MEDIA_LIMITS.uploadBytes);
export const MediaAssetSchema = z.strictObject({ id: IdSchema, purpose: z.enum(['logo', 'content-image', 'business-photo']), state: z.enum(['ready', 'archived']), url: LocalRasterUrlSchema, mime: z.literal('image/webp'), width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096), byteLength: z.number().int().min(1).max(MEDIA_LIMITS.uploadBytes), sha256: z.string().regex(/^[a-f0-9]{64}$/), attribution: plainText(500), license: plainText(200), createdAt: DateTimeSchema }).refine(v => v.width * v.height <= MEDIA_LIMITS.maxPixels);
export const MediaAssetResponseSchema = responseSchema(MediaAssetSchema);
export const MediaAssetsResponseSchema = responseSchema(pageSchema(MediaAssetSchema));
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type MediaUploadCreateRequest = z.infer<typeof MediaUploadCreateRequestSchema>;
export type CmsAsset = z.infer<typeof CmsAssetSchema>;
