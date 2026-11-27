import { AdminRepository, CatalogRepository, createDatabasePool } from '@ryadom/db/compiled';
import { PhotoSchema } from '@ryadom/types';
import type { Catalog } from './dependencies.js';

export function createCatalog(url: string | undefined, publicMediaOrigin?: string): Catalog | undefined {
  if (!url) return undefined;
  const pool = createDatabasePool(url, 'runtime');
  const repository = new CatalogRepository(pool);
  const media = new AdminRepository(pool);
  const photos = async <T extends {id:string;photos:unknown[]}>(place:T):Promise<T> => {
    if (!publicMediaOrigin) return place;
    const refs = await media.getPublishedPlacePhotos(place.id);
    return { ...place, photos: refs.map(photo => PhotoSchema.parse({url:new URL(photo.url,publicMediaOrigin).href,alt:photo.alt,attribution:photo.attribution,license:photo.license,sourceUrl:photo.sourceUrl})) };
  };
  return {
    cities: () => repository.listCities(),
    city: async (id) => (await repository.listCities()).find(city => city.id === id) ?? null,
    nearby: async query => { const result=await repository.searchPlaces(query);return {...result,items:await Promise.all(result.items.map(photos))}; },
    place: async slug => { const result=await repository.findPlaceBySlug(slug);return result?photos(result):null; },
    stats: query => repository.getStats(query.city),
    reviews: query => repository.listPlatformReviews(query),
    report: input => repository.createReport(input),
    ready: async () => { try { await pool.query('SELECT 1'); return true; } catch { return false; } },
    close: () => pool.end(),
  };
}
