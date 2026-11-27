import { z } from 'zod';

export const CONTRACT_VERSION = '1.0.0';
export const API_PREFIX = '/api/v1';
export const LIMITS = Object.freeze({ radiusMin: 300, radiusMax: 10_000, pageMax: 100, limitMax: 50, routeSpanMeters: 100_000 });
const text = (max: number) => z.string().trim().min(1).max(max);
export const SlugSchema = z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine(v => v !== 'near', 'Reserved path segment');
export const IdSchema = z.uuid();
export const DateTimeSchema = z.iso.datetime({ offset: true });
export const HttpUrlSchema = z.url().max(2048).refine(v => {
  try {
    const url = new URL(v);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}, 'HTTP(S) URL without credentials required');
export const LongitudeSchema = z.number().min(-180).max(180);
export const LatitudeSchema = z.number().min(-90).max(90);
export const CoordinatesSchema = z.strictObject({ lon: LongitudeSchema, lat: LatitudeSchema });
export const PositionSchema = z.tuple([LongitudeSchema, LatitudeSchema]);
export const BoundingBoxSchema = z.tuple([LongitudeSchema, LatitudeSchema, LongitudeSchema, LatitudeSchema])
  .refine(([w, s, e, n]) => w < e && s < n, 'Non-crossing west,south,east,north bounds required');

export const CATEGORY_IDS = ['cafe', 'shopping', 'pharmacy', 'medicine', 'beauty', 'auto', 'sport', 'hotel', 'entertainment', 'bank', 'education', 'government', 'services', 'fuel'] as const;
export const CategoryIdSchema = z.enum(CATEGORY_IDS);
export const CategorySchema = z.strictObject({ id: CategoryIdSchema, name: text(80), icon: z.string().regex(/^\/assets\/icons\/tile-[a-z]+\.svg$/), marker: z.string().regex(/^\/assets\/markers\/[a-z]+\.svg$/) });
const categoryNames = ['Кафе', 'Магазины', 'Аптеки', 'Медицина', 'Красота', 'Авто', 'Спорт', 'Гостиницы', 'Развлечения', 'Банки', 'Образование', 'Госуслуги', 'Бытовые услуги', 'АЗС'];
export const CATEGORIES: readonly z.infer<typeof CategorySchema>[] = Object.freeze(CATEGORY_IDS.map((id, i) => CategorySchema.parse({ id, name: categoryNames[i], icon: `/assets/icons/tile-${id}.svg`, marker: `/assets/markers/${id}.svg` })));
export const CitySchema = z.strictObject({ id: SlugSchema, name: text(120), region: text(120), countryCode: z.literal('RU'), center: CoordinatesSchema, bounds: BoundingBoxSchema, timezone: text(80), enabled: z.boolean() });
export const ProvenanceSchema = z.strictObject({ sourceId: text(100), sourceRecordId: text(200), sourceUrl: HttpUrlSchema.nullable(), license: text(200), attribution: text(500), sourceUpdatedAt: DateTimeSchema.nullable(), importedAt: DateTimeSchema });
export const OpeningStateSchema = z.enum(['open', 'closed', 'unknown']);
export const AccessibilitySchema = z.enum(['yes', 'limited', 'no', 'unknown']);
export const RatingSchema = z.strictObject({ value: z.number().min(0).max(5), count: z.number().int().positive(), source: text(100) });
export const PhotoSchema = z.strictObject({ url: HttpUrlSchema, alt: text(300), attribution: text(500), license: text(200), sourceUrl: HttpUrlSchema.nullable() });
export const PlaceSchema = z.strictObject({
  id: IdSchema, slug: SlugSchema, name: text(200), cityId: SlugSchema, categoryIds: z.array(CategoryIdSchema).min(1).max(14),
  address: text(500), coordinates: CoordinatesSchema, description: z.string().max(5000).nullable(),
  phone: z.string().regex(/^\+?[0-9 ()-]{5,30}$/).nullable(), website: HttpUrlSchema.nullable(),
  openingState: OpeningStateSchema, openingHours: z.string().max(2000).nullable(), hoursVerifiedAt: DateTimeSchema.nullable(),
  accessibility: AccessibilitySchema, rating: RatingSchema.nullable(), photos: z.array(PhotoSchema).max(20),
  provenance: z.array(ProvenanceSchema).min(1).max(20), updatedAt: DateTimeSchema
}).refine(p => p.openingState === 'unknown' || (p.openingHours !== null && p.hoursVerifiedAt !== null), 'Known opening state requires verified hours');
export const NearbyPlaceSchema = PlaceSchema.safeExtend({ distanceMeters: z.number().nonnegative() });

export const PaginationQuerySchema = z.strictObject({ page: z.number().int().min(1).max(100).default(1), limit: z.number().int().min(1).max(50).default(20) });
export const PlacesQuerySchema = PaginationQuerySchema.extend({ city: SlugSchema, lon: LongitudeSchema, lat: LatitudeSchema, radius: z.number().int().min(300).max(10_000).default(1500), category: CategoryIdSchema.optional(), q: z.string().trim().min(2).max(200).optional(), openNow: z.boolean().default(false), accessibility: z.enum(['yes', 'limited', 'no']).optional(), rating: z.number().min(0).max(5).optional() });
// Parse only complete scalar strings. In particular Boolean('false') and Number('') are forbidden.
const numericQuery = z.string().regex(/^-?(?:\d+\.?\d*|\.\d+)$/).transform(Number);
const booleanQuery = z.enum(['true', 'false']).transform(v => v === 'true');
export const PlacesQueryInputSchema = z.strictObject({ city: SlugSchema, lon: numericQuery, lat: numericQuery, radius: numericQuery.optional(), category: CategoryIdSchema.optional(), q: z.string().optional(), openNow: booleanQuery.optional(), accessibility: z.enum(['yes', 'limited', 'no']).optional(), rating: numericQuery.optional(), page: numericQuery.optional(), limit: numericQuery.optional() }).pipe(PlacesQuerySchema);
export const GeocodeQuerySchema = z.strictObject({ q: z.string().trim().min(3).max(200), city: SlugSchema });
export const CityQuerySchema = z.strictObject({ city: SlugSchema.optional() });
export const ReviewsQuerySchema = PaginationQuerySchema;
export const ReviewsQueryInputSchema = z.strictObject({ page: numericQuery.optional(), limit: numericQuery.optional() }).pipe(ReviewsQuerySchema);
export const SlugParamsSchema = z.strictObject({ slug: SlugSchema });
export const PaginationSchema = z.strictObject({ page: z.number().int().min(1).max(100), limit: z.number().int().min(1).max(50), total: z.number().int().nonnegative(), hasMore: z.boolean() });
export const PlacesPageSchema = z.strictObject({ items: z.array(NearbyPlaceSchema).max(50), pagination: PaginationSchema });
export const ProviderNameSchema = z.enum(['catalog', 'map', 'geocoder', 'router', 'reports']);
export const UnavailableReasonSchema = z.enum(['not_configured', 'disabled', 'timeout', 'upstream_error', 'coverage_missing']);
export const ProviderUnavailableSchema = z.strictObject({ status: z.literal('unavailable'), provider: ProviderNameSchema, reason: UnavailableReasonSchema, message: text(500) });
export const GeocodeItemSchema = z.strictObject({ id: text(200), label: text(500), coordinates: CoordinatesSchema, bounds: BoundingBoxSchema.nullable(), provenance: ProvenanceSchema });
export const GeocodeResultSchema = z.strictObject({ items: z.array(GeocodeItemSchema).max(10), provider: z.enum(['nominatim', 'pelias']), attribution: text(500) });
export const RouteModeSchema = z.enum(['walking', 'driving', 'cycling']);
export function distanceBetween(a: z.infer<typeof CoordinatesSchema>, b: z.infer<typeof CoordinatesSchema>): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export const RouteRequestSchema = z.strictObject({ origin: CoordinatesSchema, destination: CoordinatesSchema, mode: RouteModeSchema })
  .refine(r => distanceBetween(r.origin, r.destination) <= LIMITS.routeSpanMeters, 'Endpoints must be within 100 km');
export const LineStringSchema = z.strictObject({ type: z.literal('LineString'), coordinates: z.array(PositionSchema).min(2).max(20_000) });
export const ManeuverSchema = z.strictObject({ instruction: text(1000), type: text(80), location: CoordinatesSchema, beginShapeIndex: z.number().int().nonnegative(), endShapeIndex: z.number().int().nonnegative(), distanceMeters: z.number().nonnegative(), durationSeconds: z.number().nonnegative() });
export const RouteResultSchema = z.strictObject({ provider: z.literal('valhalla'), mode: RouteModeSchema, geometry: LineStringSchema, maneuvers: z.array(ManeuverSchema).min(1).max(2000), distanceMeters: z.number().nonnegative(), durationSeconds: z.number().nonnegative(), attribution: text(500) })
  .refine(r => r.maneuvers.every(m => m.beginShapeIndex <= m.endShapeIndex && m.endShapeIndex < r.geometry.coordinates.length), 'Maneuver indices must reference geometry');
export const MapConfigSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('available'), provider: z.literal('map'), styleUrl: HttpUrlSchema, attribution: text(500), minZoom: z.number().min(0).max(24), maxZoom: z.number().min(0).max(24) }).refine(v => v.minZoom <= v.maxZoom, 'Invalid zoom range'),
  ProviderUnavailableSchema.extend({ provider: z.literal('map') })
]);
export const StatsSchema = z.strictObject({ cityId: SlugSchema.nullable(), measuredAt: DateTimeSchema, metrics: z.array(z.strictObject({ key: z.enum(['places', 'cities', 'users', 'routes', 'partners']), value: z.number().int().nonnegative(), source: text(200) })).max(5) });
export const PlatformReviewSchema = z.strictObject({ id: IdSchema, authorName: text(100), avatarUrl: HttpUrlSchema.nullable(), publishedAt: DateTimeSchema, rating: z.number().int().min(1).max(5), text: text(3000), source: text(200), consentRecordedAt: DateTimeSchema });
export const ReviewsPageSchema = z.strictObject({ items: z.array(PlatformReviewSchema).max(50), pagination: PaginationSchema });
export const ReportRequestSchema = z.strictObject({ placeId: IdSchema, reason: z.enum(['incorrect_address', 'closed', 'incorrect_hours', 'duplicate', 'other']), description: z.string().trim().min(10).max(2000), consent: z.literal(true) });
export const ReportReceiptSchema = z.strictObject({ id: IdSchema, status: z.literal('pending'), receivedAt: DateTimeSchema });
export const MetaSchema = z.strictObject({ requestId: z.uuid(), generatedAt: DateTimeSchema });
export const ErrorCodeSchema = z.enum(['VALIDATION_ERROR', 'NOT_FOUND', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED', 'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'INTERNAL_ERROR']);
export const ApiErrorSchema = z.strictObject({ error: z.strictObject({ code: ErrorCodeSchema, message: text(500), details: z.array(z.strictObject({ path: text(200), message: text(300) })).max(30).optional(), provider: ProviderUnavailableSchema.optional() }), meta: MetaSchema }).refine(v => v.error.code !== 'PROVIDER_UNAVAILABLE' || v.error.provider !== undefined, 'Provider error requires explicit provider state');
export const responseSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data, meta: MetaSchema });
export const CitiesResponseSchema = responseSchema(z.array(CitySchema).max(2000));
export const CategoriesResponseSchema = responseSchema(z.array(CategorySchema).length(14));
export const PlacesResponseSchema = responseSchema(PlacesPageSchema);
export const PlaceResponseSchema = responseSchema(PlaceSchema);
export const StatsResponseSchema = responseSchema(StatsSchema);
export const PlatformReviewsResponseSchema = responseSchema(ReviewsPageSchema);
export const GeocodeResponseSchema = responseSchema(GeocodeResultSchema);
export const RouteResponseSchema = responseSchema(RouteResultSchema);
export const MapConfigResponseSchema = responseSchema(MapConfigSchema);
export const ReportResponseSchema = responseSchema(ReportReceiptSchema);

export type Coordinates = z.infer<typeof CoordinatesSchema>;
export type CategoryId = z.infer<typeof CategoryIdSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type City = z.infer<typeof CitySchema>;
export type Place = z.infer<typeof PlaceSchema>;
export type NearbyPlace = z.infer<typeof NearbyPlaceSchema>;
export type PlacesQuery = z.infer<typeof PlacesQuerySchema>;
export type GeocodeResult = z.infer<typeof GeocodeResultSchema>;
export type RouteRequest = z.infer<typeof RouteRequestSchema>;
export type RouteResult = z.infer<typeof RouteResultSchema>;
export type RouteMode = z.infer<typeof RouteModeSchema>;
export type MapConfig = z.infer<typeof MapConfigSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ProviderUnavailable = z.infer<typeof ProviderUnavailableSchema>;
export type ReportRequest = z.infer<typeof ReportRequestSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type GeocodeQuery = z.infer<typeof GeocodeQuerySchema>;
export type GeocodeItem = z.infer<typeof GeocodeItemSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type PlacesPage = z.infer<typeof PlacesPageSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type PlatformReview = z.infer<typeof PlatformReviewSchema>;
export type ReviewsPage = z.infer<typeof ReviewsPageSchema>;
export type ReportReceipt = z.infer<typeof ReportReceiptSchema>;
export type Maneuver = z.infer<typeof ManeuverSchema>;
export type ApiMeta = z.infer<typeof MetaSchema>;
export type ApiResponse<T> = { data: T; meta: z.infer<typeof MetaSchema> };
