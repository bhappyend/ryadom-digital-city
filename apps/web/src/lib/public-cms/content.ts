import { CmsAssetSchema, CmsKeySchema, PublicCmsResponseSchema, type CmsDocument, type CmsAsset } from '@ryadom/accounts-types';
import { api, ServiceError } from '../api';
import type { z } from 'zod';

export type CmsKey = z.infer<typeof CmsKeySchema>;
export type PublicContent = z.infer<typeof PublicCmsResponseSchema>['data'];
export type ContentResult = { status: 'published'; content: PublicContent } | { status: 'missing' | 'unavailable' };
/** Only the published public projection is fetched. No cookies or private CMS revisions. */
export async function loadContent(key: CmsKey, signal?: AbortSignal): Promise<ContentResult> {
  CmsKeySchema.parse(key);
  try {
    const result = await api(`/content/${key}`, PublicCmsResponseSchema, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2500)]) : AbortSignal.timeout(2500),
      credentials: 'omit',
    });
    if (result.data.key !== key) return { status: 'unavailable' };
    return { status: 'published', content: result.data };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: error instanceof ServiceError && error.status === 404 ? 'missing' : 'unavailable' };
  }
}
export function documentOf<K extends CmsDocument['kind']>(result: ContentResult, kind: K): Extract<CmsDocument, { kind: K }> | null {
  return result.status === 'published' && result.content.document.kind === kind
    ? result.content.document as Extract<CmsDocument, { kind: K }> : null;
}
/** Match uploaded IDs too: the path is never an arbitrary remote image fetch target. */
export function approvedAsset(asset: CmsAsset | null | undefined): CmsAsset | null {
  if (!asset || !CmsAssetSchema.safeParse(asset).success) return null;
  if (asset.source === 'uploaded' && asset.url !== `/media/${asset.mediaId}.webp`) return null;
  return asset;
}
export const DEFAULT_CONTACTS = [
  { label: 'Основатель · ВКонтакте', url: 'https://vk.ru/desktopcoder' },
  { label: 'Основатель · Telegram', url: 'https://t.me/desktopcoder' },
  { label: 'Patchvale · ВКонтакте', url: 'https://vk.ru/patchvale' },
  { label: 'Patchvale · Telegram', url: 'https://t.me/patchvale' },
];
