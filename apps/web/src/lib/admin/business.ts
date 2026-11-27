import { z } from 'zod';
import { CitiesResponseSchema } from '@ryadom/types';
import { CmsAssetSchema, MediaAssetSchema, type CmsAsset, type MediaAsset } from '@ryadom/accounts-types';
export function catalogCities(input: unknown) {
  const cities = CitiesResponseSchema.parse(input).data.filter(c => c.enabled);
  return { cities, regions: [...new Set(cities.map(c => c.region))].sort((a, b) => a.localeCompare(b, 'ru')) };
}
export function attachBusinessPhoto(current: CmsAsset[], input: MediaAsset): CmsAsset[] {
  const media = MediaAssetSchema.parse(input);
  if (media.state !== 'ready' || media.purpose !== 'business-photo') throw new Error('Выберите готовое фото бизнеса с подтверждёнными правами.');
  if (current.some(p => p.source === 'uploaded' && p.mediaId === media.id)) throw new Error('Фото уже прикреплено.');
  if (current.length >= 20) throw new Error('К карточке можно прикрепить не более 20 фото.');
  // Empty alt must be completed before a schema-valid save, never infer it from attribution.
  return [...z.array(CmsAssetSchema).max(20).parse(current), { source: 'uploaded', mediaId: media.id, url: media.url, alt: '' }];
}
