import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as c from './index';
const id = '00000000-0000-4000-8000-000000000001';
describe('minimal admin resource contracts', () => {
  it('projects only dated receipt-linked owner subscriptions and keeps absence null', () => {
    const at = '2026-11-27T00:00:00Z';
    const subscription = { status: 'active', billing: { billingInterval: 'month', currency: 'RUB', monthlyPriceRub: 1, automaticBillingEnabled: false }, startsAt: '2026-11-01T00:00:00Z', currentPeriodStartsAt: '2026-11-01T00:00:00Z', currentPeriodEndsAt: '2026-12-01T00:00:00Z', graceEndsAt: null, cancelledAt: null, endedAt: null, cancelAtPeriodEnd: false, evaluatedAt: at };
    const summary = { listingId: id, placeId: id, businessId: null, fundingSource: 'confirmed-funds', receiptId: id, agreementId: id, billingTimezone: 'Europe/Moscow', subscription };
    expect(c.OwnerFundedSubscriptionSchema.safeParse(summary).success).toBe(true);
    for (const delta of [{ fundingSource: 'crm-reference' }, { receiptId: null }, { agreementId: null }, { remainingDays: 30 }, { billingTimezone: 'invented/timezone' }]) expect(c.OwnerFundedSubscriptionSchema.safeParse({ ...summary, ...delta }).success).toBe(false);
    expect(c.OwnerFundedSubscriptionSchema.safeParse({ ...summary, subscription: { ...subscription, status: 'pending', startsAt: null, currentPeriodStartsAt: null, currentPeriodEndsAt: null } }).success).toBe(false);
    const owner = { id, version: 1, dataScope: 'production', displayName: 'Production fixture', accountId: null, phone: { visibility: 'hidden', hasValue: false }, notes: null, manualBilling: { mode: 'founder-agreement', renewal: 'operator-confirmed-monthly', providerRequired: false, contacts: [{ channel: 'vk', url: 'https://vk.ru/desktopcoder' }, { channel: 'telegram', url: 'https://t.me/desktopcoder' }] }, updatedAt: at, fundedSubscriptionSummary: null };
    expect(c.OwnerCrmSchema.safeParse(owner).success).toBe(true);
    expect(c.OwnerCrmSchema.safeParse({ ...owner, fundedSubscriptionSummary: summary }).success).toBe(true);
  });
  it('records explicit externally verified agreement without asserting funds', () => {
    const request = { expectedVersion: 1, quoteId: id, ownerId: id, acceptedBy: 'Customer fixture', acceptedAt: '2026-11-27T00:00:00Z', channel: 'vk', agreementReference: 'fixture-agreement', verificationNote: 'Actual agreement checked', billingTimezone: 'Europe/Moscow', billingAnchorAt: '2026-11-27T09:00:00+03:00', idempotencyKey: id };
    expect(c.RecordFounderAgreementRequestSchema.safeParse(request).success).toBe(true);
    for (const delta of [{ paid: true }, { status: 'active' }, { recordedBy: id }, { billingTimezone: 'arbitrary' }, { acceptedAt: 'yesterday' }]) expect(c.RecordFounderAgreementRequestSchema.safeParse({ ...request, ...delta }).success).toBe(false);
    const op = c.ACCOUNT_OPERATIONS.find(o => o.id === 'recordFounderAgreement');
    expect(op).toMatchObject({ method: 'post', access: 'admin', permission: 'listing:quote', stepUp: true, csrf: true });
    expect(c.hasPermission(['support'], 'listing:quote')).toBe(false);
    const listing = { id, placeId: id, version: 1, sourceState: 'public-source', ownershipState: 'pending', placementState: 'pending-quote', amountRub: null, terms: null, paymentState: 'not-requested', paymentAvailable: false, quoteId: null, agreementId: null };
    expect(c.ListingWithSubscriptionSchema.safeParse(listing).success).toBe(true);
    expect(c.ListingWithSubscriptionSchema.safeParse({ ...listing, quoteId: id, agreementId: id }).success).toBe(true);
    expect(c.ListingWithSubscriptionSchema.safeParse({ ...listing, quoteId: 'invented' }).success).toBe(false);
  });
  it('requires separate scopes and prevents demo owner production rights', () => {
    const demo = { dataScope: 'demo', displayName: 'Демо-владелец', demoLabel: 'Демонстрационные данные — вымышленный владелец', remainingDays: 22, reason: 'Isolated demo fixture' };
    expect(c.OwnerCrmCreateRequestSchema.safeParse(demo).success).toBe(true);
    for (const delta of [{ remainingDays: 21 }, { remainingDays: 31 }, { accountId: id }, { phone: '+70000000000' }, { paid: true }, { productionEntitlement: true }, { demoLabel: '' }]) expect(c.OwnerCrmCreateRequestSchema.safeParse({ ...demo, ...delta }).success).toBe(false);
    expect(c.ScopedAdminQueryInputSchema.safeParse({}).success).toBe(false);
    expect(c.ScopedAdminQueryInputSchema.safeParse({ dataScope: ['production', 'demo'] }).success).toBe(false);
    expect(c.ScopedAdminQueryInputSchema.parse({ dataScope: 'demo', limit: '35' }).limit).toBe(35);
    expect(c.OwnerBusinessLinkSchema.safeParse({ ownerId: id, placeId: id, relation: 'crm-reference', ownershipProven: true, createdAt: '2026-11-27T00:00:00Z' }).success).toBe(false);
  });
  it('hides owner phone and grants reveal only separately with MFA metadata', () => {
    expect(c.HiddenPhoneSchema.safeParse({ visibility: 'hidden', hasValue: true, phone: '+70000000000' }).success).toBe(false);
    expect(c.OwnerPhoneRevealRequestSchema.safeParse({ reason: 'x' }).success).toBe(false);
    const reveal = c.ACCOUNT_OPERATIONS.find(o => o.id === 'revealOwnerPhone');
    expect(reveal).toMatchObject({ method: 'post', access: 'admin', csrf: true, stepUp: true, permission: 'owners:phone-reveal' });
    expect(c.hasPermission(['support'], 'owners:phone-reveal')).toBe(false);
    expect(c.hasPermission(['content-manager'], 'owners:phone-reveal')).toBe(false);
    expect(c.hasPermission(['business-manager'], 'owners:phone-reveal')).toBe(true);
  });
  it('permits raster tickets and rejects SVG, oversized data and client paths', () => {
    const ticket = { purpose: 'logo', mime: 'image/png', byteLength: 1024, sha256: 'a'.repeat(64), rightsConfirmed: true, attribution: 'Fixture author', license: 'Fixture license' };
    expect(c.MediaUploadCreateRequestSchema.safeParse(ticket).success).toBe(true);
    for (const delta of [{ mime: 'image/svg+xml' }, { mime: 'image/gif' }, { byteLength: 2097153 }, { byteLength: 0 }, { path: '../../public/x' }, { sourceUrl: 'http://localhost' }, { rightsConfirmed: false }]) expect(c.MediaUploadCreateRequestSchema.safeParse({ ...ticket, ...delta }).success).toBe(false);
    expect(c.LocalRasterUrlSchema.safeParse(`/media/${id}.webp`).success).toBe(true);
    for (const url of ['//host/media/x.webp', '/media/../x.webp', '/media/x.svg', `/media/${id}.webp?q=1`, 'https://host/image.png']) expect(c.LocalRasterUrlSchema.safeParse(url).success).toBe(false);
    expect(c.CmsAssetSchema.safeParse({ source: 'supplied', url: '/assets/brand/other.svg', alt: 'logo' }).success).toBe(false);
    expect(c.CmsDocumentSchema.safeParse({ kind: 'brand', logo: { source: 'supplied', url: '/assets/brand/logo-horizontal.svg', alt: 'Рядом' }, logoMark: { source: 'supplied', url: '/assets/brand/logo-mark.svg', alt: 'Рядом' }, hero: null }).success).toBe(true);
  });
  it('does not accept authorship, rating, original or publication injection in corrections', () => {
    const correction = { expectedVersion: 1, correctedText: 'Corrected fixture text', reason: 'Spelling correction only' };
    expect(c.ReviewCorrectionRequestSchema.safeParse(correction).success).toBe(true);
    for (const delta of [{ authorId: id }, { originalText: 'replace' }, { rating: 5 }, { publishedAt: '2026-11-27T00:00:00Z' }, { status: 'published' }]) expect(c.ReviewCorrectionRequestSchema.safeParse({ ...correction, ...delta }).success).toBe(false);
    expect(c.hasPermission(['business-manager'], 'reviews:correct')).toBe(false);
    expect(c.hasPermission(['moderator'], 'reviews:correct')).toBe(true);
    const at = '2026-11-27T00:00:00Z';
    const review = { id, authorId: id, kind: 'place', placeId: id, rating: 3, text: 'Original fixture text', status: 'draft', version: 1, verification: 'unverified', publicationConsent: null, createdAt: at, updatedAt: at, publishedAt: null };
    const record = { id, reviewId: id, authorId: id, originalText: review.text, correctedText: correction.correctedText, editorId: id, reason: correction.reason, createdAt: at, version: 2, auditId: id };
    const editor = { review, originalText: review.text, corrections: [record], hasMoreCorrections: false };
    expect(c.AdminReviewEditorSchema.safeParse(editor).success).toBe(true);
    expect(c.AdminReviewEditorSchema.safeParse({ ...editor, corrections: [{ ...record, originalText: 'Substituted original' }] }).success).toBe(false);
    expect(c.AdminReviewEditorSchema.safeParse({ ...editor, corrections: [{ ...record, authorId: '00000000-0000-4000-8000-000000000002' }] }).success).toBe(false);
  });
  it('declares raw upload transport and guards all new mutations', () => {
    const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/openapi-accounts.yaml'), 'utf8'));
    const upload = doc.paths['/admin/media/{mediaId}/content'].put;
    expect(upload.requestBody.content['application/octet-stream'].schema.maxLength).toBe(2097152);
    expect(upload['x-ryadom-guards']).toMatchObject({ maxBodyBytes: 2097152, csrf: true, mfa: true, stepUp: true });
    for (const operation of c.ACCOUNT_OPERATIONS.filter(o => o.path.startsWith('/admin/') && o.method !== 'get')) expect(operation).toMatchObject({ access: 'admin', csrf: true, stepUp: true });
    expect(new Set(c.ACCOUNT_OPERATIONS.map(o => `${o.method} ${o.path}`)).size).toBe(c.ACCOUNT_OPERATIONS.length);
  });
});
