import { expect, type APIRequestContext } from '@playwright/test';
import { CitiesResponseSchema, PlacesResponseSchema } from '@ryadom/types';

/** Genuine SSR fixture discovery through the preview proxy; no writes or reference-coordinate substitution. */
export async function catalogPlace(request: APIRequestContext) {
  const citiesHttp = await request.get('/api/v1/cities');
  expect(citiesHttp.status(), 'Real catalog discovery must be available').toBe(200);
  const city = CitiesResponseSchema.parse(await citiesHttp.json()).data.find(c => c.id === 'smolensk' && c.enabled);
  expect(city).toBeDefined();
  const response = await request.get('/api/v1/places/near', { params: { city: city!.id, ...city!.center, radius: 10000, category: 'cafe' } });
  expect(response.status()).toBe(200);
  const place = PlacesResponseSchema.parse(await response.json()).data.items[0];
  expect(place, 'Imported genuine cafe needed for SSR detail checks').toBeDefined();
  return place!;
}
