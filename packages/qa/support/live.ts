import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { GeocodeResponseSchema, PlacesResponseSchema } from '@ryadom/types';

export const acceptanceAddress = process.env.QA_ADDRESS ?? 'Смоленск ул.Ленина8';
export function endpoint(path: string) { return `${process.env.API_URL}/api/v1${path}`; }

export async function genuineNearby(request: APIRequestContext, info: TestInfo) {
  const geocodeResponse = await request.get(endpoint('/geocode'), { params: { city: 'smolensk', q: acceptanceAddress } });
  await info.attach('live-geocode-response', { body: await geocodeResponse.body(), contentType: 'application/json' });
  expect(geocodeResponse.status(), 'Real geocoder must answer; unavailable is an acceptance blocker').toBe(200);
  const geocode = GeocodeResponseSchema.parse(await geocodeResponse.json());
  expect(geocode.data.items.length, 'Existing acceptance address must resolve').toBeGreaterThan(0);
  // Known address is only an assertion; all subsequent coordinates come from the provider.
  const selected = geocode.data.items.find(item => Math.abs(item.coordinates.lat - 54.7823535) < 0.005 && Math.abs(item.coordinates.lon - 32.049985) < 0.005);
  expect(selected, 'Provider must resolve the requested street/building, not an unrelated city result').toBeDefined();
  if (!selected) throw new Error('Acceptance address not found');
  const response = await request.get(endpoint('/places/near'), { params: { city: 'smolensk', ...selected.coordinates, radius: 1500, category: 'cafe', limit: 20 } });
  await info.attach('live-nearby-response', { body: await response.body(), contentType: 'application/json' });
  expect(response.status(), 'Real catalog is required').toBe(200);
  const nearby = PlacesResponseSchema.parse(await response.json());
  expect(nearby.data.items.length, 'Imported genuine cafe catalog required for acceptance').toBeGreaterThan(0);
  return { selected, nearby: nearby.data };
}
