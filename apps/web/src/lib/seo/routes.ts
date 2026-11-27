import 'server-only';
import { SlugSchema } from '@ryadom/types';

/** Only implemented, public, query-free pages. No speculative city/category/business routes. */
export const PUBLIC_STATIC_ROUTES = ['/', '/map'] as const;
export type PublicStaticRoute = typeof PUBLIC_STATIC_ROUTES[number];

export function placePath(slug: string): string | null {
  const parsed = SlugSchema.safeParse(slug);
  return parsed.success ? `/places/${parsed.data}` : null;
}

/** The small allowlist prevents absolute URLs, query leaks, traversal and unimplemented routes. */
export function canonicalUrl(origin: string | null, path: string): string | null {
  if (!origin || !(PUBLIC_STATIC_ROUTES.some(route => route === path) || /^\/places\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(path) && placePath(path.slice(8)) === path)) return null;
  return new URL(path, origin).href;
}
