import { describe, expect, it, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { adminRequest } from '../admin/api';
import { ClaimCreateRequestSchema, ListingApplicationRequestSchema } from '@ryadom/accounts-types';

afterEach(() => vi.unstubAllGlobals());
describe('applicant account boundary', () => {
  it('cannot submit verified ownership or payment state with applicant payloads', () => {
    expect(ClaimCreateRequestSchema.safeParse({ placeId: '00000000-0000-4000-8000-000000000001', relationship: 'owner', evidenceText: 'Actual source for independent verification', consent: true, status: 'verified' }).success).toBe(false);
    expect(ListingApplicationRequestSchema.safeParse({ placeId: '00000000-0000-4000-8000-000000000001', placementRequest: 'Actual placement request', termsConsent: true, paymentState: 'manually-confirmed' }).success).toBe(false);
  });
  it('rejects unsafe targets before network access', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const path of ['https://foreign.invalid/auth/me', '//foreign.invalid/auth/me', '/business/../admin/users', '/business/%2e%2e/admin', '/auth/me#fragment', '/auth/me?bad=%zz']) await expect(adminRequest(path, z.unknown())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts encoded literal Cyrillic search on fixed origin with private no-store', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))); vi.stubGlobal('fetch', fetcher);
    const path = '/admin/listings?' + new URLSearchParams({ q: 'Кафе у дома', page: '1' });
    await adminRequest(path, z.object({ ok: z.literal(true) }));
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1' + path);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
  });
  it('bootstraps actual POST CSRF before applicant writes', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { token: 'a'.repeat(43), expiresAt: '2026-11-27T20:00:00Z', context: 'session' }, meta: { requestId: '00000000-0000-4000-8000-000000000001', generatedAt: '2026-11-27T10:00:00Z' } }))).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }))); vi.stubGlobal('fetch', fetcher);
    await adminRequest('/business/claims', z.object({ ok: z.literal(true) }), { method: 'POST', body: '{"consent":true}' });
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/v1/auth/csrf');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{}', cache: 'no-store' });
    expect(new Headers(fetcher.mock.calls[1]?.[1].headers).get('X-CSRF-Token')).toBe('a'.repeat(43));
  });
});
