import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { NominatimGeocoder, ValhallaRouter } from '@ryadom/gis';
import { CitiesResponseSchema, PlacesResponseSchema, StatsResponseSchema, PlatformReviewsResponseSchema, ApiErrorSchema } from '@ryadom/types';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createCatalog } from '../src/repository.js';
import { RedisRateLimiter } from '../src/rate-limit.js';

async function smoke() {
  // Read only the two runtime credentials. Never print or pass bootstrap credentials to API.
  const root = resolve(__dirname, '../../..');
  const local = parseEnv(readFileSync(resolve(root, process.env.API_SMOKE_ENV_FILE ?? 'infra/.env.local'), 'utf8'));
  const config = loadConfig({ ...process.env, APP_DATABASE_URL: process.env.APP_DATABASE_URL ?? local.APP_DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL ?? local.REDIS_URL, CORS_ORIGINS: 'http://localhost:3000' });
  const catalog = createCatalog(config.databaseUrl);
  if (!catalog) throw new Error('Runtime DB missing');
  const limiter = new RedisRateLimiter(config); await limiter.connect();
  const app = await createApp({ config, catalog, limiter, geocoder: new NominatimGeocoder(config.geocoder), router: new ValhallaRouter(config.router) });
  try {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    const url = `http://127.0.0.1:${address.port}`;
    async function check(path: string, status: number, init?: RequestInit) {
      const response = await fetch(url + path, init);
      const body: unknown = await response.json();
      if (response.status !== status) throw new Error(`Smoke status mismatch for ${path.split('?')[0]} (${response.status})`);
      if (status >= 400) ApiErrorSchema.parse(body);
      console.info(`PASS ${init?.method ?? 'GET'} ${path.split('?')[0]} ${status}`);
      return body;
    }
    await check('/health/live', 200); await check('/health/ready', 200);
    const cities = CitiesResponseSchema.parse(await check('/api/v1/cities', 200)).data;
    await check('/api/v1/categories', 200);
    const first = cities[0];
    if (!first) throw new Error('No verified city: DB seed required');
    const params = new URLSearchParams({ city: first.id, lon: String(first.center.lon), lat: String(first.center.lat), radius: '10000', limit: '50' });
    const places = PlacesResponseSchema.parse(await check(`/api/v1/places/near?${params}`, 200)).data;
    console.info(`Observed verified cities=${cities.length}, matching places=${places.pagination.total}`);
    PlacesResponseSchema.parse(await check(`/api/v1/places/near?${params}&q=${encodeURIComponent("x' OR 1=1; SELECT pg_sleep(2)--")}`, 200));
    StatsResponseSchema.parse(await check('/api/v1/stats?city=' + first.id, 200));
    PlatformReviewsResponseSchema.parse(await check('/api/v1/platform-reviews', 200));
    await check('/api/v1/places/nonexistent-smoke-check-place', 404);
    await check('/api/v1/reports', 404, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
      body: JSON.stringify({ placeId: '00000000-0000-4000-8000-000000000000', reason: 'other', description: 'Nonexistent place smoke check', consent: true }) });
    await check('/api/v1/map/config', 200);
    console.info('PASS DB/Redis-backed HTTP smoke. No organizations/reviews/reports inserted.');
  } finally { await app.close(); await catalog.close(); await limiter.close(); }
}
void smoke().catch(() => { console.error('FAIL DB/Redis-backed smoke; inspect service readiness and migrations. No credentials logged.'); process.exitCode = 1; });
