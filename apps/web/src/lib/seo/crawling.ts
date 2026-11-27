import 'server-only';
import type { MetadataRoute } from 'next';
import { getSeoConfig, type SeoConfig } from './config';
import { canonicalUrl, PUBLIC_STATIC_ROUTES } from './routes';

export function createRobots(config: SeoConfig = getSeoConfig()): MetadataRoute.Robots {
  if (!config.indexable || !config.origin) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Robots is crawl guidance, never authentication or a guarantee of removal from search.
      disallow: ['/admin', '/auth', '/login', '/signin', '/account', '/api/', '/business/dashboard', '/business/add', '/*?*'],
    },
    sitemap: new URL('/sitemap.xml', config.origin).href,
  };
}

export function createSitemap(config: SeoConfig = getSeoConfig()): MetadataRoute.Sitemap {
  if (!config.indexable || !config.origin) return [];
  return PUBLIC_STATIC_ROUTES.flatMap(path => {
    const url = canonicalUrl(config.origin, path);
    return url ? [{ url }] : [];
  });
}
