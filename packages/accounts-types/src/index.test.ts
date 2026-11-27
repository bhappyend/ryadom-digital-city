import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as c from './index';
const registration = { email: 'test@example.invalid', password: ' 1234567890 ', displayName: 'Schema fixture', terms: { accepted: true, version: 'v1' }, privacy: { accepted: true, version: 'v1' } };
describe('accounts boundary and authorization contracts', () => {
  it('limits homepage hero slots to plain text and fixed CTA destinations', () => {
    const homepageHero = { heading: 'Fixture heading', subheading: 'Fixture subheading', primaryCta: { label: 'Search', href: '#quick-search' }, secondaryCta: { label: 'Map', href: '/map' } };
    expect(c.HomepageHeroSchema.safeParse(homepageHero).success).toBe(true);
    expect(c.HomepageHeroSchema.safeParse({ ...homepageHero, primaryCta: { label: 'Search', href: 'https://evil.invalid' } }).success).toBe(false);
    expect(c.HomepageHeroSchema.safeParse({ ...homepageHero, heading: '<script>x</script>' }).success).toBe(false);
    const content = { key: 'homepage', revisionId: '00000000-0000-4000-8000-000000000001', version: 1, document: { kind: 'section', title: 'Fixture', blocks: [], homepageHero }, publishedAt: '2026-11-27T00:00:00Z' };
    expect(c.PublicCmsSchema.safeParse(content).success).toBe(true);
    expect(c.PublicCmsSchema.safeParse({ ...content, key: 'about' }).success).toBe(false);
  });
  it('restricts manual billing contacts and never interprets contact actions as funds', () => {
    const manual = { mode: 'founder-agreement', renewal: 'operator-confirmed-monthly', providerRequired: false, contacts: [{ channel: 'vk', url: 'https://vk.ru/desktopcoder' }, { channel: 'telegram', url: 'https://t.me/desktopcoder' }] };
    expect(c.ManualBillingModeSchema.safeParse(manual).success).toBe(true);
    for (const url of ['https://vk.ru/desktopcoder/', 'https://vk.ru/other', 'https://t.me/desktopcoder?start=paid', 'javascript:alert(1)']) expect(c.FounderContactSchema.safeParse({ channel: 'vk', url }).success).toBe(false);
    for (const extra of [{ paid: true }, { clicked: true }, { messageSent: true }, { proofUpload: 'receipt.png' }]) expect(c.ManualBillingModeSchema.safeParse({ ...manual, ...extra }).success).toBe(false);
    expect(c.ManualBillingModeSchema.safeParse({ ...manual, providerRequired: true }).success).toBe(false);
    expect(c.ManualBillingModeSchema.safeParse({ ...manual, contacts: [manual.contacts[0], manual.contacts[0]] }).success).toBe(false);
    const receipt = { expectedVersion: 1, receiptReference: 'fixture-reference', amountRub: 1, receivedAt: '2026-11-27T00:00:00Z', reason: 'Fixture funds reviewed', currency: 'RUB', quoteId: '00000000-0000-4000-8000-000000000001', agreementReference: 'fixture-agreement', periodStartsAt: '2026-11-27T00:00:00Z', periodEndsAt: '2026-12-27T00:00:00Z', idempotencyKey: '00000000-0000-4000-8000-000000000002' };
    expect(c.ManualPeriodConfirmationRequestSchema.safeParse(receipt).success).toBe(true);
    expect(c.ManualPeriodConfirmationRequestSchema.safeParse({ ...receipt, status: 'active' }).success).toBe(false);
    expect(c.ManualPeriodConfirmationRequestSchema.safeParse({ ...receipt, periodEndsAt: receipt.periodStartsAt }).success).toBe(false);
    const operation = c.ACCOUNT_OPERATIONS.find(o => o.id === 'confirmManualPayment')!;
    expect(operation).toMatchObject({ access: 'admin', permission: 'listing:payment-confirm', csrf: true, stepUp: true });
  });
  it('models monthly unknown pricing without inventing billing availability', () => {
    const billing = { billingInterval: 'month', currency: 'RUB', monthlyPriceRub: null, automaticBillingEnabled: false };
    expect(c.MonthlyBillingSchema.safeParse(billing).success).toBe(true);
    for (const delta of [{ currency: 'USD' }, { billingInterval: 'year' }, { monthlyPriceRub: 0 }, { monthlyPriceRub: -1 }, { automaticBillingEnabled: true }]) expect(c.MonthlyBillingSchema.safeParse({ ...billing, ...delta }).success).toBe(false);
    expect(c.PaidListingPricingSchema.safeParse({ model: 'paid-listing', amountRub: 100, terms: 'Monthly fixture terms', paymentAvailable: false, billing }).success).toBe(false);
  });
  it('requires funded dated periods and coherent subscription lifecycle', () => {
    const pending = { status: 'pending', billing: { billingInterval: 'month', currency: 'RUB', monthlyPriceRub: null, automaticBillingEnabled: false }, startsAt: null, currentPeriodStartsAt: null, currentPeriodEndsAt: null, graceEndsAt: null, cancelledAt: null, endedAt: null, cancelAtPeriodEnd: false, evaluatedAt: '2026-11-27T00:00:00Z' };
    expect(c.ListingSubscriptionSchema.safeParse(pending).success).toBe(true);
    expect(c.ListingSubscriptionSchema.safeParse({ ...pending, status: 'active' }).success).toBe(false);
    const active = { ...pending, status: 'active', billing: { ...pending.billing, monthlyPriceRub: 1 }, startsAt: '2026-11-01T00:00:00Z', currentPeriodStartsAt: '2026-11-01T00:00:00Z', currentPeriodEndsAt: '2026-12-01T00:00:00Z' };
    expect(c.ListingSubscriptionSchema.safeParse(active).success).toBe(true);
    expect(c.ListingSubscriptionSchema.safeParse({ ...active, currentPeriodEndsAt: active.startsAt }).success).toBe(false);
    expect(c.ListingSubscriptionSchema.safeParse({ ...active, status: 'past-due' }).success).toBe(false);
    expect(c.ListingSubscriptionSchema.safeParse({ ...active, status: 'cancelled', cancelledAt: pending.evaluatedAt, cancelAtPeriodEnd: true }).success).toBe(true);
    expect(c.ListingSubscriptionSchema.safeParse({ ...active, status: 'expired' }).success).toBe(false);
  });
  it('preserves password bytes and enforces exact bounds', () => {
    expect(c.RegisterRequestSchema.parse(registration).password).toBe(registration.password);
    for (const password of ['a'.repeat(11), 'a'.repeat(129)]) expect(c.PasswordSchema.safeParse(password).success).toBe(false);
    expect(c.PasswordSchema.parse('a'.repeat(128))).toHaveLength(128);
  });
  it.each([{ roles: ['super-admin'] }, { emailVerified: true }, { ownerId: 'other' }, { terms: { accepted: false, version: 'v1' } }, { privacy: { accepted: true, version: 'v1', acceptedAt: '2026-11-27T00:00:00Z' } }])('rejects escalation, false consent and client timestamps %j', delta => {
    expect(c.RegisterRequestSchema.safeParse({ ...registration, ...delta }).success).toBe(false);
  });
  it('denies unknown roles/scopes and least privilege escalation', () => {
    expect(c.hasPermission(['moderator'], 'users:roles')).toBe(false);
    expect(c.hasPermission(['super-admin', 'invented'], 'users:roles')).toBe(false);
    expect(c.hasPermission(['super-admin'], 'invented')).toBe(false);
    expect(c.hasPermission(['business-owner'], 'claims:decide')).toBe(false);
    expect(c.hasPermission(['business-manager'], 'listing:payment-confirm')).toBe(false);
    expect(c.hasPermission(['super-admin'], 'users:roles')).toBe(true);
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', '//example.invalid', 'https://u:p@example.invalid', 'https://example.invalid/\n'])('rejects unsafe contact URL %s', url => expect(c.SafeContactUrlSchema.safeParse(url).success).toBe(false));
  it('rejects HTML and oversized multibyte CMS documents', () => {
    expect(c.CmsDocumentSchema.safeParse({ kind: 'section', title: '<script>x</script>', blocks: [] }).success).toBe(false);
    expect(c.CmsDocumentSchema.safeParse({ kind: 'section', title: 'Title', blocks: Array.from({ length: 4 }, () => ({ kind: 'paragraph', text: 'я'.repeat(2000) })) }).success).toBe(false);
    expect(c.CmsDocumentSchema.safeParse({ kind: 'section', title: 'Title', blocks: [], rawHtml: 'x' }).success).toBe(false);
  });
  it('rejects ambiguous queries, fake payment availability and invalid manual proof', () => {
    for (const query of [{ page: ['1'] }, { page: '' }, { limit: '51' }, { unknown: '1' }]) expect(c.PageQueryInputSchema.safeParse(query).success).toBe(false);
    expect(c.PaidListingPricingSchema.safeParse({ model: 'paid-listing', amountRub: null, terms: 'Quote required', paymentAvailable: true }).success).toBe(false);
    expect(c.ClaimDecisionRequestSchema.safeParse({ decision: 'verify', expectedVersion: 1, verificationMethod: 'insufficient_evidence', verificationNote: 'x'.repeat(20) }).success).toBe(false);
  });
  it('keeps OpenAPI and guard inventory consistent', () => {
    const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/openapi-accounts.yaml'), 'utf8'));
    expect(Object.values(doc.paths as Record<string, Record<string, unknown>>).flatMap(v => Object.values(v))).toHaveLength(c.ACCOUNT_OPERATIONS.length);
    for (const op of c.ACCOUNT_OPERATIONS) {
      expect(doc.paths[op.path][op.method].operationId).toBe(op.id);
      if (op.method !== 'get' && op.id !== 'bootstrapCsrf') expect(op.csrf).toBe(true);
      if (op.access === 'admin') expect(op.permission).toBeDefined();
      if (op.access === 'verified-owner') expect(op.ownership).toBe('verified-business');
    }
  });
  it('exempts only the exact CSRF bootstrap handler and retains Origin enforcement', () => {
    const exempt = c.ACCOUNT_OPERATIONS.filter(o => o.method !== 'get' && !o.csrf);
    expect(exempt).toHaveLength(1);
    expect(exempt[0]).toMatchObject({ id: 'bootstrapCsrf', method: 'post', path: '/auth/csrf', request: 'EmptySchema', csrfBootstrap: true, rate: 'auth' });
    const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/openapi-accounts.yaml'), 'utf8'));
    const bootstrap = doc.paths['/auth/csrf'].post;
    expect(bootstrap['x-ryadom-guards']).toMatchObject({ csrf: false, exactOrigin: true, csrfBootstrap: true });
    expect(bootstrap.parameters.some((p: { name: string }) => p.name === 'Origin')).toBe(true);
    expect(bootstrap.parameters.some((p: { name: string }) => p.name === 'X-CSRF-Token')).toBe(false);
    expect(doc.paths['/auth/csrf'].get['x-ryadom-guards'].exactOrigin).toBe(true);
    expect(c.EmptySchema.safeParse({ csrfExempt: true }).success).toBe(false);
  });
});
