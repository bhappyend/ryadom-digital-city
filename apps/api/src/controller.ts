import { Controller, Get, Post, HttpCode, Inject, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  CATEGORIES, CitySchema, CityQuerySchema, GeocodeQuerySchema, PlacesQueryInputSchema, ReviewsQueryInputSchema,
  SlugParamsSchema, ReportRequestSchema, RouteRequestSchema,
  CitiesResponseSchema, CategoriesResponseSchema, PlacesResponseSchema, PlaceResponseSchema,
  StatsResponseSchema, PlatformReviewsResponseSchema, GeocodeResponseSchema, RouteResponseSchema,
  MapConfigResponseSchema, ReportResponseSchema,
} from '@ryadom/types';
import { ProviderUnavailable as GisUnavailable, InvalidGisInput } from '@ryadom/gis';
import { DEPENDENCIES, type Dependencies, type Catalog } from './dependencies.js';
import { ApiFault, invalid, notFound, unavailable, meta, type ApiRequest } from './errors.js';
import { bounded } from './rate-limit.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalid();
  return parsed.data;
}
function query(req: ApiRequest): Record<string, string> {
  const params = new URL(req.originalUrl, 'http://api.local').searchParams;
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key) || /[\u0000-\u001f\u007f]/u.test(key + value)) throw invalid();
    result[key] = value;
  }
  return result;
}
function envelope(req: ApiRequest, schema: z.ZodType, data: unknown, provider: 'catalog' | 'geocoder' | 'router' | 'reports' | 'map' = 'catalog') {
  const result = schema.safeParse({ data, meta: meta(req) });
  if (!result.success) throw unavailable(provider);
  // Bound serialization before Express sends data. Never emit partially validated DB objects.
  if (Buffer.byteLength(JSON.stringify(result.data)) > 5 * 1024 * 1024) throw unavailable(provider);
  return result.data;
}
@Controller()
export class ApiController {
  private readonly inFlight = { geocoder: 0, router: 0 };
  constructor(@Inject(DEPENDENCIES) private readonly deps: Dependencies) {}
  private async db<T>(work: (catalog: Catalog) => Promise<T>, provider: 'catalog' | 'reports' = 'catalog'): Promise<T> {
    if (!this.deps.catalog) throw unavailable(provider, 'not_configured');
    try { return await bounded(work(this.deps.catalog), 3500, unavailable(provider, 'timeout')); }
    catch (error) { if (error instanceof ApiFault) throw error; throw unavailable(provider); }
  }
  private async gis<T>(provider: 'geocoder' | 'router', work: () => Promise<T>): Promise<T> {
    if (this.inFlight[provider] >= (provider === 'geocoder' ? 4 : 2)) throw new ApiFault(429, 'RATE_LIMITED', 'Слишком много запросов');
    this.inFlight[provider]++;
    try { return await bounded(work(), 5500, unavailable(provider, 'timeout')); }
    catch (error) {
      if (error instanceof ApiFault) throw error;
      if (error instanceof InvalidGisInput) throw invalid();
      if (error instanceof GisUnavailable) {
        if (error.reason === 'no_route') throw notFound();
        const reason = error.reason === 'not_configured' ? 'not_configured' : error.reason === 'invalid_configuration' ? 'disabled' : error.reason === 'timeout' ? 'timeout' : 'upstream_error';
        throw unavailable(provider, reason);
      }
      throw unavailable(provider);
    } finally { this.inFlight[provider]--; }
  }
  @Get('cities')
  async cities(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    return envelope(req, CitiesResponseSchema, await this.db(c => c.cities()));
  }
  @Get('categories')
  categories(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    return envelope(req, CategoriesResponseSchema, CATEGORIES);
  }
  @Get('places/near')
  async nearby(@Req() req: ApiRequest) {
    const input = parse(PlacesQueryInputSchema, query(req));
    return envelope(req, PlacesResponseSchema, await this.db(c => c.nearby(input)));
  }
  @Get('places/:slug')
  async place(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    const input = parse(SlugParamsSchema, req.params);
    const place = await this.db(c => c.place(input.slug));
    if (place === null) throw notFound();
    return envelope(req, PlaceResponseSchema, place);
  }
  @Get('stats')
  async stats(@Req() req: ApiRequest) {
    const input = parse(CityQuerySchema, query(req));
    return envelope(req, StatsResponseSchema, await this.db(c => c.stats(input)));
  }
  @Get('platform-reviews')
  async reviews(@Req() req: ApiRequest) {
    const input = parse(ReviewsQueryInputSchema, query(req));
    return envelope(req, PlatformReviewsResponseSchema, await this.db(c => c.reviews(input)));
  }
  @Get('geocode')
  async geocode(@Req() req: ApiRequest) {
    const input = parse(GeocodeQuerySchema, query(req));
    if (this.deps.config.geocoderDisabled) throw unavailable('geocoder', 'disabled');
    const city = await this.db(c => c.city(input.city));
    if (!city || !city.enabled) throw unavailable('geocoder', 'coverage_missing');
    const verified = CitySchema.safeParse(city);
    if (!verified.success) throw unavailable('catalog');
    return envelope(req, GeocodeResponseSchema, await this.gis('geocoder', () => this.deps.geocoder.search(input.q, verified.data, req.signal)), 'geocoder');
  }
  @Post('routes') @HttpCode(200)
  async route(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    const input = parse(RouteRequestSchema, req.body);
    return envelope(req, RouteResponseSchema, await this.gis('router', () => this.deps.router.route(input, req.signal)), 'router');
  }
  @Get('map/config')
  map(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    return envelope(req, MapConfigResponseSchema, this.deps.config.map, 'map');
  }
  @Post('reports') @HttpCode(202)
  async report(@Req() req: ApiRequest) {
    parse(z.strictObject({}), query(req));
    const input = parse(ReportRequestSchema, req.body);
    const receipt = await this.db(c => c.report(input), 'reports');
    if (receipt === null) throw notFound();
    return envelope(req, ReportResponseSchema, receipt, 'reports');
  }
}

@Controller('health')
export class HealthController {
  constructor(@Inject(DEPENDENCIES) private readonly deps: Dependencies) {}
  @Get() live(@Req() req: ApiRequest) { return { data: { status: 'live' }, meta: meta(req) }; }
  @Get('live') liveness(@Req() req: ApiRequest) { return this.live(req); }
  @Get('ready') async ready(@Req() req: ApiRequest) {
    const database = this.deps.catalog ? await bounded(this.deps.catalog.ready(), 3500, unavailable('catalog', 'timeout')).catch(() => false) : false;
    const redis = await this.deps.limiter.ready();
    if (!database) throw unavailable('catalog', this.deps.catalog ? 'upstream_error' : 'not_configured');
    if (!redis) throw unavailable('reports', this.deps.config.redisUrl ? 'upstream_error' : 'not_configured');
    return { data: { status: 'ready', dependencies: { database: 'available', rateLimiter: 'available',
      map: this.deps.config.map.status, geocoder: this.deps.config.geocoderDisabled ? 'disabled' : this.deps.config.geocoder.baseUrl ? 'configured' : 'not_configured',
      router: this.deps.config.router.baseUrl ? 'configured' : 'not_configured' } }, meta: meta(req) };
  }
}
