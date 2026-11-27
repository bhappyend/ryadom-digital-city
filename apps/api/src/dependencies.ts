import type { z } from 'zod';
import type { City, PlacesQuery, ReportRequest, RouteRequest, CityQuerySchema, ReviewsQuerySchema } from '@ryadom/types';
import type { ApiConfig } from './config.js';
import type { RateLimiter } from './rate-limit.js';
import type { AccountsRuntime } from './accounts.js';

/** Repository returns unknown so every DB/provider result must cross a runtime schema boundary. */
export interface Catalog {
  cities(): Promise<unknown>;
  city(id: string): Promise<City | null>;
  nearby(query: PlacesQuery): Promise<unknown>;
  place(slug: string): Promise<unknown | null>;
  stats(query: z.infer<typeof CityQuerySchema>): Promise<unknown>;
  reviews(query: z.infer<typeof ReviewsQuerySchema>): Promise<unknown>;
  report(input: ReportRequest): Promise<unknown | null>;
  ready(): Promise<boolean>;
  close(): Promise<void>;
}
export interface Dependencies {
  accounts?: AccountsRuntime;
  config: ApiConfig;
  catalog: Catalog | undefined;
  limiter: RateLimiter;
  geocoder: { search(q: string, city: City, signal?: AbortSignal): Promise<unknown> };
  router: { route(input: RouteRequest, signal?: AbortSignal): Promise<unknown> };
}
export const DEPENDENCIES = Symbol('API_DEPENDENCIES');
