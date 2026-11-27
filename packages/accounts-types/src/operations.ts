import * as common from './common';
import * as auth from './auth';
import * as favorites from './favorites';
import * as reviews from './reviews';
import * as business from './business';
import * as cms from './cms';
import * as admin from './admin';
import * as media from './media';
import * as catalog from './admin-catalog';
import type { Permission } from './rbac';
import type { z } from 'zod';

// Registry is the single operation inventory. It does not install Nest guards by itself.
export const ACCOUNT_SCHEMAS = { ...common, ...auth, ...favorites, ...reviews, ...business, ...cms, ...admin, ...media, ...catalog };
export type AccountSchemaName = { [K in keyof typeof ACCOUNT_SCHEMAS]: (typeof ACCOUNT_SCHEMAS)[K] extends z.ZodType ? K : never }[keyof typeof ACCOUNT_SCHEMAS];
export type Access = 'public' | 'preauth-or-session' | 'password-challenge' | 'session' | 'admin' | 'verified-owner';
export interface AccountOperation {
  readonly id: string;
  readonly method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  readonly path: string;
  readonly response: AccountSchemaName;
  readonly status: 200 | 201 | 202;
  readonly request?: AccountSchemaName;
  readonly query?: AccountSchemaName;
  readonly params?: AccountSchemaName;
  readonly access: Access;
  readonly permission?: Permission;
  readonly stepUp?: true;
  readonly verifiedEmail?: true;
  readonly csrf: boolean;
  readonly csrfBootstrap?: true;
  readonly rate: 'read' | 'auth' | 'mfa' | 'write' | 'export';
  readonly ownership?: 'self' | 'verified-business' | 'export-owner';
  readonly requestEncoding?: 'binary';
  readonly maxBodyBytes?: number;
}
type Options = Partial<Omit<AccountOperation, 'id' | 'method' | 'path' | 'response' | 'access' | 'csrf'>>;
function op(id: string, method: AccountOperation['method'], path: string, response: AccountSchemaName, access: Access, options: Options = {}): AccountOperation {
  return { id, method, path, response, access, status: 200, csrf: method !== 'get' && !options.csrfBootstrap, rate: method === 'get' ? 'read' : 'write', ...options };
}
const self = { ownership: 'self' } as const;
const owner = { ownership: 'verified-business', verifiedEmail: true } as const;
export const ACCOUNT_OPERATIONS: readonly AccountOperation[] = [
  op('provisionOwnerAccess','post','/admin/crm/owners/{ownerId}/access','OwnerAccessResponseSchema','admin',{params:'OwnerParamsSchema',request:'OwnerAccessRequestSchema',permission:'owners:write',stepUp:true}),
  op('listAdminListings', 'get', '/admin/listings', 'AdminListingsLookupResponseSchema', 'admin', { query: 'AdminListingsQuerySchema', permission: 'listing:quote' }),
  op('getAdminListing', 'get', '/admin/listings/{listingId}', 'AdminListingLookupResponseSchema', 'admin', { params: 'ListingParamsSchema', permission: 'listing:quote' }),
  op('recordFounderAgreement', 'post', '/admin/listings/{listingId}/agreement', 'FounderAgreementResponseSchema', 'admin', { params: 'ListingParamsSchema', request: 'RecordFounderAgreementRequestSchema', permission: 'listing:quote', stepUp: true, status: 201 }),
  op('listOwnerBusinessLinks', 'get', '/admin/crm/owners/{ownerId}/businesses', 'OwnerBusinessLinksResponseSchema', 'admin', { params: 'OwnerParamsSchema', query: 'PageQuerySchema', permission: 'owners:read' }),
  op('linkOwnerBusiness', 'post', '/admin/crm/owners/{ownerId}/businesses', 'OwnerBusinessLinkResponseSchema', 'admin', { params: 'OwnerParamsSchema', request: 'OwnerBusinessLinkRequestSchema', permission: 'owners:write', status: 201, stepUp: true }),
  op('listCatalogBusinesses', 'get', '/admin/catalog/businesses', 'AdminCatalogBusinessesResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'organizations:read' }),
  op('createCatalogBusiness', 'post', '/admin/catalog/businesses', 'AdminCatalogBusinessResponseSchema', 'admin', { request: 'AdminCatalogBusinessCreateRequestSchema', status: 201, permission: 'catalog:write', stepUp: true }),
  op('getCatalogBusiness', 'get', '/admin/catalog/businesses/{placeId}', 'AdminCatalogBusinessResponseSchema', 'admin', { params: 'CatalogBusinessParamsSchema', permission: 'organizations:read' }),
  op('updateCatalogBusiness', 'put', '/admin/catalog/businesses/{placeId}', 'AdminCatalogBusinessResponseSchema', 'admin', { params: 'CatalogBusinessParamsSchema', request: 'AdminCatalogBusinessUpdateRequestSchema', permission: 'catalog:write', stepUp: true }),
  op('publishCatalogBusiness', 'post', '/admin/catalog/businesses/{placeId}/publish', 'AdminCatalogBusinessResponseSchema', 'admin', { params: 'CatalogBusinessParamsSchema', request: 'VersionRequestSchema', permission: 'catalog:publish', stepUp: true }),
  op('archiveCatalogBusiness', 'delete', '/admin/catalog/businesses/{placeId}', 'DoneResponseSchema', 'admin', { params: 'CatalogBusinessParamsSchema', request: 'AdminResourceDeleteRequestSchema', permission: 'catalog:archive', stepUp: true }),
  op('listCrmOwners', 'get', '/admin/crm/owners', 'OwnersCrmResponseSchema', 'admin', { query: 'ScopedAdminQuerySchema', permission: 'owners:read' }),
  op('createCrmOwner', 'post', '/admin/crm/owners', 'OwnerCrmResponseSchema', 'admin', { request: 'OwnerCrmCreateRequestSchema', status: 201, permission: 'owners:write', stepUp: true }),
  op('getCrmOwner', 'get', '/admin/crm/owners/{ownerId}', 'OwnerCrmResponseSchema', 'admin', { params: 'OwnerParamsSchema', permission: 'owners:read' }),
  op('updateCrmOwner', 'patch', '/admin/crm/owners/{ownerId}', 'OwnerCrmResponseSchema', 'admin', { params: 'OwnerParamsSchema', request: 'OwnerCrmUpdateRequestSchema', permission: 'owners:write', stepUp: true }),
  op('archiveCrmOwner', 'delete', '/admin/crm/owners/{ownerId}', 'DoneResponseSchema', 'admin', { params: 'OwnerParamsSchema', request: 'AdminResourceDeleteRequestSchema', permission: 'owners:write', stepUp: true }),
  op('setOwnerPhone', 'put', '/admin/crm/owners/{ownerId}/phone', 'OwnerCrmResponseSchema', 'admin', { params: 'OwnerParamsSchema', request: 'OwnerContactWriteRequestSchema', permission: 'owners:phone-write', stepUp: true }),
  op('revealOwnerPhone', 'post', '/admin/crm/owners/{ownerId}/reveal-phone', 'OwnerPhoneRevealResponseSchema', 'admin', { params: 'OwnerParamsSchema', request: 'OwnerPhoneRevealRequestSchema', permission: 'owners:phone-reveal', stepUp: true }),
  op('getReviewEditor', 'get', '/admin/reviews/{reviewId}/editor', 'AdminReviewEditorResponseSchema', 'admin', { params: 'ReviewParamsSchema', permission: 'moderation:read' }),
  op('correctReview', 'post', '/admin/reviews/{reviewId}/corrections', 'ReviewCorrectionResponseSchema', 'admin', { params: 'ReviewParamsSchema', request: 'ReviewCorrectionRequestSchema', permission: 'reviews:correct', stepUp: true }),
  op('listReviewCorrections', 'get', '/admin/reviews/{reviewId}/corrections', 'ReviewCorrectionsResponseSchema', 'admin', { params: 'ReviewParamsSchema', query: 'PageQuerySchema', permission: 'moderation:read' }),
  op('listMedia', 'get', '/admin/media', 'MediaAssetsResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'media:read' }),
  op('createMediaUpload', 'post', '/admin/media', 'MediaUploadTicketResponseSchema', 'admin', { request: 'MediaUploadCreateRequestSchema', status: 201, permission: 'media:write', stepUp: true }),
  op('uploadMediaContent', 'put', '/admin/media/{mediaId}/content', 'MediaAssetResponseSchema', 'admin', { params: 'MediaParamsSchema', request: 'MediaBinaryRequestSchema', requestEncoding: 'binary', maxBodyBytes: 2_097_152, permission: 'media:write', stepUp: true }),
  op('archiveMedia', 'delete', '/admin/media/{mediaId}', 'DoneResponseSchema', 'admin', { params: 'MediaParamsSchema', request: 'EmptySchema', permission: 'media:write', stepUp: true }),
  op('applyPaidListing', 'post', '/business/listings', 'ListingResponseSchema', 'session', { request: 'ListingApplicationRequestSchema', status: 202, ...self }),
  op('listMyListings', 'get', '/business/listings', 'ListingsResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('quoteListing', 'post', '/admin/listings/{listingId}/quote', 'ListingResponseSchema', 'admin', { params: 'ListingParamsSchema', request: 'ListingQuoteRequestSchema', permission: 'listing:quote', stepUp: true }),
  op('confirmManualPayment', 'post', '/admin/listings/{listingId}/manual-payment', 'ListingResponseSchema', 'admin', { params: 'ListingParamsSchema', request: 'ManualPeriodConfirmationRequestSchema', permission: 'listing:payment-confirm', stepUp: true }),
  op('reviewListing', 'post', '/admin/listings/{listingId}/decision', 'ListingResponseSchema', 'admin', { params: 'ListingParamsSchema', request: 'ModerationDecisionRequestSchema', permission: 'moderation:decide', stepUp: true }),
  op('getAuthPolicy', 'get', '/auth/policy', 'PolicyResponseSchema', 'public'),
  op('getCsrf', 'get', '/auth/csrf', 'CsrfResponseSchema', 'preauth-or-session', { rate: 'auth' }),
  op('bootstrapCsrf', 'post', '/auth/csrf', 'CsrfResponseSchema', 'preauth-or-session', { request: 'EmptySchema', csrfBootstrap: true, rate: 'auth' }),
  op('register', 'post', '/auth/register', 'RegisterResponseSchema', 'preauth-or-session', { request: 'RegisterRequestSchema', status: 201, rate: 'auth' }),
  op('login', 'post', '/auth/login', 'LoginResponseSchema', 'preauth-or-session', { request: 'LoginRequestSchema', rate: 'auth' }),
  op('logout', 'post', '/auth/logout', 'DoneResponseSchema', 'preauth-or-session', { request: 'EmptySchema', rate: 'auth' }),
  op('getMe', 'get', '/auth/me', 'MeResponseSchema', 'session'),
  op('verifyMfa', 'post', '/auth/mfa/verify', 'MeResponseSchema', 'password-challenge', { request: 'MfaVerifyRequestSchema', rate: 'mfa' }),
  op('startMfaEnrollment', 'post', '/auth/mfa/enrollment', 'TotpEnrollmentResponseSchema', 'preauth-or-session', { request: 'EmptySchema', rate: 'mfa' }),
  op('verifyMfaEnrollment', 'post', '/auth/mfa/enrollment/verify', 'EnrollmentResponseSchema', 'preauth-or-session', { request: 'TotpEnrollmentVerifyRequestSchema', rate: 'mfa' }),
  op('stepUp', 'post', '/auth/step-up', 'StepUpResponseSchema', 'session', { request: 'StepUpRequestSchema', rate: 'mfa' }),
  op('rotateRecoveryCodes', 'post', '/auth/mfa/recovery-codes', 'RecoveryCodesResponseSchema', 'session', { request: 'EmptySchema', stepUp: true, rate: 'mfa' }),
  op('changePassword', 'post', '/auth/password', 'DoneResponseSchema', 'session', { request: 'PasswordChangeRequestSchema', stepUp: true, rate: 'auth' }),
  op('listSessions', 'get', '/account/sessions', 'SessionsResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('revokeSession', 'delete', '/account/sessions/{sessionId}', 'DoneResponseSchema', 'session', { request: 'EmptySchema', params: 'SessionParamsSchema', ...self }),
  op('revokeOtherSessions', 'post', '/account/sessions/revoke-others', 'DoneResponseSchema', 'session', { request: 'EmptySchema', stepUp: true, ...self }),
  op('updateProfile', 'patch', '/account', 'AccountResponseSchema', 'session', { request: 'ProfileRequestSchema', ...self }),
  op('deleteAccount', 'delete', '/account', 'DeletionResponseSchema', 'session', { request: 'DeleteAccountRequestSchema', status: 202, stepUp: true, ...self }),
  op('requestExport', 'post', '/account/exports', 'ExportJobResponseSchema', 'session', { request: 'EmptySchema', status: 202, stepUp: true, rate: 'export', ...self }),
  op('getExport', 'get', '/account/exports/{exportId}', 'ExportJobResponseSchema', 'session', { params: 'ExportParamsSchema', stepUp: true, ownership: 'export-owner', rate: 'export' }),
  op('getExportPage', 'get', '/account/exports/{exportId}/pages', 'ExportPageResponseSchema', 'session', { params: 'ExportParamsSchema', query: 'ExportPageQuerySchema', stepUp: true, ownership: 'export-owner', rate: 'export' }),
  op('listFavorites', 'get', '/account/favorites', 'FavoritesResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('saveFavorite', 'put', '/account/favorites/{placeId}', 'FavoriteResponseSchema', 'session', { params: 'PlaceIdParamsSchema', request: 'EmptySchema', ...self }),
  op('removeFavorite', 'delete', '/account/favorites/{placeId}', 'DoneResponseSchema', 'session', { params: 'PlaceIdParamsSchema', request: 'EmptySchema', ...self }),
  op('listPlaceReviews', 'get', '/places/{placeId}/reviews', 'PlaceReviewsResponseSchema', 'public', { params: 'PlaceIdParamsSchema', query: 'PageQuerySchema' }),
  op('createPlaceReview', 'post', '/places/{placeId}/reviews', 'ReviewResponseSchema', 'session', { params: 'PlaceIdParamsSchema', request: 'PlaceReviewCreateRequestSchema', status: 201, ...self }),
  op('listMyReviews', 'get', '/account/reviews', 'MyReviewsResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('editPlaceReview', 'patch', '/account/reviews/{reviewId}', 'ReviewResponseSchema', 'session', { params: 'ReviewParamsSchema', request: 'ReviewEditRequestSchema', ...self }),
  op('submitReview', 'post', '/account/reviews/{reviewId}/submit', 'ReviewResponseSchema', 'session', { params: 'ReviewParamsSchema', request: 'VersionRequestSchema', ...self }),
  op('deleteReview', 'delete', '/account/reviews/{reviewId}', 'DoneResponseSchema', 'session', { params: 'ReviewParamsSchema', request: 'VersionRequestSchema', ...self }),
  op('createPlatformReview', 'post', '/account/platform-reviews', 'ReviewResponseSchema', 'session', { request: 'PlatformReviewCreateRequestSchema', status: 201, ...self }),
  op('editPlatformReview', 'patch', '/account/platform-reviews/{reviewId}', 'ReviewResponseSchema', 'session', { params: 'ReviewParamsSchema', request: 'PlatformReviewEditRequestSchema', ...self }),
  op('withdrawPlatformReviewConsent', 'post', '/account/platform-reviews/{reviewId}/withdraw-consent', 'DoneResponseSchema', 'session', { params: 'ReviewParamsSchema', request: 'VersionRequestSchema', ...self }),
  op('createOrganizationProposal', 'post', '/business/proposals', 'ProposalResponseSchema', 'session', { request: 'OrganizationProposalRequestSchema', status: 202, ...self }),
  op('listMyProposals', 'get', '/business/proposals', 'ProposalsResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('withdrawProposal', 'post', '/business/proposals/{proposalId}/withdraw', 'ProposalResponseSchema', 'session', { request: 'VersionRequestSchema', params: 'ProposalParamsSchema', ...self }),
  op('createOwnershipClaim', 'post', '/business/claims', 'ClaimResponseSchema', 'session', { request: 'ClaimCreateRequestSchema', status: 202, ...self }),
  op('listMyClaims', 'get', '/business/claims', 'ClaimsResponseSchema', 'session', { query: 'PageQuerySchema', ...self }),
  op('withdrawClaim', 'post', '/business/claims/{claimId}/withdraw', 'ClaimResponseSchema', 'session', { request: 'VersionRequestSchema', params: 'ClaimParamsSchema', ...self }),
  op('getBusinessDashboard', 'get', '/business/dashboard', 'BusinessDashboardResponseSchema', 'session', self),
  op('listBusinessBranches', 'get', '/business/{businessId}/branches', 'BranchesResponseSchema', 'verified-owner', { params: 'BusinessParamsSchema', query: 'PageQuerySchema', ...owner }),
  op('proposeBranch', 'post', '/business/{businessId}/branches', 'ProposalResponseSchema', 'verified-owner', { params: 'BusinessParamsSchema', request: 'BranchAddRequestSchema', status: 202, stepUp: true, ...owner }),
  op('proposeBranchChange', 'post', '/business/{businessId}/branches/{placeId}/changes', 'ChangeResponseSchema', 'verified-owner', { params: 'BranchParamsSchema', request: 'BranchChangeRequestSchema', status: 202, stepUp: true, ...owner }),
  op('getBusinessStats', 'get', '/business/{businessId}/stats', 'BusinessStatsResponseSchema', 'verified-owner', { params: 'BusinessParamsSchema', ...owner }),
  op('getPublishedContent', 'get', '/content/{key}', 'PublicCmsResponseSchema', 'public', { params: 'CmsParamsSchema' }),
  op('listAdminOrganizations', 'get', '/admin/organizations', 'AdminOrganizationsResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'organizations:read' }),
  op('proposeAdminOrganizationChange', 'post', '/admin/organizations/{placeId}/changes', 'ChangeResponseSchema', 'admin', { params: 'PlaceIdParamsSchema', request: 'BranchChangeRequestSchema', status: 202, permission: 'organizations:propose', stepUp: true }),
  op('listAdminCategories', 'get', '/admin/categories', 'AdminCategoriesResponseSchema', 'admin', { permission: 'categories:read' }),
  op('listAdminCities', 'get', '/admin/cities', 'AdminCitiesResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'cities:read' }),
  op('listModeration', 'get', '/admin/moderation', 'ModerationPageResponseSchema', 'admin', { query: 'ModerationQuerySchema', permission: 'moderation:read' }),
  op('decideModeration', 'post', '/admin/moderation/{kind}/{id}/decision', 'ModerationResponseSchema', 'admin', { params: 'ModerationParamsSchema', request: 'ModerationDecisionRequestSchema', permission: 'moderation:decide', stepUp: true }),
  op('listAdminClaims', 'get', '/admin/claims', 'AdminClaimsResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'claims:read' }),
  op('decideClaim', 'post', '/admin/claims/{claimId}/decision', 'AdminClaimResponseSchema', 'admin', { params: 'ClaimParamsSchema', request: 'ClaimDecisionRequestSchema', permission: 'claims:decide', stepUp: true }),
  op('listAdminUsers', 'get', '/admin/users', 'AdminUsersResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'users:read' }),
  op('setUserStatus', 'post', '/admin/users/{userId}/status', 'AdminUserResponseSchema', 'admin', { params: 'UserParamsSchema', request: 'UserStatusRequestSchema', permission: 'users:suspend', stepUp: true }),
  op('setUserRoles', 'put', '/admin/users/{userId}/roles', 'AdminUserResponseSchema', 'admin', { params: 'UserParamsSchema', request: 'RoleGrantRequestSchema', permission: 'users:roles', stepUp: true }),
  op('getCmsDraft', 'get', '/admin/cms/{key}', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminCmsParamsSchema', permission: 'content:read' }),
  op('writeCmsDraft', 'put', '/admin/cms/{key}', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminCmsParamsSchema', request: 'CmsWriteRequestSchema', permission: 'content:write', stepUp: true }),
  op('listCmsRevisions', 'get', '/admin/cms/{key}/revisions', 'CmsRevisionsResponseSchema', 'admin', { params: 'AdminCmsParamsSchema', query: 'PageQuerySchema', permission: 'content:read' }),
  op('publishCms', 'post', '/admin/cms/{key}/publish', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminCmsParamsSchema', request: 'CmsPublishRequestSchema', permission: 'content:publish', stepUp: true }),
  op('rollbackCms', 'post', '/admin/cms/{key}/rollback', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminCmsParamsSchema', request: 'CmsRollbackRequestSchema', permission: 'content:write', stepUp: true }),
  op('getSettingsDraft', 'get', '/admin/settings/{key}', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminSettingsParamsSchema', permission: 'settings:read' }),
  op('writeSettingsDraft', 'put', '/admin/settings/{key}', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminSettingsParamsSchema', request: 'CmsWriteRequestSchema', permission: 'settings:write', stepUp: true }),
  op('listSettingsRevisions', 'get', '/admin/settings/{key}/revisions', 'CmsRevisionsResponseSchema', 'admin', { params: 'AdminSettingsParamsSchema', query: 'PageQuerySchema', permission: 'settings:read' }),
  op('publishSettings', 'post', '/admin/settings/{key}/publish', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminSettingsParamsSchema', request: 'CmsPublishRequestSchema', permission: 'settings:publish', stepUp: true }),
  op('rollbackSettings', 'post', '/admin/settings/{key}/rollback', 'CmsRevisionResponseSchema', 'admin', { params: 'AdminSettingsParamsSchema', request: 'CmsRollbackRequestSchema', permission: 'settings:write', stepUp: true }),
  op('listAdminSources', 'get', '/admin/sources', 'AdminSourcesResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'sources:read' }),
  op('listAdminImports', 'get', '/admin/imports', 'AdminImportsResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'imports:read' }),
  op('listAudit', 'get', '/admin/audit', 'AuditResponseSchema', 'admin', { query: 'PageQuerySchema', permission: 'audit:read', stepUp: true }),
  op('getAdminStats', 'get', '/admin/stats', 'AdminStatsResponseSchema', 'admin', { permission: 'stats:read' })
];
