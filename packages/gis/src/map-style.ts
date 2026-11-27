import type { StyleSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { ProviderUnavailable } from '@ryadom/types';

export const MAP_ATTRIBUTION = '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a> · <a href="https://openmaptiles.org/">© OpenMapTiles</a>';
export const MAP_PALETTE = Object.freeze({ background: '#061217', water: '#0D4355', road: '#2B424D', building: '#193440', text: '#F4F9FA', muted: '#A1B5BE', border: '#25434D', park: '#102B29' });

export interface DarkMapOptions {
  /** OpenMapTiles MVT template, NOT a TileJSON endpoint or a Shortbread/Protomaps source. */
  tileUrl: string;
  glyphsUrl: string;
  /** Origin allowlist also covers glyphs. Browser must be allowed to access these via CSP/CORS. */
  allowedOrigins: readonly string[];
  allowHttp?: boolean;
  fontStack?: string;
  bounds?: [number, number, number, number];
  /** Defaults to OpenMapTiles native z14; MapLibre overzooms it to maxZoom. */
  sourceMaxZoom?: number;
}

export type MapPresentation =
  | { status: 'available'; style: StyleSpecification; minZoom: number; maxZoom: number }
  | (ProviderUnavailable & { provider: 'map' });

function templateUrl(value: string, tokens: readonly string[], config: DarkMapOptions): string {
  if (value.length > 2048 || /[\\\s<>"']/u.test(value)) throw new Error('Invalid map resource');
  let replaced = value;
  for (const token of tokens) {
    if (!replaced.includes(token)) throw new Error('Missing URL template token');
    replaced = replaced.replaceAll(token, 'test');
  }
  if (/[{}]/u.test(replaced)) throw new Error('Unknown URL template token');
  const url = new URL(replaced);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(config.allowHttp === true && url.protocol === 'http:')) ||
      !config.allowedOrigins.includes(url.origin) || ['demotiles.maplibre.org', 'tile.openstreetmap.org'].includes(url.hostname)) {
    throw new Error('Map resource origin is not configured');
  }
  // Never allow host/port placeholders, only paths under a deployment-owned origin.
  if (!value.startsWith(`${url.origin}/`)) throw new Error('Template must be in URL path');
  return value;
}

/** Pure browser-safe generator: no server environment, API credentials or remote fetch. */
export function createDarkMapStyle(config: DarkMapOptions): StyleSpecification {
  const tiles = templateUrl(config.tileUrl, ['{z}', '{x}', '{y}'], config);
  const glyphs = templateUrl(config.glyphsUrl, ['{fontstack}', '{range}'], config);
  const font = config.fontStack ?? 'Noto Sans Regular';
  if (font.length > 100 || /[\u0000-\u001f<>]/u.test(font)) throw new Error('Invalid font stack');
  const zoom = config.sourceMaxZoom ?? 14;
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 22) throw new Error('Invalid source zoom');
  if (config.bounds) {
    const [w, s, e, n] = config.bounds;
    if (![w, s, e, n].every(Number.isFinite) || w < -180 || e > 180 || s < -85.051129 || n > 85.051129 || w >= e || s >= n) throw new Error('Invalid map bounds');
  }
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': MAP_PALETTE.background } },
    { id: 'landcover', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['in', 'class', 'wood', 'grass'], paint: { 'fill-color': MAP_PALETTE.park, 'fill-opacity': 0.65 } },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': MAP_PALETTE.park, 'fill-opacity': 0.8 } },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': MAP_PALETTE.water } },
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', paint: { 'line-color': MAP_PALETTE.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4] } },
    { id: 'buildings', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': MAP_PALETTE.building, 'fill-outline-color': MAP_PALETTE.border } },
    { id: 'road-casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['!in', 'class', 'rail', 'ferry', 'aerialway'], minzoom: 7, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_PALETTE.background, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1, 14, 6, 18, 20] } },
    { id: 'roads', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['!in', 'class', 'rail', 'ferry', 'aerialway', 'path', 'track'], minzoom: 7, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': MAP_PALETTE.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 14, 4, 18, 16] } },
    { id: 'paths', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['in', 'class', 'path', 'track'], minzoom: 13, paint: { 'line-color': MAP_PALETTE.muted, 'line-opacity': 0.6, 'line-width': 1, 'line-dasharray': [2, 2] } },
    { id: 'rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['==', 'class', 'rail'], minzoom: 10, paint: { 'line-color': MAP_PALETTE.muted, 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [4, 3] } },
    { id: 'street-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': [font], 'text-size': 14, 'text-max-angle': 30 }, paint: { 'text-color': MAP_PALETTE.text, 'text-halo-color': MAP_PALETTE.background, 'text-halo-width': 2 } },
    { id: 'place-labels', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', filter: ['in', 'class', 'city', 'town', 'village', 'suburb', 'neighbourhood'], layout: { 'text-field': ['coalesce', ['get', 'name:ru'], ['get', 'name']], 'text-font': [font], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 14, 14, 18], 'text-max-width': 10 }, paint: { 'text-color': MAP_PALETTE.text, 'text-halo-color': MAP_PALETTE.background, 'text-halo-width': 2 } },
    { id: 'house-numbers', type: 'symbol', source: 'openmaptiles', 'source-layer': 'housenumber', minzoom: 17, layout: { 'text-field': ['get', 'housenumber'], 'text-font': [font], 'text-size': 14 }, paint: { 'text-color': MAP_PALETTE.muted, 'text-halo-color': MAP_PALETTE.background, 'text-halo-width': 1 } },
  ];
  return { version: 8, name: 'Рядом · Digital City · OpenMapTiles', glyphs,
    metadata: { 'ryadom:schema': 'openmaptiles', 'ryadom:requires-real-tiles': true },
    sources: { openmaptiles: { type: 'vector', tiles: [tiles], minzoom: 0, maxzoom: zoom,
      attribution: MAP_ATTRIBUTION, ...(config.bounds ? { bounds: config.bounds } : {}) } }, layers };
}

/** Empty configuration cannot produce a decorative navigation substitute. */
export function getMapPresentation(options?: DarkMapOptions): MapPresentation {
  if (!options?.tileUrl || !options.glyphsUrl) return { status: 'unavailable', provider: 'map', reason: 'not_configured', message: 'Картографический источник не настроен.' };
  try { return { status: 'available', style: createDarkMapStyle(options), minZoom: 0, maxZoom: 20 }; }
  catch { return { status: 'unavailable', provider: 'map', reason: 'disabled', message: 'Конфигурация картографического источника недопустима.' }; }
}
