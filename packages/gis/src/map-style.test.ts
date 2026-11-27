import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { createDarkMapStyle, getMapPresentation, MAP_ATTRIBUTION, MAP_PALETTE, type DarkMapOptions } from './map-style.js';
const options: DarkMapOptions = { tileUrl: 'https://maps.example.test/smolensk/{z}/{x}/{y}.pbf',
  glyphsUrl: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf', allowedOrigins: ['https://maps.example.test'] };

describe('Digital City OpenMapTiles style', () => {
  it('passes the real MapLibre style specification validator', () => {
    expect(validateStyleMin(createDarkMapStyle(options))).toEqual([]);
  });
  it('uses schema-specific layers and the original map tokens with attribution', () => {
    const style = createDarkMapStyle(options);
    expect(style.sources.openmaptiles).toMatchObject({ type: 'vector', tiles: [options.tileUrl], maxzoom: 14, attribution: MAP_ATTRIBUTION });
    expect(style.layers.find(layer => layer.id === 'water')).toMatchObject({ 'source-layer': 'water', paint: { 'fill-color': '#0D4355' } });
    expect(style.layers.find(layer => layer.id === 'roads')).toMatchObject({ 'source-layer': 'transportation', paint: { 'line-color': '#2B424D' } });
    expect(style.layers.find(layer => layer.id === 'buildings')).toMatchObject({ 'source-layer': 'building', paint: { 'fill-color': '#193440' } });
    expect(style.layers.some(layer => 'source-layer' in layer && layer['source-layer'] === 'transportation_name')).toBe(true);
    expect(MAP_PALETTE.background).toBe('#061217'); expect(MAP_ATTRIBUTION).toContain('openstreetmap.org/copyright');
    expect(JSON.stringify(style)).not.toMatch(/demotiles|map-demo|hero-city/);
  });
  it('is explicitly unavailable without real tiles and glyphs', () => {
    expect(getMapPresentation()).toMatchObject({ status: 'unavailable', provider: 'map', reason: 'not_configured' });
  });
  it.each(['javascript:alert(1)', 'https://maps.example.test.evil.test/{z}/{x}/{y}', 'https://maps.example.test@evil.test/{z}/{x}/{y}',
    'https://maps.example.test/{q}/{x}/{y}', 'https://{z}.example.test/{x}/{y}', 'http://maps.example.test/{z}/{x}/{y}'])('rejects unsafe/incorrect resource template %s', tileUrl => {
    expect(getMapPresentation({ ...options, tileUrl })).toMatchObject({ status: 'unavailable', reason: 'disabled' });
  });
  it('rejects unbounded zoom and inverted bounds', () => {
    expect(() => createDarkMapStyle({ ...options, sourceMaxZoom: 50 })).toThrow();
    expect(() => createDarkMapStyle({ ...options, bounds: [32, 55, 31, 54] })).toThrow();
  });
});
