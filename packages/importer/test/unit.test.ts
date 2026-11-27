import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_IDS, PlaceSchema } from '@ryadom/types';
import { categories, normalizeDocument, normalizeElement, safePhone, safeWebsite, stableId } from '../src/normalize';
import { loadInput } from '../src/input';
import path from 'node:path';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const context = { importedAt: '2026-11-26T23:30:00Z', bounds: [31.7883262, 54.7075603, 32.2095639, 54.850378] as const };
const element = { type: 'node', id: 1, lat: 54.78, lon: 32.04, timestamp: '2025-01-01T00:00:00Z', tags: { name: 'TEST ONLY', amenity: 'cafe' } };
const boundary = { type: 'relation', id: 3339993, tags: { name: 'Смоленск', boundary: 'place', place: 'city' }, bounds: { minlon: 31.7883262, minlat: 54.7075603, maxlon: 32.2095639, maxlat: 54.850378 } };
const doc = (elements: unknown[]) => ({ osm3s: { timestamp_osm_base: '2026-11-26T23:23:05Z' }, elements: [boundary, ...elements] });

test('composition subpaths expose validated city context and preserve Smolensk compatibility', async () => {
  const publicNormalizer = await import('@ryadom/importer/normalize');
  const publicWriter = await import('@ryadom/importer/apply');
  assert.equal(typeof publicWriter.applyPlaces, 'function');
  assert.equal(typeof publicWriter.assertImportCompatibility, 'function');
  const other = publicNormalizer.normalizeElement(element, 0, { ...context, cityId: 'test-city' });
  assert.equal(other.place?.cityId, 'test-city');
  assert.equal(normalizeElement(element, 0, context).place?.cityId, 'smolensk');
  assert.equal(normalizeDocument(doc([element]), context.importedAt).places[0]?.cityId, 'smolensk');
  for (const cityId of ['', 'near', '../smolensk', 'City', 'x'.repeat(121)]) assert.throws(() => normalizeElement(element, 0, { ...context, cityId }));
  assert.throws(() => normalizeElement(element, 0, { ...context, bounds: [32, 55, 31, 54] }));
  assert.throws(() => normalizeElement(element, 0, { ...context, importedAt: 'invalid' }));
});

test('normalizes source identity, provenance, unknown facts; never imports media or ratings', () => {
  const result = normalizeElement({ ...element, tags: { ...element.tags, opening_hours: '24/7', rating: '5', image: 'https://example.com/image.jpg', stars: '5', reviews: '100' } }, 0, context);
  assert.ok(result.place); PlaceSchema.parse(result.place);
  assert.equal(result.place.slug, 'place-osm-node-1'); assert.equal(result.place.openingState, 'unknown');
  assert.equal(result.place.hoursVerifiedAt, null); assert.equal(result.place.openingHours, '24/7');
  assert.equal(result.place.rating, null); assert.deepEqual(result.place.photos, []); assert.equal(result.place.address, 'Адрес не указан в OSM');
  assert.equal(result.place.provenance[0]?.sourceRecordId, 'node/1'); assert.equal(result.place.provenance[0]?.sourceUpdatedAt, element.timestamp);
  assert.equal(stableId('node/1'), result.place.id); assert.notEqual(stableId('way/1'), result.place.id);
});
test('14 asset categories have explicit tag mappings', () => {
  const tags = [{ amenity: 'cafe' }, { shop: 'supermarket' }, { amenity: 'pharmacy' }, { amenity: 'clinic' }, { shop: 'hairdresser' }, { shop: 'car_repair' }, { leisure: 'fitness_centre' }, { tourism: 'hotel' }, { tourism: 'museum' }, { amenity: 'bank' }, { amenity: 'school' }, { office: 'government' }, { craft: 'shoemaker' }, { amenity: 'fuel' }];
  assert.deepEqual(tags.flatMap(tag => categories(tag as Record<string, string>)), [...CATEGORY_IDS]);
  assert.deepEqual(categories({ shop: 'vacant' }), []); assert.deepEqual(categories({ natural: 'tree' }), []);
  assert.deepEqual(categories({ shop: 'chemist' }), ['shopping']);
});
test('contact URLs and phones discard malformed or dangerous values', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'file:///tmp/file', 'https://user:pass@example.com', 'https://127.0.0.1/', 'https://localhost', 'https://[::1]', 'https://example.com/\nfoo', 'https:example.com', 'https://example.com\\other', 'example.com', '//example.com']) assert.equal(safeWebsite(value), null, value);
  assert.equal(safeWebsite('https://example.com/путь'), 'https://example.com/путь');
  for (const value of ['+7 111; +7 222', 'tel:+79999999999', '<script>', '+7999999999999999999']) assert.equal(safePhone(value), null);
  assert.equal(safePhone('+7 (4812) 12-34-56'), '+7 (4812) 12-34-56');
  const output = normalizeElement({ ...element, tags: { ...element.tags, website: 'javascript:alert(1)', phone: 'bad' } }, 0, context);
  assert.equal(output.place?.website, null); assert.equal(output.place?.phone, null);
  assert.ok(output.issues.some(issue => issue.code === 'discarded_website'));
});
test('way/relation use real centers; missing, swapped, nonfinite and out-of-region coordinates reject', () => {
  assert.deepEqual(normalizeElement({ ...element, type: 'way', center: { lat: element.lat, lon: element.lon } }, 0, context).place?.coordinates, { lon: element.lon, lat: element.lat });
  for (const invalid of [{ ...element, type: 'way' }, { ...element, lon: NaN }, { ...element, lat: 91 }, { ...element, lon: element.lat, lat: element.lon }]) assert.equal(normalizeElement(invalid, 0, context).place, null);
});
test('bounded identity, tags, dates, text and private/closed sources reject', () => {
  const inputs = [null, { ...element, id: 0 }, { ...element, id: Number.MAX_SAFE_INTEGER + 1 }, { ...element, timestamp: undefined }, { ...element, tags: { name: 'x'.repeat(201), amenity: 'cafe' } }, { ...element, tags: { amenity: 'cafe' } }, { ...element, tags: { ...element.tags, name: 12 } }, { ...element, tags: { ...element.tags, access: 'private' } }, { ...element, tags: { ...element.tags, disused: 'yes' } }];
  for (const invalid of inputs) assert.equal(normalizeElement(invalid, 0, context).place, null);
});
test('address is made only from real tags', () => {
  const output = normalizeElement({ ...element, tags: { ...element.tags, 'addr:street': 'TEST STREET', 'addr:housenumber': '8' } }, 0, context);
  assert.equal(output.place?.address, 'TEST STREET, 8');
});
test('source ID dedup and name proximity queue preserve separate places', () => {
  const output = normalizeDocument(doc([element, element, { ...element, id: 2, lon: element.lon + 0.0001 }]), context.importedAt);
  assert.equal(output.places.length, 2); assert.equal(output.candidates.length, 1);
  assert.ok(output.issues.some(issue => issue.code === 'duplicate_source_record'));
  assert.ok(output.candidates[0]!.distanceMeters < 50);
});
test('partial upstream documents, wrong boundary and excessive arrays fail closed', () => {
  for (const invalid of [null, { ...doc([element]), remark: 'runtime error' }, doc(new Array(20_001)), doc([]).elements, { osm3s: {}, elements: [element] }]) assert.throws(() => normalizeDocument(invalid, context.importedAt));
});
test('real checked-in replay checksum and normalized contracts pass with zero network', async () => {
  const root = path.resolve(__dirname, '../../..');
  const loaded = await loadInput(path.join(root, 'data/osm/smolensk-replay.json'), path.join(root, 'data/osm/source-manifest.json'), context.importedAt);
  assert.equal(loaded.inputCount, 2734); assert.ok(loaded.places.length > 1000);
  for (const place of loaded.places) { PlaceSchema.parse(place); assert.equal(place.rating, null); assert.equal(place.photos.length, 0); }
});
test('changed source bytes and unapproved licensing fail manifest verification', async () => {
  const root = path.resolve(__dirname, '../../..');
  const source = path.join(root, 'data/osm');
  const temporary = await mkdtemp(path.join(tmpdir(), 'ryadom-import-manifest-'));
  const file = path.join(temporary, 'input.json'); const manifestFile = path.join(temporary, 'manifest.json');
  try {
    const bytes = await readFile(path.join(source, 'smolensk-replay.json'));
    const manifest = JSON.parse(await readFile(path.join(source, 'source-manifest.json'), 'utf8'));
    await writeFile(manifestFile, JSON.stringify(manifest)); await writeFile(file, Buffer.concat([bytes, Buffer.from(' ')]));
    await assert.rejects(loadInput(file, manifestFile, context.importedAt), /manifest mismatch/);
    await writeFile(file, bytes); await writeFile(manifestFile, JSON.stringify({ ...manifest, license: 'unknown' }));
    await assert.rejects(loadInput(file, manifestFile, context.importedAt), /manifest mismatch/);
  } finally { await unlink(file); await unlink(manifestFile); await rmdir(temporary); }
});
