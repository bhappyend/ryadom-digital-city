import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as c from './index';

const query = { city: 'smolensk', lon: '32', lat: '54' };
const point = { lon: 32, lat: 54 };
const meta = { requestId: '00000000-0000-4000-8000-000000000001', generatedAt: '2026-11-27T00:00:00Z' };
describe('public boundary inputs', () => {
  it('parses explicit false and applies bounded defaults', () => {
    expect(c.PlacesQueryInputSchema.parse({ ...query, openNow: 'false' })).toEqual({ city: 'smolensk', lon: 32, lat: 54, openNow: false, page: 1, limit: 20, radius: 1500 });
  });
  it.each([
    { lon: '' }, { lat: 'Infinity' }, { lon: '181' }, { lat: '-91' }, { radius: '299' }, { radius: '10001' },
    { radius: '300.5' }, { limit: '51' }, { page: '0' }, { page: '101' }, { limit: ['20', '50'] },
    { openNow: '1' }, { openNow: 'TRUE' }, { openNow: false }, { q: 'x' }, { q: ' '.repeat(201) },
    { category: 'invented' }, { rating: '5.01' }, { rating: '-1' }, { unknown: 'ignored?' }, { city: { $ne: '' } }, { lon: '0x20' }
  ])('rejects malformed, excessive or ambiguous query %j', delta => {
    expect(c.PlacesQueryInputSchema.safeParse({ ...query, ...delta }).success).toBe(false);
  });
  it('requires city and both coordinates, handles valid boundaries', () => {
    expect(c.PlacesQueryInputSchema.safeParse({ city: 'smolensk' }).success).toBe(false);
    expect(c.PlacesQueryInputSchema.parse({ ...query, radius: '300', limit: '50', page: '100', openNow: 'true' }).radius).toBe(300);
  });
  it('rejects geocoder injection shapes and oversized text', () => {
    for (const bad of [{ q: 'ab', city: 'smolensk' }, { q: 'x'.repeat(201), city: 'smolensk' }, { q: 'address', city: 'smolensk', url: 'https://attacker.invalid' }]) expect(c.GeocodeQuerySchema.safeParse(bad).success).toBe(false);
  });
  it('rejects executable, credentialed and non-HTTP URLs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'https://user:secret@example.org', '//example.org']) expect(c.HttpUrlSchema.safeParse(url).success).toBe(false);
    expect(c.HttpUrlSchema.parse('https://example.org/')).toBe('https://example.org/');
  });
  it('validates strict coordinate ranges and non-crossing bounds', () => {
    for (const v of [{ lon: NaN, lat: 0 }, { lon: Infinity, lat: 0 }, { lng: 32, lat: 54 }, { ...point, altitude: 1 }]) expect(c.CoordinatesSchema.safeParse(v).success).toBe(false);
    expect(c.BoundingBoxSchema.safeParse([33, 54, 32, 55]).success).toBe(false);
  });
});
describe('routing and provider honesty', () => {
  it('enforces route span and known modes, with antimeridian correctness', () => {
    expect(c.RouteRequestSchema.safeParse({ origin: point, destination: { lon: 37, lat: 55 }, mode: 'walking' }).success).toBe(false);
    expect(c.RouteRequestSchema.safeParse({ origin: point, destination: point, mode: 'transit' }).success).toBe(false);
    expect(c.RouteRequestSchema.safeParse({ origin: { lon: 179.99, lat: 0 }, destination: { lon: -179.99, lat: 0 }, mode: 'cycling' }).success).toBe(true);
  });
  it('rejects fabricated unavailable success route and dangling maneuver indices', () => {
    expect(c.RouteResultSchema.safeParse({ provider: 'valhalla', geometry: null, maneuvers: [], distanceMeters: 0, durationSeconds: 0 }).success).toBe(false);
    const route = { provider: 'valhalla', mode: 'walking', geometry: { type: 'LineString', coordinates: [[32, 54], [32.001, 54.001]] }, maneuvers: [{ instruction: 'Test fixture only', type: 'start', location: point, beginShapeIndex: 0, endShapeIndex: 2, distanceMeters: 1, durationSeconds: 1 }], distanceMeters: 1, durationSeconds: 1, attribution: 'Test fixture only' };
    expect(c.RouteResultSchema.safeParse(route).success).toBe(false);
    route.maneuvers[0]!.endShapeIndex = 1;
    expect(c.RouteResultSchema.safeParse(route).success).toBe(true);
  });
  it('requires explicit provider unavailable details', () => {
    expect(c.ApiErrorSchema.safeParse({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Unavailable' }, meta }).success).toBe(false);
    expect(c.ApiErrorSchema.safeParse({ error: { code: 'PROVIDER_UNAVAILABLE', message: 'Unavailable', provider: { status: 'unavailable', provider: 'router', reason: 'not_configured', message: 'Not configured' } }, meta }).success).toBe(true);
    expect(c.MapConfigSchema.safeParse({ status: 'unavailable', provider: 'map', reason: 'disabled', message: 'Disabled' }).success).toBe(true);
    expect(c.MapConfigSchema.safeParse({ status: 'available', provider: 'map', styleUrl: 'https://example.org/style.json', attribution: 'Example', minZoom: 20, maxZoom: 2 }).success).toBe(false);
  });
});
describe('data integrity and report abuse limits', () => {
  it('does not accept unknown fields, arbitrary targets, absent consent or unbounded reports', () => {
    const report = { placeId: meta.requestId, reason: 'other', description: 'Test fixture report only', consent: true };
    expect(c.ReportRequestSchema.safeParse(report).success).toBe(true);
    for (const delta of [{ consent: false }, { placeId: 'slug' }, { description: 'short' }, { description: 'x'.repeat(2001) }, { targetUrl: 'http://localhost' }, { email: 'unused@example.org' }]) expect(c.ReportRequestSchema.safeParse({ ...report, ...delta }).success).toBe(false);
  });
  it('requires provenance and verified hours, and allows honest empty responses', () => {
    const place = { id: meta.requestId, slug: 'test-fixture', name: 'Test fixture only', cityId: 'smolensk', categoryIds: ['cafe'], address: 'Test fixture only', coordinates: point, description: null, phone: null, website: null, openingState: 'unknown', openingHours: null, hoursVerifiedAt: null, accessibility: 'unknown', rating: null, photos: [], provenance: [{ sourceId: 'test', sourceRecordId: 'test', sourceUrl: null, license: 'test', attribution: 'test', sourceUpdatedAt: null, importedAt: meta.generatedAt }], updatedAt: meta.generatedAt };
    expect(c.PlaceSchema.safeParse(place).success).toBe(true);
    expect(c.PlaceSchema.safeParse({ ...place, provenance: [] }).success).toBe(false);
    expect(c.PlaceSchema.safeParse({ ...place, openingState: 'open' }).success).toBe(false);
    expect(c.NearbyPlaceSchema.safeParse({ ...place, distanceMeters: -1 }).success).toBe(false);
    expect(c.PlacesResponseSchema.safeParse({ data: { items: [], pagination: { page: 1, limit: 20, total: 0, hasMore: false } }, meta }).success).toBe(true);
    expect(c.StatsResponseSchema.safeParse({ data: { cityId: null, measuredAt: meta.generatedAt, metrics: [] }, meta }).success).toBe(true);
  });
  it('maps exactly fourteen unique categories to supplied assets', () => {
    expect(new Set(c.CATEGORIES.map(v => v.id)).size).toBe(14);
    const root = resolve(__dirname, '../../../ryadom-digital-city');
    for (const category of c.CATEGORIES) for (const path of [category.icon, category.marker]) expect(existsSync(`${root}${path}`)).toBe(true);
  });
  it('OpenAPI covers public operations and bounded scalar inputs', () => {
    const doc = JSON.parse(readFileSync(resolve(__dirname, '../../../docs/openapi.yaml'), 'utf8'));
    expect(Object.keys(doc.paths)).toHaveLength(10);
    expect(doc.paths['/places/near'].get.parameters.find((p: { name: string }) => p.name === 'radius').schema.maximum).toBe(10_000);
    expect(doc.paths['/places/near'].get.parameters.find((p: { name: string }) => p.name === 'radius').required).toBe(false);
    expect(doc.paths['/places/near'].get.parameters.find((p: { name: string }) => p.name === 'lon').required).toBe(true);
    expect(doc.components.schemas.RouteResult.properties.geometry.properties.coordinates.maxItems).toBe(20_000);
    expect(doc.components.schemas.ReportRequest.additionalProperties).toBe(false);
  });
});
