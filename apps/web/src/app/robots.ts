import type { MetadataRoute } from 'next';
import { createRobots } from '../lib/seo/crawling';

// Read deployment policy at request time: a promoted build must not retain staging robots.
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots { return createRobots(); }
