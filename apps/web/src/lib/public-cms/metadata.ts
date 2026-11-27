import type { Metadata } from 'next';
import { documentOf, type ContentResult } from './content';

/** Keep canonical and deployment indexing policy; CMS may only restrict indexing. */
export function publishedPageMetadata(base: Metadata, result: ContentResult): Metadata {
  const settings = documentOf(result, 'settings');
  if (!settings) return base;
  return {
    ...base,
    title: { absolute: settings.siteTitle },
    description: settings.description,
    openGraph: { ...base.openGraph, title: settings.siteTitle, description: settings.description },
    ...(settings.indexingEnabled ? {} : { robots: { index: false, follow: false, noarchive: true, nosnippet: true } }),
  };
}
