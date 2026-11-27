import 'server-only';
import type { Metadata } from 'next';
import { PlaceSchema, type Place } from '@ryadom/types';
import { getSeoConfig, type SeoConfig } from './config';
import { canonicalUrl, placePath, type PublicStaticRoute } from './routes';

const BRAND = 'Рядом by Patchvale';
const DESCRIPTION = 'Поиск организаций по категориям, карта и маршруты. Пилотный город — Смоленск.';
const STATIC_COPY: Record<PublicStaticRoute, { title: string; description: string }> = {
  '/': { title: 'Рядом — всё, что нужно, в вашем городе', description: DESCRIPTION },
  '/map': { title: 'Карта города · Рядом', description: 'Выберите адрес и найдите ближайшие кафе, магазины и услуги.' },
};

function robots(indexable: boolean): Metadata['robots'] {
  return indexable ? { index: true, follow: true } : { index: false, follow: false, noarchive: true, nosnippet: true };
}

export function createLayoutMetadata(config: SeoConfig = getSeoConfig()): Metadata {
  return { title: { default: STATIC_COPY['/'].title, template: '%s · Рядом' }, description: DESCRIPTION, robots: robots(config.indexable) };
}

function pageMetadata(title: string, description: string, path: string | null, indexable: boolean, config: SeoConfig): Metadata {
  const canonical = path ? canonicalUrl(config.origin, path) : null;
  return {
    title: { absolute: title }, description, robots: robots(indexable && canonical !== null),
    // Explicit null clears an inherited canonical if called for invalid data.
    alternates: { canonical },
    openGraph: {
      type: 'website', locale: 'ru_RU', siteName: BRAND, title, description,
      ...(canonical ? { url: canonical } : {}),
      // This is decorative branding, never an organization photo or navigable geography.
      ...(config.origin ? { images: [{ url: new URL('/assets/backgrounds/hero-city.webp', config.origin).href, alt: 'Рядом — декоративная иллюстрация ночного города' }] } : {}),
    },
  };
}

export function createStaticMetadata(path: PublicStaticRoute, options: { hasSearchParams?: boolean } = {}, config: SeoConfig = getSeoConfig()): Metadata {
  const copy = STATIC_COPY[path];
  return pageMetadata(copy.title, copy.description, path, config.indexable && !options.hasSearchParams, config);
}

export function createPlaceMetadata(input: Place, config: SeoConfig = getSeoConfig()): Metadata {
  const parsed = PlaceSchema.safeParse(input);
  if (!parsed.success) return pageMetadata('Организация · Рядом', 'Сведения об организации.', null, false, config);
  const place = parsed.data;
  // No phone/website, search input, rating, inferred opening status or marketing promises in snippets.
  return pageMetadata(`${place.name} · Рядом`, `${place.name}. ${place.address}`.slice(0, 500), placePath(place.slug), config.indexable, config);
}
