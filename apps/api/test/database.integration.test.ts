import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import request from 'supertest';
import { createDatabasePool, migrate, seed, grantRuntime, ImportRepository } from '@ryadom/db/compiled';
import { NominatimGeocoder, ValhallaRouter } from '@ryadom/gis';
import { PlacesResponseSchema, PlaceResponseSchema, ReportResponseSchema } from '@ryadom/types';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createCatalog } from '../src/repository.js';
import { RedisRateLimiter } from '../src/rate-limit.js';

it.runIf(process.env.API_DATABASE_TEST === '1')('real PostGIS + Redis + Nest: nearest results, durable reports and shared abuse limits', async () => {
  const root = resolve(__dirname, '../../..');
  const local = parseEnv(readFileSync(resolve(root, process.env.API_SMOKE_ENV_FILE ?? 'infra/.env.local'), 'utf8'));
  const adminUrl = new URL(process.env.DATABASE_URL ?? local.DATABASE_URL ?? '');
  const runtimeUrl = new URL(process.env.APP_DATABASE_URL ?? local.APP_DATABASE_URL ?? '');
  const name = 'ryadom_apitest_' + randomUUID().replaceAll('-', '');
  if (!/^ryadom_apitest_[a-f0-9]{32}$/.test(name)) throw new Error('Unsafe scratch database');
  const admin = createDatabasePool(adminUrl.toString(), 'migration');
  let created = false;
  let scratch: ReturnType<typeof createDatabasePool> | undefined;
  let catalog: ReturnType<typeof createCatalog>;
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  let limiter: RedisRateLimiter | undefined;
  let replica: RedisRateLimiter | undefined;
  try {
    // Only a new, validated disposable DB. Never clear or seed the runtime catalog.
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    adminUrl.pathname = '/' + name; runtimeUrl.pathname = '/' + name;
    scratch = createDatabasePool(adminUrl.toString(), 'migration');
    await migrate(scratch, resolve(root, 'packages/db/migrations')); await seed(scratch);
    const imports = new ImportRepository(scratch);
    await imports.registerDataSource({ id: 'test-only-api', name: 'TEST ONLY disposable API fixture', license: 'test-fixture', attribution: 'TEST ONLY', sourceUrl: null, enabled: true });
    const job = await imports.startImport('test-only-api');
    const fixture = await imports.upsertPlace(job, { slug: 'test-only-api-place', name: 'TEST ONLY API fixture 50%_', cityId: 'smolensk',
      categoryIds: ['cafe'], address: 'TEST ONLY disposable address', coordinates: { lon: 32.0453, lat: 54.7826 },
      description: null, phone: null, website: null, openingHours: null, accessibility: 'unknown' },
    { sourceId: 'test-only-api', sourceRecordId: '1', sourceUrl: null, license: 'test-fixture', attribution: 'TEST ONLY', sourceUpdatedAt: null, importedAt: new Date().toISOString() });
    await imports.finishImport(job, { status: 'completed' });
    await grantRuntime(scratch, decodeURIComponent(runtimeUrl.username));
    const config = loadConfig({ APP_DATABASE_URL: runtimeUrl.toString(), REDIS_URL: process.env.REDIS_URL ?? local.REDIS_URL,
      CORS_ORIGINS: 'http://localhost:3000', API_REPORT_LIMIT: '2' });
    const namespace = 'ryadom:test:' + randomUUID();
    limiter = new RedisRateLimiter(config, namespace); replica = new RedisRateLimiter(config, namespace);
    await limiter.connect(); await replica.connect();
    catalog = createCatalog(config.databaseUrl);
    app = await createApp({ config, catalog, limiter, geocoder: new NominatimGeocoder(config.geocoder), router: new ValhallaRouter(config.router) });
    await app.listen(0, '127.0.0.1'); const client = request(app.getHttpServer());
    await client.get('/health/ready').expect(200);
    const near = '/api/v1/places/near?city=smolensk&lon=32.0453&lat=54.7826&radius=300&category=cafe';
    const places = PlacesResponseSchema.parse((await client.get(near).expect(200)).body).data;
    expect(places.pagination.total).toBe(1); expect(places.items[0]?.id).toBe(fixture.placeId);
    expect(places.items[0]?.distanceMeters).toBeLessThan(0.01);
    const place = PlaceResponseSchema.parse((await client.get('/api/v1/places/test-only-api-place').expect(200)).body).data;
    expect(place.id).toBe(fixture.placeId);
    const empty = PlacesResponseSchema.parse((await client.get(near).query({ q: "x' OR 1=1; SELECT pg_sleep(2)--" }).expect(200)).body).data;
    expect(empty.items).toEqual([]); expect(empty.pagination.total).toBe(0);
    await client.get(near).query({ q: '50%_' }).expect(200).expect(r => expect(r.body.data.pagination.total).toBe(1));
    const report = { placeId: fixture.placeId, reason: 'other', description: 'TEST ONLY isolated durable receipt check', consent: true };
    await client.post('/api/v1/reports/').send(report).expect(400);
    const accepted = ReportResponseSchema.parse((await client.post('/API/V1/REPORTS/').set('Origin', 'http://localhost:3000').send(report).expect(202)).body).data;
    const stored = await scratch.query('SELECT status,description FROM reports WHERE id=$1', [accepted.id]);
    expect(stored.rows).toEqual([{ status: 'pending', description: report.description }]);
    await client.post('/api/v1/reports').set('Origin', 'http://localhost:3000').send({ ...report, placeId: randomUUID() }).expect(404);
    await client.post('/api/v1/reports/').set('Origin', 'http://localhost:3000').send(report).expect(429);
    expect((await scratch.query('SELECT count(*)::int AS n FROM reports')).rows[0]?.n).toBe(1);
    // Separate limiter clients share one Redis counter, including pseudonymous IP identity.
    await limiter.consume('test-replica-ip', 'report'); await replica.consume('test-replica-ip', 'report');
    await expect(limiter.consume('test-replica-ip', 'report')).rejects.toMatchObject({ status: 429 });
    await replica.close();
    await limiter.close(); // Server remains up; reports must fail closed during Redis loss.
    await client.post('/API/V1/REPORTS').set('Origin', 'http://localhost:3000').send(report).expect(503);
    expect((await scratch.query('SELECT count(*)::int AS n FROM reports')).rows[0]?.n).toBe(1);
    // A disconnected real DB pool maps to a provider failure, not empty success.
    await catalog?.close(); catalog = undefined;
    await client.get(near).expect(503);
  } finally {
    await app?.close(); await catalog?.close(); await limiter?.close(); await replica?.close(); await scratch?.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}, 45_000);
