import { test, expect } from '@playwright/test';
import { CategoriesResponseSchema, CitiesResponseSchema, PlacesResponseSchema, PlaceResponseSchema, RouteResponseSchema, distanceBetween } from '@ryadom/types';
import { endpoint, genuineNearby } from '../support/live';
import { preflight } from '../support/preflight';

test.beforeAll(() => preflight(['API_URL']));

test('live catalog categories conform to the accepted taxonomy', async ({ request }) => {
  const response = await request.get(endpoint('/categories'));
  expect(response.status()).toBe(200);
  expect(CategoriesResponseSchema.parse(await response.json()).data).toHaveLength(14);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('live API boundary rejects unknown and repeated fields without reflecting supplied data', async ({ request }) => {
  for (const query of ['city=smolensk&lon=32&lat=54&radius=10001', 'city=smolensk&lon=32&lat=54&lat=55', 'city=smolensk&lon=32&lat=54&providerUrl=QA_SECRET_MARKER_14']) {
    const response = await request.get(endpoint(`/places/near?${query}`));
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(body)).not.toContain('QA_SECRET_MARKER_14');
    expect(JSON.stringify(body)).not.toMatch(/postgres(?:ql)?:\/\/|Error:\s*at |SELECT\s+.+\s+FROM/i);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
  }
});

test('live city catalog smoke without geocoder dependency has real cafes and detail provenance', async ({ request }, info) => {
  const citiesHttp = await request.get(endpoint('/cities'));
  expect(citiesHttp.status()).toBe(200);
  const city = CitiesResponseSchema.parse(await citiesHttp.json()).data.find(city => city.id === 'smolensk' && city.enabled);
  expect(city).toBeDefined();
  const nearbyHttp = await request.get(endpoint('/places/near'), { params: { city: city!.id, ...city!.center, radius: 10000, category: 'cafe', limit: 20 } });
  expect(nearbyHttp.status()).toBe(200);
  const nearby = PlacesResponseSchema.parse(await nearbyHttp.json()).data;
  await info.attach('live-city-nearby', { body: await nearbyHttp.body(), contentType: 'application/json' });
  expect(nearby.items.length, 'Real imported catalog required; independent of unavailable geocoder').toBeGreaterThan(0);
  for (const [index, place] of nearby.items.entries()) {
    expect(place.categoryIds).toContain('cafe');
    expect(place.distanceMeters).toBeLessThanOrEqual(10000);
    if (index > 0) expect(place.distanceMeters).toBeGreaterThanOrEqual(nearby.items[index - 1]!.distanceMeters);
    for (const source of place.provenance) {
      expect(source.sourceId).not.toMatch(/demo|fixture|synthetic/i);
      expect(source.license.length).toBeGreaterThan(0);
    }
  }
  const detailHttp = await request.get(endpoint(`/places/${nearby.items[0]!.slug}`));
  expect(detailHttp.status()).toBe(200);
  expect(PlaceResponseSchema.parse(await detailHttp.json()).data.id).toBe(nearby.items[0]!.id);
});

test('live router smoke between genuine DB places in all modes (separate from address acceptance)', async ({ request }, info) => {
  const citiesHttp = await request.get(endpoint('/cities'));
  expect(citiesHttp.status()).toBe(200);
  const city = CitiesResponseSchema.parse(await citiesHttp.json()).data.find(c => c.id === 'smolensk' && c.enabled)!;
  expect(city).toBeDefined();
  const catalogHttp = await request.get(endpoint('/places/near'), { params: { city: city.id, ...city.center, radius: 10000, category: 'cafe', limit: 20 } });
  expect(catalogHttp.status()).toBe(200);
  const places = PlacesResponseSchema.parse(await catalogHttp.json()).data.items;
  const origin = places[0];
  expect(origin).toBeDefined();
  const destination = places.find(p => distanceBetween(origin!.coordinates, p.coordinates) > 200);
  expect(destination, 'Distinct genuine catalog endpoints needed').toBeDefined();
  for (const mode of ['walking', 'cycling', 'driving'] as const) {
    const response = await request.post(endpoint('/routes'), { data: { origin: origin!.coordinates, destination: destination!.coordinates, mode } });
    await info.attach(`live-db-route-${mode}`, { body: await response.body(), contentType: 'application/json' });
    expect(response.status(), `Real Valhalla ${mode} response required`).toBe(200);
    const route = RouteResponseSchema.parse(await response.json()).data;
    expect(route.mode).toBe(mode);
    expect(route.distanceMeters).toBeGreaterThan(0);
    expect(route.durationSeconds).toBeGreaterThan(0);
    expect(route.geometry.coordinates.length).toBeGreaterThan(2);
  }
});

test('live address → genuine nearby cafes → detail provenance', async ({ request }, info) => {
  const { selected, nearby } = await genuineNearby(request, info);
  for (const [i, place] of nearby.items.entries()) {
    expect(place.categoryIds).toContain('cafe');
    expect(place.provenance.length).toBeGreaterThan(0);
    expect(place.distanceMeters).toBeLessThanOrEqual(1500);
    expect(Math.abs(distanceBetween(selected.coordinates, place.coordinates) - place.distanceMeters)).toBeLessThan(15);
    if (i > 0) expect(place.distanceMeters).toBeGreaterThanOrEqual(nearby.items[i - 1]!.distanceMeters);
    for (const provenance of place.provenance) {
      expect(provenance.license.trim().length).toBeGreaterThan(0);
      expect(provenance.sourceRecordId.trim().length).toBeGreaterThan(0);
    }
  }
  const first = nearby.items[0]!;
  const detail = await request.get(endpoint(`/places/${first.slug}`));
  expect(detail.status()).toBe(200);
  expect(PlaceResponseSchema.parse(await detail.json()).data.id).toBe(first.id);
});

test('live real Valhalla route completes acceptance (provider absence fails)', async ({ request }, info) => {
  const { selected, nearby } = await genuineNearby(request, info);
  const destination = nearby.items.find(p => p.distanceMeters > 50);
  expect(destination, 'A distinct destination is required').toBeDefined();
  const response = await request.post(endpoint('/routes'), { data: { origin: selected.coordinates, destination: destination!.coordinates, mode: 'walking' } });
  await info.attach('live-route-response', { body: await response.body(), contentType: 'application/json' });
  expect(response.status(), 'Unavailable router is BLOCKED acceptance, never a passing route').toBe(200);
  const route = RouteResponseSchema.parse(await response.json()).data;
  expect(route.distanceMeters).toBeGreaterThan(0);
  expect(route.durationSeconds).toBeGreaterThan(0);
  expect(route.maneuvers.length, 'Validated real provider maneuvers required').toBeGreaterThan(0);
  const start = route.geometry.coordinates[0]!, end = route.geometry.coordinates.at(-1)!;
  expect(distanceBetween(selected.coordinates, { lon: start[0], lat: start[1] })).toBeLessThan(200);
  expect(distanceBetween(destination!.coordinates, { lon: end[0], lat: end[1] })).toBeLessThan(200);
});


