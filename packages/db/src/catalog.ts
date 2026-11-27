import type { Pool } from 'pg';
import {
  CategorySchema, CitySchema, PlaceSchema, PlacesQuerySchema, PlacesPageSchema,
  SlugSchema, StatsSchema, ReviewsQuerySchema, ReviewsPageSchema, ReportRequestSchema, ReportReceiptSchema,
  type PlacesQuery, type ReportRequest,
} from '@ryadom/types';

export const escapeLike = (input: string): string => input.replace(/[\\%_]/g, '\\$&');
const visible = `p.active AND EXISTS (SELECT 1 FROM cities c WHERE c.id=p.city_id AND c.enabled)
  AND (EXISTS (SELECT 1 FROM source_records sr WHERE sr.place_id=p.id)
    OR EXISTS (SELECT 1 FROM place_admin_metadata m WHERE m.place_id=p.id AND m.published_at IS NOT NULL))`;
const placeJson = `jsonb_build_object(
  'id',p.id,'slug',p.slug,'name',p.name,'cityId',p.city_id,
  'categoryIds',(SELECT jsonb_agg(pc.category_id ORDER BY c.sort_order) FROM place_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.place_id=p.id),
  'address',p.address,'coordinates',jsonb_build_object('lon',ST_X(p.position::geometry),'lat',ST_Y(p.position::geometry)),
  'description',p.description,'phone',p.phone,'website',p.website,
  'openingState','unknown','openingHours',p.opening_hours,'hoursVerifiedAt',p.hours_verified_at,
  'accessibility',p.accessibility,'rating',NULL,'photos','[]'::jsonb,
  'provenance',COALESCE((SELECT jsonb_agg(jsonb_build_object('sourceId',sr.source_id,'sourceRecordId',sr.source_record_id,
    'sourceUrl',sr.source_url,'license',sr.license,'attribution',sr.attribution,
    'sourceUpdatedAt',sr.source_updated_at,'importedAt',sr.imported_at) ORDER BY sr.source_id,sr.source_record_id)
    FROM source_records sr WHERE sr.place_id=p.id),'[]'::jsonb)
    || COALESCE((SELECT m.published_provenance FROM place_admin_metadata m WHERE m.place_id=p.id),'[]'::jsonb), 'updatedAt',p.updated_at)`;

export class CatalogRepository {
  constructor(private readonly pool: Pool) {}

  async listCities() {
    const result = await this.pool.query(`SELECT id,name,region,country_code AS "countryCode",
      jsonb_build_object('lon',ST_X(center::geometry),'lat',ST_Y(center::geometry)) AS center,
      bounds,timezone,enabled FROM cities WHERE enabled ORDER BY id`);
    return result.rows.map(row => CitySchema.parse(row));
  }

  async listCategories() {
    const result = await this.pool.query('SELECT id,name,icon,marker FROM categories ORDER BY sort_order');
    return result.rows.map(row => CategorySchema.parse(row));
  }

  async findPlaceBySlug(slug: string) {
    const result = await this.pool.query(`SELECT ${placeJson} AS place FROM places p WHERE p.slug=$1 AND ${visible}`, [SlugSchema.parse(slug)]);
    return result.rows[0] ? PlaceSchema.parse(result.rows[0].place) : null;
  }

  async searchPlaces(input: PlacesQuery) {
    const q = PlacesQuerySchema.parse(input);
    // One statement/snapshot: an empty page still returns the true filtered count.
    const result = await this.pool.query(String.raw`
      WITH matches AS MATERIALIZED (
        SELECT p.*, ST_Distance(p.position,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) AS distance_meters
        FROM places p WHERE ${visible} AND p.city_id=$1
        AND ST_DWithin(p.position,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,$4)
        AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM place_categories pc WHERE pc.place_id=p.id AND pc.category_id=$5))
        AND ($6::text IS NULL OR (p.name || ' ' || p.address) ILIKE $6 ESCAPE '\')
        AND NOT $7::boolean
        AND ($8::text IS NULL OR p.accessibility=$8)
        AND $9::double precision IS NULL
      ), page AS (
        SELECT * FROM matches ORDER BY distance_meters,id LIMIT $10 OFFSET $11
      )
      SELECT (SELECT count(*)::integer FROM matches) AS total,
        COALESCE((SELECT jsonb_agg(${placeJson} || jsonb_build_object('distanceMeters',p.distance_meters)
          ORDER BY p.distance_meters,p.id) FROM page p),'[]'::jsonb) AS items`,
    [q.city,q.lon,q.lat,q.radius,q.category ?? null,q.q ? `%${escapeLike(q.q)}%` : null,
      q.openNow,q.accessibility ?? null,q.rating ?? null,q.limit,(q.page-1)*q.limit]);
    const row = result.rows[0];
    return PlacesPageSchema.parse({ items: row.items, pagination: {
      page: q.page, limit: q.limit, total: row.total, hasMore: q.page * q.limit < row.total,
    } });
  }

  async getStats(city?: string) {
    const cityId = city === undefined ? null : SlugSchema.parse(city);
    const result = await this.pool.query(`SELECT now() AS measured_at,
      (SELECT count(*)::integer FROM places p WHERE ${visible} AND ($1::text IS NULL OR p.city_id=$1)) AS places,
      (SELECT count(*)::integer FROM cities WHERE enabled AND ($1::text IS NULL OR id=$1)) AS cities`, [cityId]);
    const row = result.rows[0];
    return StatsSchema.parse({ cityId, measuredAt: row.measured_at.toISOString(), metrics: [
      { key: 'places', value: row.places, source: 'PostgreSQL: active places with provenance in enabled cities' },
      { key: 'cities', value: row.cities, source: 'PostgreSQL: enabled cities' },
    ] });
  }

  async listPlatformReviews(input: { page?: number; limit?: number } = {}) {
    const q = ReviewsQuerySchema.parse(input);
    const result = await this.pool.query(`WITH published AS MATERIALIZED (
      SELECT id,author_name,avatar_url,published_at,rating,body,source,consent_recorded_at FROM platform_reviews WHERE status='published' AND published_at <= now()
      UNION ALL
      SELECT r.id,u.display_name,NULL::text,r.published_at,r.rating,r.text,
       CASE WHEN EXISTS(SELECT 1 FROM review_corrections x WHERE x.review_id=r.id) THEN 'Рядом: отзыв пользователя, редакционная корректировка' ELSE 'Рядом: отзыв пользователя' END,c.accepted_at
      FROM account_reviews r JOIN users u ON u.id=r.author_id JOIN account_consents c ON c.id=r.consent_id
      WHERE r.kind='platform' AND r.status='published' AND r.published_at<=now() AND u.status='active'
       AND c.user_id=r.author_id AND c.document='platform_review_publication' AND c.withdrawn_at IS NULL
    ), page AS (SELECT * FROM published ORDER BY published_at DESC,id LIMIT $1 OFFSET $2)
    SELECT (SELECT count(*)::integer FROM published) AS total,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'authorName',author_name,'avatarUrl',avatar_url,
      'publishedAt',published_at,'rating',rating,'text',body,'source',source,'consentRecordedAt',consent_recorded_at)
      ORDER BY published_at DESC,id) FROM page),'[]'::jsonb) AS items`, [q.limit,(q.page-1)*q.limit]);
    const row = result.rows[0];
    return ReviewsPageSchema.parse({items:row.items,pagination:{page:q.page,limit:q.limit,total:row.total,hasMore:q.page*q.limit<row.total}});
  }

  async createReport(input: ReportRequest) {
    const report = ReportRequestSchema.parse(input);
    const result = await this.pool.query(`INSERT INTO reports(place_id,reason,description)
      SELECT p.id,$2,$3 FROM places p WHERE p.id=$1 AND ${visible}
      RETURNING id,status,received_at AS "receivedAt"`, [report.placeId,report.reason,report.description]);
    const row = result.rows[0];
    return row ? ReportReceiptSchema.parse({...row,receivedAt:row.receivedAt.toISOString()}) : null;
  }
}
