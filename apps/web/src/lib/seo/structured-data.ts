import 'server-only';
import { CATEGORIES, HttpUrlSchema, PlaceSchema, type Place } from '@ryadom/types';
import { getSeoConfig, type SeoConfig } from './config';
import { canonicalUrl, placePath } from './routes';
import type { JsonLdValue } from './serialize';

type JsonLd = { [key: string]: JsonLdValue };
const BUSINESS_CATEGORIES = new Set(['cafe', 'shopping', 'pharmacy', 'beauty', 'auto', 'hotel', 'bank', 'services', 'fuel']);

function safeExternalUrl(value: string | null): string | null {
  if (!value || /[\u0000-\u0020\u007f\\]/u.test(value) || !HttpUrlSchema.safeParse(value).success) return null;
  const url = new URL(value);
  // Links only, never fetched. Do not repeat tracking parameters or fragments into structured data.
  url.search = ''; url.hash = '';
  return url.href;
}

export function createWebsiteJsonLd(config: SeoConfig = getSeoConfig()): JsonLd | null {
  const url = config.indexable ? canonicalUrl(config.origin, '/') : null;
  return url ? { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${url}#website`, url, name: 'Рядом by Patchvale', inLanguage: 'ru' } : null;
}

export function createPlaceJsonLd(input: Place, config: SeoConfig = getSeoConfig()): JsonLd | null {
  const parsed = PlaceSchema.safeParse(input);
  if (!parsed.success || !config.indexable) return null;
  const place = parsed.data;
  const path = placePath(place.slug);
  const url = path ? canonicalUrl(config.origin, path) : null;
  if (!url) return null;
  // Inspect original strings as URL parsers may silently remove embedded tabs/newlines.
  const website = safeExternalUrl(input.website);
  const sources = [...new Set(place.provenance.flatMap((_, index) => {
    const sourceUrl = safeExternalUrl(input.provenance[index]?.sourceUrl ?? null);
    return sourceUrl ? [sourceUrl] : [];
  }))];
  const telephone = place.phone?.replace(/[ ()-]/gu, '');
  return {
    '@context': 'https://schema.org',
    // Broad categories include parks/public services; never assert that every catalog object is a business.
    '@type': place.categoryIds.every(id => BUSINESS_CATEGORIES.has(id)) ? 'LocalBusiness' : 'Place',
    '@id': url, url, name: place.name, address: place.address,
    geo: { '@type': 'GeoCoordinates', latitude: place.coordinates.lat, longitude: place.coordinates.lon },
    additionalProperty: CATEGORIES.filter(category => place.categoryIds.includes(category.id)).map(category => ({ '@type': 'PropertyValue', name: 'Категория', value: category.name })),
    ...(place.description?.trim() ? { description: place.description } : {}),
    ...(website ? { sameAs: [website] } : {}),
    ...(telephone && /^\+?\d{5,15}$/u.test(telephone) ? { telephone } : {}),
    ...(sources.length ? { subjectOf: sources.map(source => ({ '@type': 'CreativeWork', url: source })) } : {}),
    // Free-form OSM hours cannot safely become schema OpeningHoursSpecification.
    // Rating.source is text, not evidence of licensing/verification: omit all ratings/reviews in stage 1.
  };
}

export function createPlaceBreadcrumbJsonLd(input: Place, config: SeoConfig = getSeoConfig()): JsonLd | null {
  const parsed = PlaceSchema.safeParse(input);
  if (!parsed.success || !config.indexable) return null;
  const home = canonicalUrl(config.origin, '/');
  const path = placePath(parsed.data.slug);
  const item = path ? canonicalUrl(config.origin, path) : null;
  if (!home || !item) return null;
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: home },
      { '@type': 'ListItem', position: 2, name: parsed.data.name, item },
    ],
  };
}
