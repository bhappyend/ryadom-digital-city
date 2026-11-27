import 'server-only';

export type SeoEnvironment = Readonly<Record<string, string | undefined>>;
export type SeoConfig = Readonly<{ origin: string | null; indexable: boolean }>;

/** Deployment configuration is the trust boundary. Never derive this from Host/Forwarded/request URLs. */
export function getSeoConfig(env: SeoEnvironment = process.env): SeoConfig {
  const origin = validateSiteOrigin(env.PUBLIC_SITE_URL, {
    allowLocalhost: env.NODE_ENV === 'development' && env.SITE_ENVIRONMENT === 'development' && env.SEO_ALLOW_LOCALHOST === 'true',
  });
  return Object.freeze({
    origin,
    indexable: origin !== null && env.NODE_ENV === 'production' && env.SITE_ENVIRONMENT === 'production'
      && env.SEO_INDEXING_ENABLED === 'true' && !isLoopback(new URL(origin).hostname),
  });
}

function isLoopback(host: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(host); }

/** Accept a bare, public HTTPS DNS origin; local HTTP requires the explicit development opt-in. */
export function validateSiteOrigin(raw: string | undefined, options: { allowLocalhost?: boolean } = {}): string | null {
  if (!raw || raw.length > 2048 || /[\s\\%@?#]/u.test(raw) || !/^https?:\/\/[^/]+\/?$/u.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (isLoopback(url.hostname)) {
      return options.allowLocalhost && ['https:', 'http:'].includes(url.protocol) ? url.origin : null;
    }
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.port || host.length > 253 || !host.includes('.') || host.endsWith('.')) return null;
    if (!host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
    if (/^[\d.]+$/u.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/u.test(host)
      || /(?:^|\.)example\.(?:com|net|org)$/u.test(host)) return null;
    return url.origin;
  } catch { return null; }
}
