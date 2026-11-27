import { ProviderUnavailable } from './errors.js';

export interface HttpProviderConfig {
  /** Deployment-owned exact base URL, never supplied by an HTTP request. */
  baseUrl?: string;
  /** Exact origins, not suffixes/wildcards; e.g. ['http://nominatim:8080']. */
  allowedOrigins: readonly string[];
  /** Permit HTTP only for an explicitly allowlisted self-hosted deployment. */
  allowHttp?: boolean;
  userAgent: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface ProviderRuntime { fetch?: typeof fetch }
type Provider = 'nominatim' | 'valhalla';

/** Fixed endpoints and redirect:error prevent upstream responses from choosing a new target. */
export function providerEndpoint(config: HttpProviderConfig, path: 'search' | 'route', provider: Provider): URL {
  if (!config.baseUrl) throw new ProviderUnavailable(provider, 'not_configured');
  try {
    const raw = config.baseUrl;
    if (raw.length > 2048 || /[\\\s]/u.test(raw)) throw new Error();
    const base = new URL(raw);
    if (base.username || base.password || base.search || base.hash || /%2f|%5c|%2e/i.test(base.pathname)) throw new Error();
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && config.allowHttp === true)) throw new Error();
    const allowed = config.allowedOrigins.some((entry) => {
      const origin = new URL(entry);
      return !origin.username && !origin.password && !origin.search && !origin.hash
        && origin.pathname === '/' && origin.origin === entry && base.origin === entry;
    });
    if (!allowed || base.hostname === 'nominatim.openstreetmap.org') throw new Error();
    if (!/^[\x20-\x7e]{10,256}$/.test(config.userAgent) || !config.userAgent.trim()) throw new Error();
    const timeout = config.timeoutMs ?? 5000;
    const bytes = config.maxResponseBytes ?? 1_048_576;
    if (!Number.isInteger(timeout) || timeout < 10 || timeout > 30_000
      || !Number.isInteger(bytes) || bytes < 256 || bytes > 4_194_304) throw new Error();
    base.pathname = `${base.pathname.replace(/\/$/, '')}/${path}`;
    return base;
  } catch {
    throw new ProviderUnavailable(provider, 'invalid_configuration');
  }
}

/** Timeout covers response body consumption too. No retry storms, redirects, cookies or URL logging. */
export async function providerJson(
  provider: Provider, config: HttpProviderConfig, url: URL,
  init: RequestInit, signal?: AbortSignal, runtime: ProviderRuntime = {},
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) throw new ProviderUnavailable(provider, 'cancelled');
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutMs ?? 5000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await (runtime.fetch ?? fetch)(url, {
      ...init, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': config.userAgent, ...init.headers },
    });
    // Valhalla documents HTTP 400/error_code 442 for an actual no-path result.
    // Parse only this bounded error response; never expose its free-form message.
    const inspectRouteError = provider === 'valhalla' && response.status === 400;
    if (!response.ok && !inspectRouteError) {
      await response.body?.cancel();
      throw new ProviderUnavailable(provider, 'http_error', response.status);
    }
    if (!/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) {
      await response.body?.cancel();
      throw new ProviderUnavailable(provider, inspectRouteError ? 'http_error' : 'invalid_response', inspectRouteError ? 400 : undefined);
    }
    const limit = config.maxResponseBytes ?? 1_048_576;
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new ProviderUnavailable(provider, 'response_too_large');
    }
    if (!response.body) throw new ProviderUnavailable(provider, 'invalid_response');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) throw new ProviderUnavailable(provider, 'response_too_large');
      chunks.push(next.value);
    }
    const data = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)) as unknown; }
    catch { throw new ProviderUnavailable(provider, inspectRouteError ? 'http_error' : 'invalid_response', inspectRouteError ? 400 : undefined); }
    if (inspectRouteError) {
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        && (parsed as Record<string, unknown>).error_code === 442) throw new ProviderUnavailable(provider, 'no_route', 400);
      throw new ProviderUnavailable(provider, 'http_error', 400);
    }
    return parsed;
  } catch (error) {
    if (timedOut) throw new ProviderUnavailable(provider, 'timeout');
    if (signal?.aborted) throw new ProviderUnavailable(provider, 'cancelled');
    if (error instanceof ProviderUnavailable) throw error;
    throw new ProviderUnavailable(provider, 'network_error');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
    if (reader) { try { await reader.cancel(); } catch { /* upstream abort */ } reader.releaseLock(); }
  }
}
