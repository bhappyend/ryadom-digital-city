import type { MetadataRoute } from 'next';
import { createSitemap } from '../lib/seo/crawling';

export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap { return createSitemap(); }
