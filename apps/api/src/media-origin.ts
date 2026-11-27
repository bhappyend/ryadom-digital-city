export function loadPublicMediaOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.PUBLIC_MEDIA_ORIGIN; if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const localHttp = env.NODE_ENV === 'development' && env.PUBLIC_MEDIA_ALLOW_LOOPBACK_HTTP === 'true' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (url.origin !== raw || url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHttp))) throw new Error();
    return url.origin;
  } catch { throw new Error('Invalid PUBLIC_MEDIA_ORIGIN'); }
}
