import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Place } from '@ryadom/types';

// Next handles this marker internally. Vitest runs the pure server functions without an RSC compiler.
vi.mock('server-only', () => ({}));
import { getSeoConfig, validateSiteOrigin } from './config';
import { canonicalUrl, PUBLIC_STATIC_ROUTES } from './routes';
import { createRobots, createSitemap } from './crawling';
import { createLayoutMetadata, createPlaceMetadata, createStaticMetadata } from './metadata';
import { createPlaceBreadcrumbJsonLd, createPlaceJsonLd, createWebsiteJsonLd } from './structured-data';
import { serializeJsonLd } from './serialize';
import robotsRoute from '../../app/robots';
import sitemapRoute from '../../app/sitemap';

// Synthetic transport fixture, never public catalog content or a proposed production domain.
const env = { NODE_ENV: 'production', SITE_ENVIRONMENT: 'production', SEO_INDEXING_ENABLED: 'true', PUBLIC_SITE_URL: 'https://seo-fixture.ru' };
const production = getSeoConfig(env);
function fixture(overrides: Partial<Place> = {}): Place {
  return {
    id: '00000000-0000-4000-8000-000000000001', slug: 'seo-fixture', name: 'Тест сериализации', cityId: 'smolensk', categoryIds: ['cafe'],
    address: 'Тестовый адрес', coordinates: { lon: 32, lat: 54 }, description: null, phone: null, website: null,
    openingState: 'unknown', openingHours: null, hoursVerifiedAt: null, accessibility: 'unknown', rating: null, photos: [],
    provenance: [{ sourceId: 'test', sourceRecordId: 'test', sourceUrl: null, license: 'test-only', attribution: 'Unit fixture', sourceUpdatedAt: null, importedAt: '2026-11-27T00:00:00Z' }],
    updatedAt: '2026-11-27T00:00:00Z', ...overrides,
  };
}
afterEach(() => vi.unstubAllEnvs());

describe('trusted server origin', () => {
  it.each([
    undefined, '', ' https://seo-fixture.ru', 'https://seo-fixture.ru ', 'http://seo-fixture.ru',
    'https://user:pass@seo-fixture.ru', 'https://@seo-fixture.ru', 'https://seo-fixture.ru/path', 'https://seo-fixture.ru/..', 'https://seo-fixture.ru/?q=secret',
    'https://seo-fixture.ru/#fragment', 'https://seo-fixture.ru?', 'https://seo-fixture.ru#', 'https://seo-fixture.ru\\evil',
    'https:seo-fixture.ru', '//seo-fixture.ru', 'javascript:alert(1)', 'https://seo-fixture.ru/%2e',
    'https://example.com', 'https://sub.example.org', 'https://site.test', 'https://site.invalid', 'https://site.local',
    'https://localhost', 'https://127.0.0.1', 'https://10.0.0.1', 'https://[::1]', 'https://internal', 'https://seo-fixture.ru.', 'https://seo-fixture.ru:8443',
  ])('rejects unsafe/unusable origin %s', value => expect(validateSiteOrigin(value)).toBeNull());
  it('accepts a bare HTTPS DNS origin and normalizes the optional root slash', () => {
    expect(validateSiteOrigin('https://seo-fixture.ru/')).toBe('https://seo-fixture.ru');
    expect(validateSiteOrigin('https://SEO-fixture.ru:443')).toBe('https://seo-fixture.ru');
  });
  it('requires every explicit local-development condition and never indexes local hosts', () => {
    const local = { PUBLIC_SITE_URL: 'http://localhost:3000', NODE_ENV: 'development', SITE_ENVIRONMENT: 'development', SEO_ALLOW_LOCALHOST: 'true', SEO_INDEXING_ENABLED: 'true' };
    expect(getSeoConfig(local)).toEqual({ origin: 'http://localhost:3000', indexable: false });
    expect(getSeoConfig({ ...local, SEO_ALLOW_LOCALHOST: 'false' }).origin).toBeNull();
    expect(getSeoConfig({ ...local, NODE_ENV: 'production' }).origin).toBeNull();
    expect(getSeoConfig({ ...local, SITE_ENVIRONMENT: 'staging' }).origin).toBeNull();
  });
  it.each([{}, { ...env, SITE_ENVIRONMENT: 'staging' }, { ...env, SITE_ENVIRONMENT: undefined }, { ...env, SEO_INDEXING_ENABLED: undefined }, { ...env, NODE_ENV: 'test' }])('fails closed unless explicitly approved production', input => expect(getSeoConfig(input).indexable).toBe(false));
});

describe('crawl surfaces and actual routes', () => {
  it('has only real existing static pages and real original branding asset', () => {
    expect(PUBLIC_STATIC_ROUTES).toEqual(['/', '/map']);
    for (const route of PUBLIC_STATIC_ROUTES) {
      expect(existsSync(fileURLToPath(new URL(`../../app${route === '/' ? '' : route}/page.tsx`, import.meta.url)))).toBe(true);
    }
    expect(existsSync(fileURLToPath(new URL('../../../public/assets/backgrounds/hero-city.webp', import.meta.url)))).toBe(true);
  });
  it('never emits speculative place/city URLs, query strings or invented timestamps', () => {
    expect(createSitemap(production)).toEqual([{ url: `${env.PUBLIC_SITE_URL}/` }, { url: `${env.PUBLIC_SITE_URL}/map` }]);
    expect(JSON.stringify(createSitemap(production))).not.toMatch(/lastModified|\?|places|cities|priority/u);
  });
  it('disallows all when staging or unconfigured and emits no sitemap hint', () => {
    for (const config of [getSeoConfig({}), getSeoConfig({ ...env, SITE_ENVIRONMENT: 'staging' })]) {
      expect(createRobots(config)).toEqual({ rules: { userAgent: '*', disallow: '/' } });
      expect(createSitemap(config)).toEqual([]);
    }
  });
  it('excludes private sections and query URLs from crawl policy', () => {
    const robots = createRobots(production);
    expect(robots.sitemap).toBe(`${env.PUBLIC_SITE_URL}/sitemap.xml`);
    expect(robots.rules).toMatchObject({ userAgent: '*', disallow: expect.arrayContaining(['/admin', '/auth', '/business/dashboard', '/api/', '/*?*']) });
  });
  it.each(['/map?lon=32&lat=54', '//evil.ru', '/cities/smolensk', '/places/near', '/places/../../admin', '/business', '/admin'])('rejects unsafe/noncanonical path %s', path => expect(canonicalUrl(production.origin, path)).toBeNull());
  it('reads policy through actual Next entrypoints and stays dynamic', () => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    expect(robotsRoute()).toEqual(createRobots(production));
    expect(sitemapRoute()).toEqual(createSitemap(production));
    vi.stubEnv('SITE_ENVIRONMENT', 'staging');
    expect(robotsRoute()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemapRoute()).toEqual([]);
    for (const name of ['robots', 'sitemap']) expect(readFileSync(new URL(`../../app/${name}.ts`, import.meta.url), 'utf8')).toContain("export const dynamic = 'force-dynamic'");
  });
});

describe('SSR metadata', () => {
  it('layout has no inherited homepage canonical', () => expect(createLayoutMetadata(production).alternates).toBeUndefined());
  it('emits absolute canonical, decorative original OG asset and absolute title', () => {
    const metadata = createStaticMetadata('/map', {}, production);
    expect(metadata.alternates).toEqual({ canonical: `${env.PUBLIC_SITE_URL}/map` });
    expect(metadata.openGraph).toMatchObject({ url: `${env.PUBLIC_SITE_URL}/map`, images: [{ url: `${env.PUBLIC_SITE_URL}/assets/backgrounds/hero-city.webp`, alt: expect.stringContaining('декоративная') }] });
    expect(metadata.title).toEqual({ absolute: 'Карта города · Рядом' });
    expect(metadata.robots).toMatchObject({ index: true });
    expect(createStaticMetadata('/map', { hasSearchParams: true }, production).robots).toMatchObject({ index: false });
  });
  it('has no fallback production canonical and noindex without setup', () => {
    const metadata = createStaticMetadata('/', {}, getSeoConfig({}));
    expect(metadata.alternates).toEqual({ canonical: null });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.openGraph).not.toHaveProperty('url');
    expect(metadata.openGraph).not.toHaveProperty('images');
  });
  it('uses real Place identity, rejects invalid DTO and omits contacts/status from snippets', () => {
    const place = fixture({ phone: '+7 (123) 456-78-90', openingState: 'unknown' });
    const metadata = createPlaceMetadata(place, production);
    expect(metadata.alternates).toEqual({ canonical: `${env.PUBLIC_SITE_URL}/places/seo-fixture` });
    expect(metadata.description).toBe(`${place.name}. ${place.address}`);
    expect(createPlaceMetadata({ ...place, slug: '../admin' }, production).robots).toMatchObject({ index: false });
  });
});

describe('real data only JSON-LD and script safety', () => {
  it('roundtrips hostile imported strings without any HTML script escape characters', () => {
    const name = '</script><script>alert("x")</script>&\u2028\u2029<!--';
    const data = createPlaceJsonLd(fixture({ name }), production)!;
    const serialized = serializeJsonLd(data);
    expect(serialized).not.toMatch(/[<>&\u2028\u2029]/u);
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized)).toEqual(data);
    expect(JSON.parse(serialized).name).toBe(name);
  });
  it('emits actual coordinates/category, canonical ID and no null/unknown invented facts', () => {
    const data = createPlaceJsonLd(fixture(), production)!;
    expect(data).toMatchObject({ '@type': 'LocalBusiness', '@id': `${env.PUBLIC_SITE_URL}/places/seo-fixture`, geo: { latitude: 54, longitude: 32 }, additionalProperty: [{ '@type': 'PropertyValue', name: 'Категория', value: 'Кафе' }] });
    for (const key of ['telephone', 'sameAs', 'description', 'openingHours', 'openingHoursSpecification', 'aggregateRating', 'review', 'priceRange', 'image', 'subjectOf']) expect(data).not.toHaveProperty(key);
    expect(serializeJsonLd(data)).not.toContain(':null');
  });
  it('omits even supplied ratings and free-form verified opening hours in stage 1', () => {
    const data = createPlaceJsonLd(fixture({ rating: { value: 5, count: 99, source: 'unverified-fixture' }, openingHours: '24/7', hoursVerifiedAt: '2026-11-27T00:00:00Z', openingState: 'open' }), production)!;
    expect(data).not.toHaveProperty('aggregateRating');
    expect(data).not.toHaveProperty('openingHours');
    expect(data).not.toHaveProperty('openingHoursSpecification');
  });
  it('avoids asserting that broad public/sport categories are commercial businesses', () => expect(createPlaceJsonLd(fixture({ categoryIds: ['government'] }), production)).toMatchObject({ '@type': 'Place' }));
  it('validates all contacts, normalizes phone and strips external tracking/query/hash', () => {
    const place = fixture({ phone: '+7 (123) 456-78-90', website: 'https://catalog-fixture.ru/?utm_source=test#contact' });
    place.provenance[0]!.sourceUrl = 'https://source-fixture.ru/node/123?secret=value#map';
    expect(createPlaceJsonLd(place, production)).toMatchObject({ telephone: '+71234567890', sameAs: ['https://catalog-fixture.ru/'], subjectOf: [{ '@type': 'CreativeWork', url: 'https://source-fixture.ru/node/123' }] });
    for (const website of ['javascript:alert(1)', 'https://user:pass@catalog-fixture.ru']) expect(createPlaceJsonLd(fixture({ website }), production)).toBeNull();
    expect(createPlaceJsonLd(fixture({ website: 'https://catalog-fixture.ru/\nsecret' }), production)).not.toHaveProperty('sameAs');
    expect(createPlaceJsonLd(fixture({ phone: '12345678901234567890' }), production)).not.toHaveProperty('telephone');
  });
  it('refuses invalid runtime data and all unconfigured/staging schema', () => {
    expect(createPlaceJsonLd(fixture({ coordinates: { lat: 91, lon: 32 } }), production)).toBeNull();
    expect(createPlaceJsonLd(fixture({ categoryIds: ['invented'] as unknown as Place['categoryIds'] }), production)).toBeNull();
    expect(createPlaceJsonLd(fixture({ openingState: 'open' }), production)).toBeNull();
    for (const config of [getSeoConfig({}), getSeoConfig({ ...env, SITE_ENVIRONMENT: 'staging' })]) {
      expect(createPlaceJsonLd(fixture(), config)).toBeNull();
      expect(createPlaceBreadcrumbJsonLd(fixture(), config)).toBeNull();
      expect(createWebsiteJsonLd(config)).toBeNull();
    }
  });
  it('only links real home/detail breadcrumbs and does not invent a SearchAction', () => {
    expect(createPlaceBreadcrumbJsonLd(fixture(), production)).toMatchObject({ '@type': 'BreadcrumbList', itemListElement: [{ position: 1, item: `${env.PUBLIC_SITE_URL}/` }, { position: 2, item: `${env.PUBLIC_SITE_URL}/places/seo-fixture` }] });
    const site = createWebsiteJsonLd(production)!;
    expect(site).toMatchObject({ '@type': 'WebSite', url: `${env.PUBLIC_SITE_URL}/` });
    expect(site).not.toHaveProperty('potentialAction');
  });
});
