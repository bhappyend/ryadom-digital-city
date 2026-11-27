import { RouteRequestSchema, RouteResultSchema, type RouteMode, type RouteRequest, type RouteResult } from '@ryadom/types';
import { InvalidGisInput, ProviderUnavailable } from './errors.js';
import { providerEndpoint, providerJson, type HttpProviderConfig, type ProviderRuntime } from './http.js';
import { decodePolyline } from './polyline.js';
import { boundedNumber, boundedText, record } from './validation.js';

export const VALHALLA_COSTING = { walking: 'pedestrian', cycling: 'bicycle', driving: 'auto' } as const satisfies Record<RouteMode, string>;

export class ValhallaRouter {
  constructor(private readonly config: HttpProviderConfig, private readonly runtime: ProviderRuntime = {}) {}

  async route(input: RouteRequest, signal?: AbortSignal): Promise<RouteResult> {
    const parsed = RouteRequestSchema.safeParse(input);
    if (!parsed.success) throw new InvalidGisInput('Invalid route endpoints, span or mode');
    const request = parsed.data;
    const url = providerEndpoint(this.config, 'route', 'valhalla');
    const data = await providerJson('valhalla', this.config, url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [request.origin, request.destination].map(({ lat, lon }) => ({ lat, lon, type: 'break' })),
        costing: VALHALLA_COSTING[request.mode], units: 'kilometers', language: 'ru-RU', format: 'json', directions_type: 'instructions' }),
    }, signal, this.runtime);
    try {
      const root = record(data);
      if (root.error_code === 442) throw new ProviderUnavailable('valhalla', 'no_route');
      const trip = record(root.trip);
      if (trip.status !== 0 || trip.units !== 'kilometers') throw new Error('Invalid trip status/units');
      // This API accepts exactly two break locations, so exactly one leg is expected.
      if (!Array.isArray(trip.legs) || trip.legs.length !== 1) throw new Error('Unexpected legs');
      const summary = record(trip.summary);
      const leg = record(trip.legs[0]);
      const coordinates = decodePolyline(boundedText(leg.shape, 320_000), 6, 20_000);
      if (!Array.isArray(leg.maneuvers) || leg.maneuvers.length < 1 || leg.maneuvers.length > 2000) throw new Error('Invalid maneuvers');
      const maneuvers = leg.maneuvers.map((value: unknown) => {
        const maneuver = record(value);
        const begin = boundedNumber(maneuver.begin_shape_index, 0, coordinates.length - 1);
        const end = boundedNumber(maneuver.end_shape_index, begin, coordinates.length - 1);
        if (!Number.isInteger(begin) || !Number.isInteger(end)) throw new Error('Invalid indices');
        const location = coordinates[begin];
        if (!location) throw new Error('Missing location');
        const type = boundedNumber(maneuver.type, 0, 1000);
        if (!Number.isInteger(type)) throw new Error('Invalid maneuver type');
        return { instruction: boundedText(maneuver.instruction, 1000), type: String(type),
          location: { lon: location[0], lat: location[1] }, beginShapeIndex: begin, endShapeIndex: end,
          distanceMeters: boundedNumber(maneuver.length, 0, 10_000) * 1000,
          durationSeconds: boundedNumber(maneuver.time, 0, 604_800) };
      });
      return RouteResultSchema.parse({ provider: 'valhalla', mode: request.mode,
        geometry: { type: 'LineString', coordinates }, maneuvers,
        distanceMeters: boundedNumber(summary.length, 0, 10_000) * 1000,
        durationSeconds: boundedNumber(summary.time, 0, 604_800),
        attribution: '© OpenStreetMap contributors (ODbL 1.0); routing: Valhalla' });
    } catch (error) {
      if (error instanceof ProviderUnavailable) throw error;
      throw new ProviderUnavailable('valhalla', 'invalid_response');
    }
  }
}
