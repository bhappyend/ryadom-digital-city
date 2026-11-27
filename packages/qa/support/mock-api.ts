import { randomUUID } from 'node:crypto';
import { CATEGORIES } from '@ryadom/types';
import type { Page } from '@playwright/test';

// Only browser interception inside mocked-ui. Never seeded/imported/published.
export const fixturePoint = { lon: 32.049985, lat: 54.7823535 };
export const fixtureCity = { id: 'smolensk', name: 'Смоленск', region: 'Смоленская область', countryCode: 'RU', center: fixturePoint, bounds: [31.9, 54.6, 32.3, 54.9], timezone: 'Europe/Moscow', enabled: true };
export const fixturePlace = {
  id: '10000000-0000-4000-8000-000000000014', slug: 'qa-only-cafe', name: 'QA ONLY — тестовое место',
  cityId: 'smolensk', categoryIds: ['cafe'], address: 'QA ONLY — тестовый адрес',
  coordinates: { lon: 32.051, lat: 54.783 }, description: null, phone: null, website: null,
  openingState: 'unknown', openingHours: null, hoursVerifiedAt: null, accessibility: 'unknown',
  rating: null, photos: [], updatedAt: '2026-11-27T00:00:00Z',
  provenance: [{ sourceId: 'qa-isolated-fixture', sourceRecordId: 'qa-14', sourceUrl: null, license: 'TEST FIXTURE ONLY', attribution: 'Isolated Playwright context', sourceUpdatedAt: null, importedAt: '2026-11-27T00:00:00Z' }]
};
export function envelope(data: unknown) { return { data, meta: { requestId: randomUUID(), generatedAt: new Date().toISOString() } }; }
export function unavailable(provider: string) {
  return { error: { code: 'PROVIDER_UNAVAILABLE', message: 'QA controlled provider outage', provider: { status: 'unavailable', provider, reason: 'not_configured', message: 'QA controlled outage' } }, meta: envelope(null).meta };
}
export const emptyPage = { items: [], pagination: { page: 1, limit: 20, total: 0, hasMore: false } };
export const unavailableMap = { status: 'unavailable', provider: 'map', reason: 'not_configured', message: 'QA controlled map unavailable' };

export async function mockMapApi(page: Page, options: { catalog?: 'empty' | 'failure' | 'one'; geocode?: 'empty' | 'failure' | 'one'; router?: 'failure'; reports?: 'failure' } = {}) {
  const unexpected: string[] = [];
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const ok = async (data: unknown) => route.fulfill({ status: 200, json: envelope(data) });
    const fail = async (provider: string) => route.fulfill({ status: 503, json: unavailable(provider) });
    if (path === '/cities') return ok([fixtureCity]);
    if (path === '/categories') return ok(CATEGORIES);
    if (path === '/map/config') return ok(unavailableMap);
    if (path === '/geocode') {
      if (options.geocode === 'failure') return fail('geocoder');
      return ok({ items: options.geocode === 'empty' ? [] : [{ id: 'qa-address', label: 'QA ONLY — выбранный адрес', coordinates: fixturePoint, bounds: null, provenance: fixturePlace.provenance[0] }], provider: 'nominatim', attribution: 'Isolated QA fixture' });
    }
    if (path === '/places/near') {
      if (options.catalog === 'failure') return fail('catalog');
      return ok(options.catalog === 'one' ? { items: [{ ...fixturePlace, distanceMeters: 100 }], pagination: { page: 1, limit: 20, total: 1, hasMore: false } } : emptyPage);
    }
    if (path === '/routes' && options.router === 'failure') return fail('router');
    if (path === '/reports' && options.reports === 'failure') return fail('reports');
    if (path === `/places/${fixturePlace.slug}`) return ok(fixturePlace);
    unexpected.push(`${route.request().method()} ${path}`);
    return route.fulfill({ status: 500, json: { error: 'QA unexpected request' } });
  });
  return unexpected;
}
