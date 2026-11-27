import { z } from 'zod';
import { DateTimeSchema, ErrorCodeSchema, MetaSchema, ProviderNameSchema, UnavailableReasonSchema, PaginationSchema, responseSchema } from '@ryadom/types';

export const ACCOUNTS_CONTRACT_VERSION = '1.1.0';
export const ACCOUNTS_API_PREFIX = '/api/v1';
export const ACCOUNT_LIMITS = Object.freeze({ passwordMin: 12, passwordMax: 128, bodyBytes: 16_384, pageMax: 100, pageSizeMax: 50, exportPageSize: 50, challengeAttempts: 5, challengeSeconds: 300, stepUpSeconds: 300 });
export const EmptySchema = z.strictObject({});
// Text is rendered using textContent/React text nodes; this is not an HTML sanitizer.
export const plainText = (max: number, min = 1) => z.string().min(min).max(max).refine(v => v.trim().length >= min && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(v), 'Nonempty plain text without control characters required');
export const CmsTextSchema = plainText(3000).refine(v => !/[<>]/u.test(v), 'CMS accepts plain text, not HTML');
export const VersionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const VersionRequestSchema = z.strictObject({ expectedVersion: VersionSchema });
export const CursorSchema = z.string().min(16).max(512).regex(/^[A-Za-z0-9_-]+$/);
export const PageQuerySchema = z.strictObject({ page: z.number().int().min(1).max(100).default(1), limit: z.number().int().min(1).max(50).default(20) });
export const integerQuery = z.string().regex(/^(?:0|[1-9]\d*)$/).max(12).transform(Number);
export const PageQueryInputSchema = z.strictObject({ page: integerQuery.optional(), limit: integerQuery.optional() }).pipe(PageQuerySchema);
export const pageSchema = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(50), pagination: PaginationSchema });
export const DoneSchema = z.strictObject({ done: z.literal(true) });
export const DoneResponseSchema = responseSchema(DoneSchema);
export const AccountsProviderNameSchema = z.enum([...ProviderNameSchema.options, 'accounts', 'email', 'cms', 'business', 'reviews', 'exports']);
export const AccountsProviderUnavailableSchema = z.strictObject({ status: z.literal('unavailable'), provider: AccountsProviderNameSchema, reason: UnavailableReasonSchema, message: plainText(500) });
// Additive transport for new operations only. Never widen the original ErrorCodeSchema.
export const AccountsErrorCodeSchema = z.enum([...ErrorCodeSchema.options, 'UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT', 'CSRF_INVALID', 'INVALID_CREDENTIALS', 'EMAIL_VERIFICATION_REQUIRED', 'MFA_REQUIRED', 'MFA_INVALID', 'STEP_UP_REQUIRED', 'CONSENT_REQUIRED', 'GONE']);
export const ACCOUNTS_ERROR_STATUS = Object.freeze({ VALIDATION_ERROR: 400, NOT_FOUND: 404, PROVIDER_UNAVAILABLE: 503, RATE_LIMITED: 429, PAYLOAD_TOO_LARGE: 413, UNSUPPORTED_MEDIA_TYPE: 415, INTERNAL_ERROR: 500, UNAUTHORIZED: 401, FORBIDDEN: 403, CONFLICT: 409, CSRF_INVALID: 403, INVALID_CREDENTIALS: 401, EMAIL_VERIFICATION_REQUIRED: 403, MFA_REQUIRED: 403, MFA_INVALID: 401, STEP_UP_REQUIRED: 403, CONSENT_REQUIRED: 403, GONE: 410 } as const);
export const AccountsApiErrorSchema = z.strictObject({ error: z.strictObject({ code: AccountsErrorCodeSchema, message: plainText(500), details: z.array(z.strictObject({ path: plainText(200), message: plainText(300) })).max(30).optional(), provider: AccountsProviderUnavailableSchema.optional() }), meta: MetaSchema }).refine(v => v.error.code !== 'PROVIDER_UNAVAILABLE' || v.error.provider !== undefined, 'Provider error requires explicit state');
export const ConsentVersionSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const PolicyConsentRequestSchema = z.strictObject({ accepted: z.literal(true), version: ConsentVersionSchema });
export const ConsentRecordSchema = z.strictObject({ document: z.enum(['terms', 'privacy', 'platform_review_publication']), version: ConsentVersionSchema, acceptedAt: DateTimeSchema, withdrawnAt: DateTimeSchema.nullable() });
export type AccountsApiError = z.infer<typeof AccountsApiErrorSchema>;
export type AccountsErrorCode = z.infer<typeof AccountsErrorCodeSchema>;
