import { createServer, type RequestListener, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { City, RouteRequest } from '@ryadom/types';
import { ProviderUnavailable, toProviderState } from './errors.js';
import { providerEndpoint, type HttpProviderConfig } from './http.js';
import { NominatimGeocoder, geocodeCacheKey } from './nominatim.js';
import { decodePolyline } from './polyline.js';
import { ValhallaRouter } from './valhalla.js';

// Synthetic transport fixtures, never published as city data or organizations.
const city: City = { id: 'test-city', name: 'Test', region: 'Test', countryCode: 'RU',
  center: { lon: 32, lat: 54 }, bounds: [31, 53, 33, 56], timezone: 'Europe/Moscow', enabled: true };
const config: HttpProviderConfig = { baseUrl: 'https://gis.example.test/base/',
  allowedOrigins: ['https://gis.example.test'], userAgent: 'Ryadom-test/0.1 (unit test)' };
const request: RouteRequest = { origin: { lon: 32, lat: 54 }, destination: { lon: 32.01, lat: 54.01 }, mode: 'walking' };
const geocoded = { osm_id: 1, osm_type: 'way', display_name: 'Test address', lat: '54', lon: '32', boundingbox: ['53.9', '54.1', '31.9', '32.1'] };
const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
function fakeResponse(value: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(value));
  return { fetch: fetcher };
}
// A separate test encoder creates small local routing shapes; fixed published vectors below check decoding independently.
function encoded(points: [number, number][], precision = 6): string {
  let lat = 0; let lon = 0; let result = '';
  for (const [x, y] of points) {
    const values = [Math.round(y * 10 ** precision) - lat, Math.round(x * 10 ** precision) - lon];
    lat = Math.round(y * 10 ** precision); lon = Math.round(x * 10 ** precision);
    for (const delta of values) {
      let n = delta < 0 ? -delta * 2 - 1 : delta * 2;
      while (n >= 32) { result += String.fromCharCode((n % 32) + 95); n = Math.floor(n / 32); }
      result += String.fromCharCode(n + 63);
    }
  }
  return result;
}
const shape = encoded([[32, 54], [32.005, 54.005], [32.01, 54.01]]);
const trip = () => ({ trip: { status: 0, units: 'kilometers', summary: { length: 1.25, time: 900 },
  legs: [{ shape, maneuvers: [{ type: 1, instruction: 'Walk', length: 1.25, time: 900, begin_shape_index: 0, end_shape_index: 2 }] }] } });

describe('coordinate normalization', () => {
  it('decodes the published polyline5 example into GeoJSON longitude first', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual([[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]]);
  });
  it('decodes polyline6 and negative/zero coordinates without bitwise overflow', () => {
    const points: [number, number][] = [[-179.999999, -89.999999], [0, 0], [179.999999, 89.999999]];
    expect(decodePolyline(encoded(points), 6)).toEqual(points);
  });
  it.each(['', '?', '??', '~~~~~~~?', '\n???', encoded([[181, 54], [32, 54]])])('rejects malformed geometry %j', (value) => {
    expect(() => decodePolyline(value)).toThrow();
  });
  it('bounds point count and precision', () => {
    expect(() => decodePolyline(shape, 6, 2)).toThrow();
    expect(() => decodePolyline(shape, 7 as 6)).toThrow();
  });
});

describe('Nominatim', () => {
  it('normalizes queries, locks the city viewbox and converts bbox/coordinate order', async () => {
    const runtime = fakeResponse([geocoded]);
    const result = await new NominatimGeocoder(config, runtime).search('  Test   address  ', city);
    expect(result.items[0]?.coordinates).toEqual({ lon: 32, lat: 54 });
    expect(result.items[0]?.bounds).toEqual([31.9, 53.9, 32.1, 54.1]);
    expect(result.items[0]?.provenance.sourceUpdatedAt).toBeNull();
    const url = new URL(String(runtime.fetch.mock.calls[0]?.[0]));
    expect(url.pathname).toBe('/base/search'); expect(url.searchParams.get('viewbox')).toBe('31,56,33,53');
    expect(url.searchParams.get('q')).toBe('Test address'); expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(geocodeCacheKey('Test   address', city)).toBe(geocodeCacheKey('  Test address ', city));
    expect(geocodeCacheKey('Test address', { ...city, bounds: [30, 53, 33, 56] })).not.toBe(geocodeCacheKey('Test address', city));
  });
  it('returns a genuine empty result, never fabricated addresses', async () => {
    expect((await new NominatimGeocoder(config, fakeResponse([])).search('Test', city)).items).toEqual([]);
  });
  it.each([[{ ...geocoded, lon: '99' }], [{ ...geocoded, lat: '' }], [{ ...geocoded, osm_id: 1.5 }], [{ ...geocoded, display_name: '<b>address</b>\u0000' }], Array(11).fill(geocoded), { error: 'failure' }].map(data => ({ data })))('rejects invalid/out-of-city provider data', async ({ data }) => {
    await expect(new NominatimGeocoder(config, fakeResponse(data)).search('Test', city)).rejects.toMatchObject({ reason: 'invalid_response' });
  });
  it('rejects bad input before fetching', async () => {
    const runtime = fakeResponse([]);
    await expect(new NominatimGeocoder(config, runtime).search('\nBad', city)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(runtime.fetch).not.toHaveBeenCalled();
  });
});

describe('Valhalla', () => {
  it.each([['walking', 'pedestrian'], ['cycling', 'bicycle'], ['driving', 'auto']] as const)('maps %s to %s and converts metrics', async (mode, costing) => {
    const runtime = fakeResponse(trip());
    const route = await new ValhallaRouter(config, runtime).route({ ...request, mode });
    const sent = JSON.parse(String(runtime.fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(sent.costing).toBe(costing); expect(sent.locations).toEqual([{ ...request.origin, type: 'break' }, { ...request.destination, type: 'break' }]);
    expect(sent.units).toBe('kilometers'); expect(sent.format).toBe('json');
    expect(route.distanceMeters).toBe(1250); expect(route.durationSeconds).toBe(900);
    expect(route.geometry.coordinates[0]).toEqual([32, 54]);
    expect(route.maneuvers[0]).toMatchObject({ location: { lon: 32, lat: 54 }, distanceMeters: 1250, durationSeconds: 900, beginShapeIndex: 0, endShapeIndex: 2 });
  });
  it.each([{}, { trip: { status: 0, units: 'kilometers', legs: [] } }, { trip: { ...trip().trip, units: 'miles' } },
    { trip: { ...trip().trip, legs: [{ shape: '??', maneuvers: [] }] } }])('does not invent routes for absent data', async data => {
    await expect(new ValhallaRouter(config, fakeResponse(data)).route(request)).rejects.toMatchObject({ reason: 'invalid_response' });
  });
  it('rejects out-of-range maneuver indices', async () => {
    const value = trip(); value.trip.legs[0]!.maneuvers[0]!.end_shape_index = 99;
    await expect(new ValhallaRouter(config, fakeResponse(value)).route(request)).rejects.toMatchObject({ reason: 'invalid_response' });
  });
  it('normalizes documented HTTP400/error442 no-path without any fake geometry', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error_code: 442, error: 'No path could be found for input' }, { status: 400 }));
    await expect(new ValhallaRouter(config, { fetch: fetcher }).route(request)).rejects.toMatchObject({ reason: 'no_route', httpStatus: 400 });
    expect(toProviderState(new ProviderUnavailable('valhalla', 'no_route'))).toMatchObject({ provider: 'router', reason: 'coverage_missing' });
  });
  it('keeps other upstream HTTP400 failures as provider errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error_code: 100, error: 'private provider detail' }, { status: 400 }));
    await expect(new ValhallaRouter(config, { fetch: fetcher }).route(request)).rejects.toMatchObject({ reason: 'http_error', httpStatus: 400 });
  });
  it('bounds distance and modes before contacting a provider', async () => {
    const runtime = fakeResponse(trip());
    await expect(new ValhallaRouter(config, runtime).route({ ...request, destination: { lon: 40, lat: 60 } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(new ValhallaRouter(config, runtime).route({ ...request, mode: 'car' as 'driving' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(runtime.fetch).not.toHaveBeenCalled();
  });
});

describe('fixed allowlisted HTTP transport', () => {
  it.each(['https://gis.example.test.evil.test', 'https://gis.example.test@evil.test', 'https://evil.test/gis.example.test', 'https://gis.example.test:444', 'file:///etc/passwd', 'http://gis.example.test', 'https://gis.example.test/?next=http://169.254.169.254', 'https://gis.example.test/#x', 'https://gis.example.test/%2fadmin', 'https://gis.example.test\\@evil.test', 'https://127.0.0.1', 'https://[::1]'])('rejects spoofed/non-allowlisted target %s', baseUrl => {
    expect(() => providerEndpoint({ ...config, baseUrl }, 'route', 'valhalla')).toThrow(ProviderUnavailable);
  });
  it('rejects public Nominatim even when allowlisted', () => {
    expect(() => providerEndpoint({ ...config, baseUrl: 'https://nominatim.openstreetmap.org', allowedOrigins: ['https://nominatim.openstreetmap.org'] }, 'search', 'nominatim')).toThrow();
  });
  it('returns the shared public not_configured state', async () => {
    try { await new ValhallaRouter({ ...config, baseUrl: undefined } as unknown as HttpProviderConfig).route(request); }
    catch (error) { expect(error).toBeInstanceOf(ProviderUnavailable); expect(toProviderState(error as ProviderUnavailable)).toMatchObject({ provider: 'router', reason: 'not_configured' }); return; }
    throw new Error('Expected unavailable');
  });
  it.each([429, 404, 500])('propagates HTTP %d as unavailable, without upstream body', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ secret: 'not exposed' }, { status }));
    await expect(new ValhallaRouter(config, { fetch: fetcher }).route(request)).rejects.toMatchObject({ reason: 'http_error', httpStatus: status });
  });
  it('rejects a false JSON body, content type and oversized payload', async () => {
    for (const response of [new Response('<html/>', { headers: { 'Content-Type': 'text/html' } }),
      new Response('{', { headers: { 'Content-Type': 'application/json' } }), json(Array(1000).fill('x')),
      new Response('[]', { headers: { 'Content-Type': 'application/json', 'Content-Length': '10000' } })]) {
      await expect(new NominatimGeocoder({ ...config, maxResponseBytes: 256 }, { fetch: vi.fn<typeof fetch>().mockResolvedValue(response) }).search('Test', city)).rejects.toBeInstanceOf(ProviderUnavailable);
    }
  });
  it('enforces the byte cap even when the Content-Length header is missing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(Array(1000).fill('x')));
    await expect(new NominatimGeocoder({ ...config, maxResponseBytes: 256 }, { fetch: fetcher }).search('Test', city)).rejects.toMatchObject({ reason: 'response_too_large' });
  });
  it('propagates network errors and an already cancelled request', async () => {
    await expect(new ValhallaRouter(config, { fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('private address')) }).route(request)).rejects.toMatchObject({ reason: 'network_error' });
    await expect(new ValhallaRouter(config).route(request, AbortSignal.abort())).rejects.toMatchObject({ reason: 'cancelled' });
  });
});

let server: Server | undefined;
afterEach(async () => { if (server) { const current = server; server = undefined; current.closeAllConnections(); await new Promise<void>(resolve => current.close(() => resolve())); } });
async function serve(handler: RequestListener): Promise<HttpProviderConfig> {
  server = createServer(handler);
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return { ...config, baseUrl, allowedOrigins: [baseUrl], allowHttp: true, timeoutMs: 50 };
}
describe('native Node fetch cancellation and redirects', () => {
  it('times out while reading a stalled body', async () => {
    const local = await serve((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('['); });
    await expect(new NominatimGeocoder(local).search('Test', city)).rejects.toMatchObject({ reason: 'timeout' });
  });
  it('cancels an in-flight fetch using caller AbortSignal', async () => {
    const local = await serve(() => {}); const controller = new AbortController();
    const pending = new ValhallaRouter({ ...local, timeoutMs: 2000 }).route(request, controller.signal);
    setTimeout(() => controller.abort(), 20);
    await expect(pending).rejects.toMatchObject({ reason: 'cancelled' });
  });
  it('does not follow a redirect to a metadata endpoint', async () => {
    const local = await serve((_req, res) => { res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); res.end(); });
    await expect(new NominatimGeocoder({ ...local, timeoutMs: 2000 }).search('Test', city)).rejects.toMatchObject({ reason: 'network_error' });
  });
});
