import { createHash } from 'node:crypto';
import { BoundingBoxSchema, SlugSchema, CategoryIdSchema, CoordinatesSchema, DateTimeSchema, HttpUrlSchema, PlaceSchema, distanceBetween, type CategoryId, type Place } from '@ryadom/types';

export const LICENSE = 'ODbL-1.0';
export const NORMALIZER_REVISION = 2;
export const ATTRIBUTION = '© OpenStreetMap contributors';
export const MAX_ELEMENTS = 20_000;
export type Issue = { row: number; sourceRecordId: string | null; severity: 'error' | 'warning' | 'skip'; code: string };
export type MatchCandidate = { left: string; right: string; distanceMeters: number; reason: 'same_name_within_50m' };
type Tags = Record<string, string>;
/** Operator-selected city; caller must verify it against the enabled city registry and source geometry.
 * Omission retains the initial Smolensk adapter's historical behavior only. */
export type Context = { cityId?: string; importedAt: string; bounds: readonly [number, number, number, number] };
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isOneOf = (value: string | undefined, list: string[]) => value !== undefined && list.includes(value);

export function categories(tags: Tags): CategoryId[] {
  const result = new Set<CategoryId>();
  const amenity = tags.amenity;
  if (isOneOf(amenity, ['cafe', 'restaurant', 'fast_food', 'food_court', 'bar', 'pub'])) result.add('cafe');
  if (amenity === 'pharmacy') result.add('pharmacy');
  if (isOneOf(amenity, ['hospital', 'clinic', 'doctors', 'dentist', 'veterinary'])) result.add('medicine');
  if (isOneOf(tags.shop, ['beauty', 'hairdresser', 'cosmetics', 'massage'])) result.add('beauty');
  if (isOneOf(tags.shop, ['car', 'car_repair', 'car_parts', 'tyres', 'motorcycle']) || isOneOf(amenity, ['car_wash', 'car_rental'])) result.add('auto');
  if (isOneOf(tags.leisure, ['fitness_centre', 'sports_centre', 'stadium', 'swimming_pool'])) result.add('sport');
  if (isOneOf(tags.tourism, ['hotel', 'motel', 'hostel', 'guest_house'])) result.add('hotel');
  if (isOneOf(tags.tourism, ['museum', 'attraction', 'gallery']) || isOneOf(amenity, ['cinema', 'theatre', 'arts_centre']) || tags.leisure === 'amusement_arcade') result.add('entertainment');
  if (isOneOf(amenity, ['bank', 'atm'])) result.add('bank');
  if (isOneOf(amenity, ['school', 'kindergarten', 'university', 'college', 'library'])) result.add('education');
  if (isOneOf(amenity, ['townhall', 'police', 'post_office', 'courthouse']) || tags.office === 'government') result.add('government');
  if (tags.craft || isOneOf(tags.office, ['insurance', 'travel_agent', 'lawyer', 'accountant']) || isOneOf(tags.shop, ['laundry', 'dry_cleaning', 'copyshop', 'travel_agency', 'funeral_directors'])) result.add('services');
  if (amenity === 'fuel') result.add('fuel');
  if (tags.shop && !['no', 'vacant', 'closed', 'disused'].includes(tags.shop) && result.size === 0) result.add('shopping');
  return [...result].map(value => CategoryIdSchema.parse(value));
}

export function safeWebsite(value: string): string | null {
  // Source contacts are display links only. Never fetched by this package.
  if (!/^https?:\/\//.test(value) || /\s|[\\\u0000-\u001f\u007f]/u.test(value)) return null;
  const parsed = HttpUrlSchema.safeParse(value);
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local') || /^\[|^\d+(?:\.\d+){3}$/.test(url.hostname) || !url.hostname.includes('.')) return null;
  return parsed.data;
}

export function safePhone(value: string): string | null {
  const phone = value.trim();
  const digits = phone.replace(/\D/g, '');
  return /^\+?[0-9 ()-]{5,30}$/.test(phone) && digits.length >= 5 && digits.length <= 15 ? phone : null;
}

export function stableId(record: string): string {
  const hex = createHash('sha256').update(`ryadom:osm:${record}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function normalizeElement(input: unknown, row: number, context: Context): { place: Place | null; issues: Issue[] } {
  // Invalid operator context is a fatal configuration error, not a rejected source row.
  const cityId = SlugSchema.parse(context.cityId ?? 'smolensk');
  DateTimeSchema.parse(context.importedAt);
  BoundingBoxSchema.parse(context.bounds);
  const issues: Issue[] = [];
  let record: string | null = null;
  const issue = (severity: Issue['severity'], code: string) => { issues.push({ row, sourceRecordId: record, severity, code }); };
  if (!object(input) || !['node', 'way', 'relation'].includes(String(input.type)) || !Number.isSafeInteger(input.id) || Number(input.id) <= 0) { issue('error', 'invalid_identity'); return { place: null, issues }; }
  record = `${input.type}/${input.id}`;
  if (!object(input.tags) || Object.keys(input.tags).length > 500 || Object.entries(input.tags).some(([key, value]) => key.length > 255 || typeof value !== 'string' || value.length > 10_000)) { issue('error', 'invalid_tags'); return { place: null, issues }; }
  const tags = input.tags as Tags;
  const categoryIds = categories(tags);
  if (!categoryIds.length || ['disused', 'abandoned', 'demolished', 'razed', 'construction'].some(key => ['yes', 'true', '1'].includes(tags[key] ?? '')) || tags.shop === 'vacant' || tags.shop === 'closed' || ['no', 'private'].includes(tags.access ?? '')) { issue('skip', 'unsupported_or_unavailable'); return { place: null, issues }; }
  const name = (tags['name:ru'] ?? tags.name)?.trim();
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(name)) { issue('error', 'missing_or_invalid_name'); return { place: null, issues }; }
  const coordinates = CoordinatesSchema.safeParse(input.type === 'node' ? { lon: input.lon, lat: input.lat } : input.center);
  if (!coordinates.success) { issue('error', 'invalid_coordinates'); return { place: null, issues }; }
  const { lon, lat } = coordinates.data;
  const [west, south, east, north] = context.bounds;
  if (lon < west || lon > east || lat < south || lat > north) { issue('error', 'outside_source_bounds'); return { place: null, issues }; }
  const timestamp = DateTimeSchema.safeParse(input.timestamp);
  if (!timestamp.success) { issue('error', 'missing_source_timestamp'); return { place: null, issues }; }
  let website: string | null = null;
  const rawWebsite = tags['contact:website'] ?? tags.website;
  if (rawWebsite) { website = safeWebsite(rawWebsite); if (!website) issue('warning', 'discarded_website'); }
  let phone: string | null = null;
  const rawPhone = tags['contact:phone'] ?? tags.phone;
  if (rawPhone) { phone = safePhone(rawPhone); if (!phone) issue('warning', 'discarded_phone'); }
  const addressParts = [tags['addr:postcode'], tags['addr:city'], tags['addr:street'] ?? tags['addr:place'], tags['addr:housenumber'], tags['addr:unit']].filter((part): part is string => Boolean(part?.trim()));
  let address = tags['addr:full']?.trim() || addressParts.join(', ');
  if (!address) { address = 'Адрес не указан в OSM'; issue('warning', 'address_unknown'); }
  if (address.length > 500 || /[\u0000-\u001f\u007f]/u.test(address)) { issue('error', 'invalid_address'); return { place: null, issues }; }
  let openingHours = tags.opening_hours ?? null;
  if (openingHours && (openingHours.length > 2000 || /[\u0000-\u001f\u007f]/u.test(openingHours))) { openingHours = null; issue('warning', 'discarded_hours'); }
  const place = PlaceSchema.safeParse({
    id: stableId(record), slug: `place-osm-${input.type}-${input.id}`, name, cityId, categoryIds,
    address, coordinates: coordinates.data, description: null, phone, website, openingState: 'unknown', openingHours,
    hoursVerifiedAt: null, accessibility: isOneOf(tags.wheelchair, ['yes', 'limited', 'no']) ? tags.wheelchair : 'unknown',
    rating: null, photos: [], provenance: [{ sourceId: 'osm', sourceRecordId: record, sourceUrl: `https://www.openstreetmap.org/${record}`,
      license: LICENSE, attribution: ATTRIBUTION, sourceUpdatedAt: timestamp.data, importedAt: context.importedAt }], updatedAt: context.importedAt,
  });
  if (!place.success) { issue('error', 'contract_validation'); return { place: null, issues }; }
  return { place: place.data, issues };
}

export function normalizeDocument(input: unknown, importedAt: string) {
  DateTimeSchema.parse(importedAt);
  if (!object(input) || input.remark || !Array.isArray(input.elements) || input.elements.length > MAX_ELEMENTS || !object(input.osm3s)) throw new Error('Invalid/partial/oversized Overpass document');
  const sourceUpdatedAt = DateTimeSchema.parse(input.osm3s.timestamp_osm_base);
  const boundaries = input.elements.filter(element => object(element) && object(element.tags) && element.type === 'relation' && element.id === 3339993 && element.tags.name === 'Смоленск' && element.tags.boundary === 'place' && element.tags.place === 'city');
  if (boundaries.length !== 1) throw new Error('Exactly one verified Smolensk city boundary relation/3339993 required');
  const boundary = boundaries[0] as Record<string, unknown>;
  if (!object(boundary.bounds)) throw new Error('Boundary bounds missing');
  const b = boundary.bounds;
  const southwest = CoordinatesSchema.parse({ lon: b.minlon, lat: b.minlat });
  const northeast = CoordinatesSchema.parse({ lon: b.maxlon, lat: b.maxlat });
  const bounds = [southwest.lon, southwest.lat, northeast.lon, northeast.lat] as const;
  if (southwest.lon >= northeast.lon || southwest.lat >= northeast.lat || northeast.lon - southwest.lon > 1 || northeast.lat - southwest.lat > 1) throw new Error('Invalid city extraction bounds');
  const context = { cityId: 'smolensk', importedAt, bounds };
  const places: Place[] = []; const issues: Issue[] = []; const seen = new Set<string>();
  for (const [row, element] of input.elements.entries()) {
    if (element === boundary) continue;
    const result = normalizeElement(element, row, context);
    issues.push(...result.issues);
    if (!result.place) continue;
    const record = result.place.provenance[0]!.sourceRecordId;
    if (seen.has(record)) { issues.push({ row, sourceRecordId: record, severity: 'error', code: 'duplicate_source_record' }); continue; }
    seen.add(record); places.push(result.place);
  }
  // Bounded input and spatial bins avoid a quadratic all-pairs scan of the city.
  const bins = new Map<string, Place[]>(); const candidates: MatchCandidate[] = [];
  let candidateComparisons = 0; let reviewQueueTruncated = false;
  for (const place of places) {
    const name = place.name.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
    const x = Math.floor(place.coordinates.lon / 0.001), y = Math.floor(place.coordinates.lat / 0.001);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const other of bins.get(`${name}|${x + dx}|${y + dy}`) ?? []) {
        if (candidateComparisons >= 100_000 || candidates.length >= 20_000) { reviewQueueTruncated = true; break; }
        candidateComparisons++;
        const distanceMeters = distanceBetween(place.coordinates, other.coordinates);
        if (distanceMeters <= 50 && candidates.length < 20_000) candidates.push({ left: other.provenance[0]!.sourceRecordId, right: place.provenance[0]!.sourceRecordId, distanceMeters, reason: 'same_name_within_50m' });
      }
    }
    const key = `${name}|${x}|${y}`; const bin = bins.get(key) ?? []; bin.push(place); bins.set(key, bin);
  }
  return { places, issues, candidates, reviewQueueTruncated, bounds, boundaryRecordId: `relation/${boundary.id}`, sourceUpdatedAt, inputCount: input.elements.length };
}
