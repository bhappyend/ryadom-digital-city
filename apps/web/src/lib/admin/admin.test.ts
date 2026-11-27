import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { createDemoOwners, maskDemoPhone, remainingMoscowDays, DEMO_NOTICE } from '../../../../../packages/admin-demo/owners';
import showcase from '../../../../../packages/admin-demo/showcase35.json';
import { adminRequest, AdminError } from './api';
import { ownerPeriod } from './subscription';
import { OwnerCrmSchema } from '@ryadom/accounts-types';
const id = '00000000-0000-4000-8000-000000000001';
const now = '2026-11-27T12:00:00Z';
describe('isolated admin demonstration', () => {
  it('contains exactly 35 explicitly synthetic, nonroutable owners and no entitlement', () => {
    const owners = createDemoOwners(); expect(owners).toHaveLength(35); expect(new Set(owners.map(v => v.id)).size).toBe(35);
    for (const o of owners) { expect(o.dataScope).toBe('demo'); expect(o.productionEntitlement).toBe(false); expect(o.displayName).toContain('демо'); expect(o.remainingDays).toBeGreaterThanOrEqual(22); expect(o.remainingDays).toBeLessThanOrEqual(30); expect(o.phone).toMatch(/^\+7 \(9XX\) XXX-XX-\d{2}$/); expect(maskDemoPhone(o.phone)).toBe('+7 (9XX) XXX-XX-••'); }
    expect(DEMO_NOTICE).toContain('Не реальные клиенты и оплаты');
  });
  it('does not share mutable state between demo sessions', () => { const one = createDemoOwners(); one[0]!.displayName = 'Changed locally'; expect(createDemoOwners()[0]!.displayName).not.toBe('Changed locally'); });
  it('preserves 35 actual source records independently of synthetic owners', () => { expect(showcase.records).toHaveLength(35); for (const b of showcase.records) { expect(b.paymentStatus).toBe('not_asserted'); expect(b.provenance[0]?.license).toBe('ODbL-1.0'); expect(b.photos).toHaveLength(0); expect(b.rating).toBeNull(); } });
});
describe('server snapshot subscription display', () => {
  it('counts calendar boundaries in agreed timezone and clamps ended periods', () => { expect(remainingMoscowDays('2026-11-28T00:10:00+03:00', '2026-11-27T23:50:00+03:00')).toBe(1); expect(remainingMoscowDays('2026-11-28T00:10:00+03:00', '2026-11-27T23:50:00+03:00', 'UTC')).toBe(0); expect(remainingMoscowDays('2026-11-26T00:00:00Z', now)).toBe(0); expect(remainingMoscowDays(null, now)).toBeNull(); expect(remainingMoscowDays('invalid', now)).toBeNull(); expect(remainingMoscowDays(now, now, 'invalid')).toBeNull(); });
  it('never infers a paid period from a CRM entry', () => {
    const o = OwnerCrmSchema.parse({ id, version: 1, dataScope: 'production', displayName: 'Actual CRM entry', accountId: null, phone: { visibility: 'hidden', hasValue: false }, notes: null, updatedAt: now, manualBilling: { mode: 'founder-agreement', renewal: 'operator-confirmed-monthly', providerRequired: false, contacts: [{ channel: 'vk', url: 'https://vk.ru/desktopcoder' }, { channel: 'telegram', url: 'https://t.me/desktopcoder' }] }, fundedSubscriptionSummary: null });
    expect(ownerPeriod(o).label).toContain('не подтверждён'); expect(ownerPeriod(createDemoOwners()[0] as never).label).toContain('не подтверждён');
  });
});
describe('private admin transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('requires fresh CSRF, same-origin credentials, no-store and no automatic mutation retry', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { token: 'A'.repeat(43), expiresAt: now, context: 'session' }, meta: { requestId: id, generatedAt: now } }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: { ok: true } })));
    vi.stubGlobal('fetch', fetcher);
    const r = await adminRequest('/admin/test', z.object({ data: z.object({ ok: z.boolean() }) }), { method: 'POST', body: '{}' }); expect(r.data.ok).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
    const options = fetcher.mock.calls[1]![1] as RequestInit; expect(options.credentials).toBe('same-origin'); expect(options.cache).toBe('no-store'); expect(new Headers(options.headers).get('X-CSRF-Token')).toBe('A'.repeat(43));
  });
  it('rejects unsafe paths before any network access', async () => { const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); for (const path of ['https://evil.invalid', '//evil', '/admin/../auth/me', '/admin/test#x']) await expect(adminRequest(path, z.unknown())).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled(); });
  it('reports 409 without echoing server text or retrying', async () => { const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'CONFLICT', message: 'secret personal payload' }, meta: { requestId: id } }), { status: 409 })); vi.stubGlobal('fetch', fetcher); await expect(adminRequest('/admin/test', z.unknown())).rejects.toBeInstanceOf(AdminError); expect(fetcher).toHaveBeenCalledTimes(1); });
});
