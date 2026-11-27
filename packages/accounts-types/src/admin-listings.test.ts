import { expect, it } from 'vitest';
import * as c from './index';
const id = '00000000-0000-4000-8000-000000000001';
it('parses bounded scalar listing filters and rejects ambiguous/unbounded input', () => {
  expect(c.AdminListingsQueryInputSchema.parse({})).toEqual({ page: 1, limit: 20 });
  expect(c.AdminListingsQueryInputSchema.parse({ ownerId: id, placeId: id, status: 'pending-payment', q: 'Fixture', page: '100', limit: '50' }).limit).toBe(50);
  for (const query of [{ q: 'x' }, { q: 'x'.repeat(201) }, { q: ['x', 'y'] }, { page: '101' }, { page: '' }, { limit: '51' }, { ownerId: 'all' }, { status: 'paid' }, { paid: 'true' }, { placeId: [id] }]) expect(c.AdminListingsQueryInputSchema.safeParse(query).success).toBe(false);
});
it('returns honest empty quote/agreement/funds without inventing price or owner', () => {
  const listing = { id, placeId: id, version: 1, sourceState: 'public-source', ownershipState: 'pending', placementState: 'pending-quote', amountRub: null, terms: null, paymentState: 'not-requested', paymentAvailable: false, quoteId: null, agreementId: null };
  const lookup = { listing, ownerId: null, businessName: 'Fixture', ownerDisplayName: null, currentQuote: null, currentAgreement: null, fundedSubscriptionSummary: null };
  expect(c.AdminListingLookupSchema.safeParse(lookup).success).toBe(true);
  expect(c.AdminListingLookupSchema.safeParse({ ...lookup, phone: '+70000000000' }).success).toBe(false);
  const quote = { id, listingId: id, amountRub: 1, currency: 'RUB', billingInterval: 'month', terms: 'Fixture quote terms', createdAt: '2026-11-27T00:00:00Z' };
  expect(c.AdminListingLookupSchema.safeParse({ ...lookup, listing: { ...listing, quoteId: id }, currentQuote: quote }).success).toBe(true);
  expect(c.AdminListingLookupSchema.safeParse({ ...lookup, listing: { ...listing, quoteId: id }, currentQuote: { ...quote, listingId: '00000000-0000-4000-8000-000000000002' } }).success).toBe(false);
});
it('limits admin lookup rights while retaining all preexisting operations', () => {
  for (const role of ['user', 'business-owner', 'support', 'moderator', 'content-manager']) expect(c.hasPermission([role], 'listing:quote')).toBe(false);
  for (const role of ['super-admin', 'admin', 'business-manager']) expect(c.hasPermission([role], 'listing:quote')).toBe(true);
  for (const id of ['listAdminListings', 'getAdminListing']) expect(c.ACCOUNT_OPERATIONS.find(o => o.id === id)).toMatchObject({ method: 'get', access: 'admin', permission: 'listing:quote' });
  expect(c.ACCOUNT_OPERATIONS).toHaveLength(101);
});
