import { describe, expect, it } from 'vitest';
import { attachBusinessPhoto, catalogCities } from './business';
import type { MediaAsset, CmsAsset } from '@ryadom/accounts-types';
const id = '00000000-0000-4000-8000-000000000001'; const at = '2026-11-27T00:00:00Z';
const media: MediaAsset = { id, purpose: 'business-photo', state: 'ready', url: `/media/${id}.webp`, mime: 'image/webp', width: 300, height: 200, byteLength: 1200, sha256: 'a'.repeat(64), attribution: 'Actual rights holder', license: 'Operator verified permission', createdAt: at };
describe('business media selection boundary', () => {
  it('allows only ready business photos and requires an explicit descriptive alt before save', () => {
    const selected = attachBusinessPhoto([], media); expect(selected).toEqual([{ source: 'uploaded', mediaId: id, url: media.url, alt: '' }]);
    expect(() => attachBusinessPhoto([], { ...media, purpose: 'content-image' })).toThrow();
    expect(() => attachBusinessPhoto([], { ...media, purpose: 'logo' })).toThrow();
    expect(() => attachBusinessPhoto([], { ...media, state: 'archived' })).toThrow();
    expect(() => attachBusinessPhoto([], { ...media, url: '/admin-illustrations/cafe-v1.png' } as MediaAsset)).toThrow();
  });
  it('preserves existing photo data, rejects duplicates and caps the card at20', () => {
    const existing: CmsAsset = { source: 'uploaded', mediaId: id, url: media.url, alt: 'Actual exterior with rights' };
    expect(() => attachBusinessPhoto([existing], media)).toThrow('уже');
    const twenty = Array.from({ length: 20 }, (_, i): CmsAsset => { const next = `00000000-0000-4000-8000-${String(i + 10).padStart(12, '0')}`; return { ...existing, mediaId: next, url: `/media/${next}.webp` }; });
    expect(() => attachBusinessPhoto(twenty, media)).toThrow('20');
    const newPhoto = { ...media, id: '00000000-0000-4000-8000-000000000002', url: '/media/00000000-0000-4000-8000-000000000002.webp' as const };
    expect(attachBusinessPhoto([existing], newPhoto)[0]).toEqual(existing);
  });
});
describe('actual city directory', () => {
  const city = { id: 'fixture-city', name: 'Fixture City', region: 'Fixture Region', countryCode: 'RU', center: { lon: 32, lat: 54 }, bounds: [31, 53, 33, 55], timezone: 'Europe/Moscow', enabled: true };
  it('uses actual enabled cities and never fills an empty provider with a fictitious city', () => {
    const wrap = (data: unknown[]) => ({ data, meta: { requestId: id, generatedAt: at } });
    expect(catalogCities(wrap([]))).toEqual({ cities: [], regions: [] });
    const result = catalogCities(wrap([city, { ...city, id: 'disabled-city', enabled: false }]));
    expect(result.cities.map(c => c.id)).toEqual(['fixture-city']); expect(result.regions).toEqual(['Fixture Region']);
    expect(() => catalogCities(wrap([{ ...city, id: 'bad city' }]))).toThrow();
  });
});
