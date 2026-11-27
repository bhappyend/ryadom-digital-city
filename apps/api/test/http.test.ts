import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { request as httpRequest } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NominatimGeocoder, ValhallaRouter, ProviderUnavailable } from '@ryadom/gis';
import { ApiErrorSchema, CategoriesResponseSchema, PlacesResponseSchema, ReportResponseSchema, type City } from '@ryadom/types';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import type { Catalog, Dependencies } from '../src/dependencies.js';
import { bounded, RedisRateLimiter } from '../src/rate-limit.js';

const origin = 'http://localhost:3000';
const near = '/api/v1/places/near?city=smolensk&lon=32&lat=54';
const route = { origin: { lon: 32, lat: 54 }, destination: { lon: 32.01, lat: 54.01 }, mode: 'walking' };
const report = { placeId: '11111111-1111-4111-8111-111111111111', reason: 'other', description: 'Transport test correction only', consent: true };
// Synthetic transport fixtures only; never loaded into the runtime catalog.
const city: City = { id: 'smolensk', name: 'Test city', region: 'Test region', countryCode: 'RU', center: { lon: 32, lat: 54 }, bounds: [31, 53, 33, 55], timezone: 'Europe/Moscow', enabled: true };
const apps: NestExpressApplication[] = [];
function catalog(overrides: Partial<Catalog> = {}): Catalog {
  return {
    cities: async () => [], city: async () => city, nearby: async q => ({ items: [], pagination: { page: q.page, limit: q.limit, total: 0, hasMore: false } }),
    place: async () => null, stats: async () => ({ cityId: null, measuredAt: new Date().toISOString(), metrics: [] }),
    reviews: async q => ({ items: [], pagination: { ...q, total: 0, hasMore: false } }), report: async () => null,
    ready: async () => true, close: async () => {}, ...overrides,
  };
}
async function setup(overrides: Partial<Dependencies> = {}, env: NodeJS.ProcessEnv = {}) {
  const config = loadConfig({ CORS_ORIGINS: origin, ...env });
  const deps: Dependencies = { config, catalog: catalog(),
    limiter: { consume: async () => {}, ready: async () => true, close: async () => {} },
    geocoder: new NominatimGeocoder(config.geocoder), router: new ValhallaRouter(config.router), ...overrides };
  const app = await createApp(deps); apps.push(app);
  await app.listen(0, '127.0.0.1');
  return request(app.getHttpServer());
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('Nest HTTP contract and failure boundaries', () => {
  it('returns categories and unique server metadata with security headers', async () => {
    const client = await setup();
    const first = await client.get('/api/v1/categories').set('X-Request-Id', 'attacker').expect(200);
    const second = await client.get('/api/v1/categories').expect(200);
    expect(CategoriesResponseSchema.safeParse(first.body).success).toBe(true);
    expect(first.body.meta.requestId).not.toBe(second.body.meta.requestId);
    expect(first.headers['x-request-id']).toBe(first.body.meta.requestId);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.headers['content-security-policy']).toContain("default-src 'none'");
    expect(first.headers['x-content-type-options']).toBe('nosniff');
    expect(first.headers['x-powered-by']).toBeUndefined();
  });
  it.each([
    '&lat=55', '&radius=0', '&radius=10001', '&radius=300.5', '&openNow=1', '&openNow=False', '&openNow=',
    '&page=101', '&limit=51', '&unknown=1', '&category[]=cafe', '&__proto__=x', '&rating=NaN', '&q=address%00', '&q=address%0d%0a',
  ])('rejects strict/duplicate query %s', async suffix => {
    const res = await (await setup()).get(near + suffix).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(ApiErrorSchema.safeParse(res.body).success).toBe(true);
  });
  it.each(['NaN', 'Infinity', '91', '', '1e1', '0x10'])('rejects invalid latitude %s', async lat => {
    await (await setup()).get(`/api/v1/places/near?city=smolensk&lon=32&lat=${lat}`).expect(400);
  });
  it('preserves false and literal injection text without bypassing filters', async () => {
    let seen: unknown;
    const client = await setup({ catalog: catalog({ nearby: async q => {
      seen = q; return { items: [], pagination: { page: q.page, limit: q.limit, total: 0, hasMore: false } };
    } }) });
    const text = "%' OR 1=1; DROP TABLE places; --";
    const response = await client.get(near).query({ openNow: 'false', q: text }).expect(200);
    expect(seen).toMatchObject({ openNow: false, q: text, radius: 1500, limit: 20, page: 1 });
    expect(PlacesResponseSchema.safeParse(response.body).success).toBe(true);
  });
  it('returns explicit unavailable without DB and differentiates liveness/readiness', async () => {
    const client = await setup({ catalog: undefined });
    for (const path of ['/api/v1/cities', near, '/api/v1/stats', '/api/v1/platform-reviews']) {
      const res = await client.get(path).expect(503);
      expect(res.body.error.provider).toMatchObject({ provider: 'catalog', reason: 'not_configured' });
    }
    await client.get('/health/live').expect(200);
    await client.get('/health').expect(200);
    await client.get('/health/ready').expect(503);
    await client.get('/api/v1/map/config').expect(200).expect(r => expect(r.body.data.status).toBe('unavailable'));
  });
  it('returns empty DB-backed pages and unknown slug 404', async () => {
    const client = await setup();
    await client.get(near).expect(200).expect(r => expect(r.body.data.items).toEqual([]));
    await client.get('/api/v1/platform-reviews').expect(200).expect(r => expect(r.body.data.items).toEqual([]));
    await client.get('/api/v1/places/unknown-place').expect(404);
    await client.get('/api/v1/unknown').expect(404).expect(r => expect(ApiErrorSchema.safeParse(r.body).success).toBe(true));
  });
  it('maps SQL failure and malformed repository output to safe catalog errors', async () => {
    let client = await setup({ catalog: catalog({ nearby: async () => { throw new Error('postgres://user:secret@host SQL SELECT lon=32'); } }) });
    const failed = await client.get(near).expect(503);
    expect(JSON.stringify(failed.body)).not.toMatch(/secret|postgres|SELECT|lon=32/);
    client = await setup({ catalog: catalog({ nearby: async () => ({ items: [], pagination: { page: 1, limit: 20, total: -1, hasMore: false } }) }) });
    await client.get(near).expect(503);
  });
  it('returns provider state, not fabricated geocode or route geometry', async () => {
    const client = await setup();
    await client.get('/api/v1/geocode?city=smolensk&q=test-address').expect(503).expect(r => expect(r.body.error.provider).toMatchObject({ provider: 'geocoder', reason: 'not_configured' }));
    await client.post('/api/v1/routes').send(route).expect(503).expect(r => expect(r.body.error.provider).toMatchObject({ provider: 'router', reason: 'not_configured' }));
  });
  it('honors an explicitly disabled geocoder even with an operator URL present', async () => {
    let called = false;
    const client = await setup({ geocoder: { search: async () => { called = true; throw new Error('Must not call'); } } },
      { GEOCODER_PROVIDER: 'disabled', NOMINATIM_URL: 'https://gis.test' });
    await client.get('/api/v1/geocode?city=smolensk&q=test-address').expect(503).expect(r => expect(r.body.error.provider.reason).toBe('disabled'));
    await client.get('/health/ready').expect(200).expect(r => expect(r.body.data.dependencies.geocoder).toBe('disabled'));
    expect(called).toBe(false);
  });
  it('rejects malformed GIS results at output boundary', async () => {
    const client = await setup({ geocoder: { search: async () => ({ items: [{}], provider: 'nominatim', attribution: 'Test only' }) }, router: { route: async () => ({ geometry: { type: 'LineString', coordinates: [[32, 54]] } }) } });
    await client.get('/api/v1/geocode?city=smolensk&q=test-address').expect(503);
    await client.post('/api/v1/routes').send(route).expect(503);
  });
  it('maps malformed actual upstream adapter response and no-route correctly', async () => {
    const config = { baseUrl: 'https://gis.test', allowedOrigins: ['https://gis.test'], userAgent: 'Ryadom test transport' };
    const geocoder = new NominatimGeocoder(config, { fetch: async () => new Response('{"invalid":true}', { headers: { 'content-type': 'application/json' } }) });
    const client = await setup({ geocoder, router: { route: async () => { throw new ProviderUnavailable('valhalla', 'no_route'); } } });
    await client.get('/api/v1/geocode?city=smolensk&q=test-address').expect(503);
    await client.post('/api/v1/routes').send(route).expect(404);
  });
  it.each(['transit', 'WALKING', '', null])('rejects unsupported route mode %s', async mode => {
    await (await setup()).post('/api/v1/routes').send({ ...route, mode }).expect(400);
  });
  it('rejects route span >100km, unknown fields and numeric strings', async () => {
    const client = await setup();
    await client.post('/api/v1/routes').send({ ...route, destination: { lon: 40, lat: 60 } }).expect(400);
    await client.post('/api/v1/routes').send({ ...route, url: 'http://127.0.0.1' }).expect(400);
    await client.post('/api/v1/routes').send({ ...route, origin: { lon: '32', lat: 54 } }).expect(400);
  });
  it('enforces JSON media type, no compression, body limit, malformed JSON and URL length', async () => {
    const client = await setup();
    await client.post('/api/v1/routes').type('text').send(JSON.stringify(route)).expect(415);
    await client.post('/api/v1/routes').set('Content-Encoding', 'gzip').send(route).expect(415);
    await client.post('/api/v1/routes').set('Content-Type', 'application/json').send('{').expect(400);
    await client.post('/api/v1/routes').send({ data: 'x'.repeat(17_000) }).expect(413);
    await client.get('/api/v1/categories?q=' + 'x'.repeat(4100)).expect(413);
  });
  it('requires exact allowed origin for reports and restrictive CORS', async () => {
    const client = await setup();
    await client.post('/api/v1/reports').send(report).expect(400);
    await client.post('/api/v1/reports').set('Origin', 'null').send(report).expect(400);
    await client.post('/api/v1/reports').set('Origin', origin + '.evil.test').send(report).expect(400);
    await client.post('/api/v1/reports').set('Origin', origin).set('Sec-Fetch-Site', 'cross-site').send(report).expect(400);
    await client.get('/api/v1/categories').set('Origin', origin).expect(200).expect(r => {
      expect(r.headers['access-control-allow-origin']).toBe(origin);
      expect(r.headers['access-control-allow-credentials']).toBeUndefined();
    });
    await client.options('/api/v1/reports').set('Origin', origin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type').expect(204);
    await client.options('/api/v1/reports').set('Origin', origin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'x-unrecognized').expect(400);
  });
  it.each(['/api/v1/reports/', '/API/V1/REPORTS', '/API/V1/REPORTS/'])('protects every matched reports path %s', async path => {
    let called = false;
    const config = loadConfig({ CORS_ORIGINS: origin });
    const client = await setup({ config, limiter: new RedisRateLimiter(config), catalog: catalog({ report: async () => { called = true; return null; } }) });
    await client.post(path).send(report).expect(400);
    await client.post(path).set('Origin', origin).send(report).expect(503).expect(r => expect(r.body.error.provider.provider).toBe('reports'));
    expect(called).toBe(false);
  });
  it.each(['/api/v1/%72eports', '/api//v1/reports', '//api/v1/reports'])('does not expose an unguarded encoded/double-slash report path %s', async path => {
    let called = false;
    const client = await setup({ catalog: catalog({ report: async () => { called = true; return null; } }) });
    const res = await client.post(path).send(report);
    expect([400, 404]).toContain(res.status); expect(called).toBe(false);
  });
  it.each([{ consent: false }, { description: 'short' }, { placeId: '1' }, { reason: 'unsupported' }, { extra: true }])('validates report %j', async fields => {
    await (await setup()).post('/api/v1/reports').set('Origin', origin).send({ ...report, ...fields }).expect(400);
  });
  it('returns 404 for unknown report place and 202 only after durable repository receipt', async () => {
    let persisted = false;
    let client = await setup();
    await client.post('/api/v1/reports').set('Origin', origin).send(report).expect(404);
    client = await setup({ catalog: catalog({ report: async () => {
      await new Promise(resolve => setTimeout(resolve, 20)); persisted = true;
      return { id: '22222222-2222-4222-8222-222222222222', status: 'pending', receivedAt: new Date().toISOString() };
    } }) });
    const res = await client.post('/api/v1/reports').set('Origin', origin).send(report).expect(202);
    expect(persisted).toBe(true); expect(ReportResponseSchema.safeParse(res.body).success).toBe(true);
  });
  it('maps failed durable report write to 503', async () => {
    const client = await setup({ catalog: catalog({ report: async () => { throw new Error('sql secret'); } }) });
    await client.post('/api/v1/reports').set('Origin', origin).send(report).expect(503).expect(r => expect(r.body.error.provider.provider).toBe('reports'));
  });
  it('rate-limits read and expensive GIS independently and rejects forwarded IP spoofing', async () => {
    const config = loadConfig({ CORS_ORIGINS: origin, API_READ_LIMIT: '2', API_GEO_LIMIT: '1' });
    const limiter = new RedisRateLimiter(config);
    const client = await setup({ config, limiter });
    await client.get('/api/v1/categories').expect(200);
    await client.get('/api/v1/categories').expect(200);
    await client.get('/api/v1/categories').set('X-Forwarded-For', '203.0.113.1').expect(429).expect(r => expect(r.headers['retry-after']).toBeDefined());
    await client.post('/api/v1/routes').send(route).expect(503);
    await client.post('/api/v1/routes').send(route).expect(429);
    await limiter.close();
  });
  it('fails reports closed without configured Redis', async () => {
    const config = loadConfig({ CORS_ORIGINS: origin });
    const client = await setup({ config, limiter: new RedisRateLimiter(config) });
    await client.post('/api/v1/reports').set('Origin', origin).send(report).expect(503).expect(r => expect(r.body.error.provider.provider).toBe('reports'));
  });
  it('bounds a stalled DB request and exposes a timeout provider state', async () => {
    const client = await setup({ catalog: catalog({ nearby: () => new Promise<never>(() => {}) }) });
    await client.get(near).expect(503).expect(r => expect(r.body.error.provider).toMatchObject({ provider: 'catalog', reason: 'timeout' }));
  }, 6000);
  it('rejects excess simultaneous routing work without an unbounded queue', async () => {
    let release!: () => void; let started!: () => void; let count = 0;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const startedTwo = new Promise<void>(resolve => { started = resolve; });
    const client = await setup({ router: { route: async () => {
      count++; if (count === 2) started(); await pending; throw new ProviderUnavailable('valhalla', 'timeout');
    } } });
    const first = client.post('/api/v1/routes').send(route).then(r => r);
    const second = client.post('/api/v1/routes').send(route).then(r => r);
    try {
      await bounded(startedTwo, 2000, new Error('Requests did not start'));
      await client.post('/api/v1/routes').send(route).expect(429); expect(count).toBe(2);
    } finally { release(); }
    expect((await first).status).toBe(503); expect((await second).status).toBe(503);
  });
  it('passes client cancellation to the GIS provider', async () => {
    let entered!: () => void; let aborted!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const cancelled = new Promise<void>(resolve => { aborted = resolve; });
    await setup({ router: { route: async (_input, signal) => {
      entered();
      return new Promise<never>((_resolve, reject) => { signal?.addEventListener('abort', () => {
        aborted(); reject(new ProviderUnavailable('valhalla', 'cancelled'));
      }, { once: true }); });
    } } });
    const app = apps.at(-1); if (!app) throw new Error('Missing app');
    const req = httpRequest(new URL('/api/v1/routes', await app.getUrl()), { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    req.on('error', () => {}); req.end(JSON.stringify(route));
    await bounded(started, 2000, new Error('Request did not start')); req.destroy();
    await bounded(cancelled, 2000, new Error('Provider not cancelled'));
  });
});
