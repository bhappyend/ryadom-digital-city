import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import type { ApiConfig } from './config.js';
import { ApiFault, unavailable } from './errors.js';

export type RateGroup = 'read' | 'geocode' | 'route' | 'report';
export interface RateLimiter {
  consume(ip: string, group: RateGroup): Promise<void>;
  ready(): Promise<boolean>;
  close(): Promise<void>;
}
export async function bounded<T>(promise: Promise<T>, ms: number, error: Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(error), ms); })]); }
  finally { clearTimeout(timer); }
}
export class RedisRateLimiter implements RateLimiter {
  private readonly secret: Buffer;
  private readonly local = new Map<string, { count: number; until: number }>();
  private readonly client: ReturnType<typeof createClient> | undefined;
  constructor(private readonly config: ApiConfig, private readonly namespace = 'ryadom') {
    if (!/^[a-z0-9:_-]{1,80}$/.test(namespace)) throw new Error('Invalid rate namespace');
    // Shared secret across replicas without persisting raw client IPs in Redis.
    this.secret = config.redisUrl ? createHash('sha256').update(config.redisUrl).digest() : randomBytes(32);
    if (config.redisUrl) {
      this.client = createClient({ url: config.redisUrl, disableOfflineQueue: true,
        socket: { connectTimeout: 1000, reconnectStrategy: false } });
      this.client.on('error', () => { /* no credentials, raw URLs or IP logging */ });
    }
  }
  async connect() { if (this.client) { try { await bounded(this.client.connect(), 1500, new Error('Redis timeout')); } catch { /* readiness reports failure */ } } }
  async ready() {
    if (!this.client?.isReady) return false;
    try { return await bounded(this.client.ping(), 500, new Error('Redis timeout')) === 'PONG'; } catch { return false; }
  }
  async consume(ip: string, group: RateGroup) {
    const now = Date.now(); const window = group === 'report' ? 3_600_000 : 60_000;
    const max = group === 'report' ? this.config.reportLimit : group === 'read' ? this.config.readLimit : this.config.geoLimit;
    const limited = () => new ApiFault(429, 'RATE_LIMITED', 'Слишком много запросов', undefined, undefined, Math.max(1, Math.ceil((window - now % window) / 1000)));
    const hash = createHmac('sha256', this.secret).update(ip).digest('hex');
    const key = `${this.namespace}:rate:${group}:${Math.floor(now / window)}:${hash}`;
    if (this.client?.isReady) {
      try {
        const count = Number(await bounded(this.client.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
          { keys: [key], arguments: [String(window)] }), 500, new Error('Redis timeout')));
        if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid limiter result');
        if (count > max) throw limited();
        return;
      } catch (error) { if (error instanceof ApiFault) throw error; }
    }
    // Reports fail closed. Reads retain bounded per-process protection during Redis outages.
    if (group === 'report') throw unavailable('reports', this.config.redisUrl ? 'upstream_error' : 'not_configured');
    for (const [entry, value] of this.local) if (value.until <= now) this.local.delete(entry);
    const value = this.local.get(key) ?? { count: 0, until: now + window };
    if (!this.local.has(key) && this.local.size >= 10_000) throw limited();
    value.count++; this.local.set(key, value);
    if (value.count > max) throw limited();
  }
  async close() { if (this.client?.isOpen) this.client.destroy(); this.local.clear(); }
}
