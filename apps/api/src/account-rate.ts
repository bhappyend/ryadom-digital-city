import { createHmac } from 'node:crypto';
import { createClient } from 'redis';
import { bounded } from './rate-limit.js';
import { AccountFault } from './accounts-fault.js';

export interface AccountRate { consume(scope: string, subject: string, max: number, windowMs: number): Promise<void>; close(): Promise<void> }
export class AccountRedisRate implements AccountRate {
  private readonly client: ReturnType<typeof createClient>;
  constructor(url: string, private readonly key: Buffer, private readonly namespace = 'ryadom:account') {
    if (key.length < 32 || !/^[a-zA-Z0-9:_-]{1,100}$/.test(namespace)) throw new Error('Invalid account rate configuration');
    this.client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 1000, reconnectStrategy: false } });
    this.client.on('error', () => {});
  }
  async connect() { try { await bounded(this.client.connect(), 1500, new Error('Redis unavailable')); } catch { /* fail closed on consume */ } }
  async consume(scope: string, subject: string, max: number, windowMs: number) {
    if (!this.client.isReady) throw new AccountFault('PROVIDER_UNAVAILABLE');
    const key = `${this.namespace}:${scope}:${Math.floor(Date.now() / windowMs)}:${createHmac('sha256', this.key).update(subject).digest('hex')}`;
    let count: number;
    try { count = Number(await bounded(this.client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n", { keys: [key], arguments: [String(windowMs)] }), 750, new Error('Redis unavailable'))); }
    catch { throw new AccountFault('PROVIDER_UNAVAILABLE'); }
    if (!Number.isSafeInteger(count) || count < 1) throw new AccountFault('PROVIDER_UNAVAILABLE');
    if (count > max) throw new AccountFault('RATE_LIMITED');
  }
  async close() { if (this.client.isOpen) this.client.destroy(); }
}
