import type { HttpProviderConfig } from '@ryadom/gis';
import { MapConfigSchema, type MapConfig } from '@ryadom/types';

export interface ApiConfig {
  port: number; host: string; origins: readonly string[]; trustedProxies: readonly string[];
  databaseUrl: string | undefined; redisUrl: string | undefined;
  geocoder: HttpProviderConfig; router: HttpProviderConfig; geocoderDisabled: boolean;
  map: MapConfig;
  readLimit: number; geoLimit: number; reportLimit: number;
}
function list(value: string | undefined): string[] { return (value ?? '').split(',').map(v => v.trim()).filter(Boolean); }
function integer(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Invalid numeric API configuration');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error('Invalid numeric API configuration');
  return parsed;
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const origins = list(env.CORS_ORIGINS ?? env.API_CORS_ORIGINS);
  for (const origin of origins) {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Invalid CORS origin');
  }
  const trustedProxies = list(env.API_TRUSTED_PROXIES);
  // Never trust all hops, wildcard subnets or header-provided client identities by default.
  if (trustedProxies.some(v => ['true', '0', '1', '*', '0.0.0.0/0', '::/0'].includes(v))) throw new Error('Unsafe proxy configuration');
  const provider = (prefix: string): HttpProviderConfig => {
    const baseUrl = env[`${prefix}_URL`] ?? env[`${prefix}_BASE_URL`];
    return { ...(baseUrl ? { baseUrl } : {}),
      allowedOrigins: list(env.GIS_ALLOWED_ORIGINS ?? env[`${prefix}_ALLOWED_ORIGINS`]), allowHttp: (env.GIS_ALLOW_HTTP ?? env[`${prefix}_ALLOW_HTTP`]) === 'true',
      userAgent: env.GIS_USER_AGENT ?? 'Ryadom/0.1 self-hosted GIS', timeoutMs: 5000, maxResponseBytes: 4_194_304,
    };
  };
  let map: MapConfig = { status: 'unavailable', provider: 'map', reason: 'not_configured', message: 'Картографический источник не настроен' };
  if (env.MAP_STYLE_URL) {
    try {
      const url = new URL(env.MAP_STYLE_URL);
      if (!list(env.MAP_ALLOWED_ORIGINS).includes(url.origin) || url.search || url.hash || url.username || url.password ||
        (url.protocol !== 'https:' && !(url.protocol === 'http:' && env.MAP_ALLOW_HTTP === 'true')) ||
        ['demotiles.maplibre.org', 'tile.openstreetmap.org'].includes(url.hostname)) throw new Error();
      map = MapConfigSchema.parse({ status: 'available', provider: 'map', styleUrl: env.MAP_STYLE_URL,
        attribution: env.MAP_ATTRIBUTION, minZoom: integer(env.MAP_MIN_ZOOM, 0, 0, 24), maxZoom: integer(env.MAP_MAX_ZOOM, 20, 0, 24) });
    } catch { map = { status: 'unavailable', provider: 'map', reason: 'disabled', message: 'Конфигурация карты недопустима' }; }
  }
  return { port: integer(env.API_PORT ?? env.PORT, 3001, 1, 65535), host: env.API_HOST ?? '127.0.0.1', origins, trustedProxies,
    databaseUrl: env.APP_DATABASE_URL, redisUrl: env.REDIS_URL,
    geocoder: provider('NOMINATIM'), router: provider('VALHALLA'), map,
    geocoderDisabled: env.GEOCODER_PROVIDER !== undefined && env.GEOCODER_PROVIDER !== 'nominatim',
    readLimit: integer(env.API_READ_LIMIT, 60, 1, 600), geoLimit: integer(env.API_GEO_LIMIT, 10, 1, 60),
    reportLimit: integer(env.API_REPORT_LIMIT, 5, 1, 20), };
}
