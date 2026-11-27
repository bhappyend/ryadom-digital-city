import { CitySchema, GeocodeResultSchema, type City, type GeocodeResult } from '@ryadom/types';
import { InvalidGisInput, ProviderUnavailable } from './errors.js';
import { providerEndpoint, providerJson, type HttpProviderConfig, type ProviderRuntime } from './http.js';
import { boundedText, normalizeGeocodeQuery, record } from './validation.js';

const ATTRIBUTION = '© OpenStreetMap contributors (ODbL 1.0)';
function decimal(value: unknown): number {
  if (typeof value !== 'string' || value.length > 32 || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('Invalid coordinate');
  return Number(value);
}

/** Search one configured city, bounded to ten results. Caller applies rate limit and optional shared cache. */
export class NominatimGeocoder {
  constructor(private readonly config: HttpProviderConfig, private readonly runtime: ProviderRuntime = {}) {}

  async search(input: string, city: City, signal?: AbortSignal): Promise<GeocodeResult> {
    const query = normalizeGeocodeQuery(input);
    if (!CitySchema.safeParse(city).success || !city.enabled) throw new InvalidGisInput('An enabled city is required');
    const url = providerEndpoint(this.config, 'search', 'nominatim');
    const [west, south, east, north] = city.bounds;
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', addressdetails: '0', limit: '10',
      countrycodes: 'ru', 'accept-language': 'ru', bounded: '1', viewbox: `${west},${north},${east},${south}` }).toString();
    const data = await providerJson('nominatim', this.config, url, { method: 'GET' }, signal, this.runtime);
    try {
      if (!Array.isArray(data) || data.length > 10) throw new Error('Invalid result count');
      const importedAt = new Date().toISOString();
      return GeocodeResultSchema.parse({ provider: 'nominatim', attribution: ATTRIBUTION,
        items: data.map((item: unknown) => {
          const result = record(item);
          if (!['node', 'way', 'relation'].includes(String(result.osm_type)) ||
            !Number.isSafeInteger(result.osm_id) || Number(result.osm_id) <= 0) throw new Error('Invalid OSM identifier');
          const id = `${String(result.osm_type)}/${String(result.osm_id)}`;
          const lat = decimal(result.lat); const lon = decimal(result.lon);
          if (lon < west || lon > east || lat < south || lat > north) throw new Error('Outside configured city');
          let bounds: [number, number, number, number] | null = null;
          if (result.boundingbox !== undefined) {
            if (!Array.isArray(result.boundingbox) || result.boundingbox.length !== 4) throw new Error('Invalid bounds');
            const [s, n, w, e] = result.boundingbox.map(decimal) as [number, number, number, number];
            // Point results may legitimately have a degenerate provider bbox.
            if (s < n && w < e) bounds = [w, s, e, n];
            else if (s !== n || w !== e) throw new Error('Reversed bounds');
          }
          return { id, label: boundedText(result.display_name, 500), coordinates: { lon, lat }, bounds,
            provenance: { sourceId: 'nominatim', sourceRecordId: id, sourceUrl: `https://www.openstreetmap.org/${id}`,
              license: 'ODbL-1.0', attribution: ATTRIBUTION, sourceUpdatedAt: null, importedAt } };
        }),
      });
    } catch { throw new ProviderUnavailable('nominatim', 'invalid_response'); }
  }
}

/** Key input for a bounded server cache. Query case preserved because provider semantics may differ. */
export function geocodeCacheKey(query: string, city: City): string {
  return JSON.stringify(['nominatim', city.id, city.bounds, 'ru', normalizeGeocodeQuery(query)]);
}
