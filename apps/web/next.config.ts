import type { NextConfig } from 'next';

const rawOrigin = process.env.API_URL ?? 'http://127.0.0.1:3001';
const apiOrigin = new URL(rawOrigin);
if (!['http:', 'https:'].includes(apiOrigin.protocol) || apiOrigin.username || apiOrigin.password || apiOrigin.pathname !== '/') {
  throw new Error('API_URL must be an HTTP(S) origin without credentials or a path');
}
// Public tile/style/glyph hosts only; no key or secret is placed in the browser policy.
const mapOrigins = (process.env.WEB_MAP_CONNECT_ORIGINS ?? '').split(',').map(v => v.trim()).filter(Boolean).map(value => {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('WEB_MAP_CONNECT_ORIGINS must contain HTTP(S) origins');
  return url.origin;
});
const development = process.env.NODE_ENV !== 'production';
const staticExport = process.env.NEXT_OUTPUT === 'export';
const connect = ["'self'", ...mapOrigins, ...(development ? ['http://127.0.0.1:8089', 'http://localhost:8089', 'ws://127.0.0.1:3000', 'ws://localhost:3000'] : [])].join(' ');
const csp = ["default-src 'self'", `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`, "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https: http:", "font-src 'self'", `connect-src ${connect}`, "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].join('; ');
const config: NextConfig = {
  output: staticExport ? 'export' : 'standalone',
  images: staticExport ? { unoptimized: true } : undefined,
  transpilePackages: ['@ryadom/ui'],
  poweredByHeader: false,
  async rewrites() { if (staticExport) return []; return [
    { source: '/api/v1/:path*', destination: `${apiOrigin.origin}/api/v1/:path*` },
    { source: '/media/:path*', destination: `${apiOrigin.origin}/media/:path*` }
  ]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=()' },
    { key: 'X-Frame-Options', value: 'DENY' }
    ,{ key: 'Content-Security-Policy', value: csp }
  ] }, { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }]; }
};
export default config;
