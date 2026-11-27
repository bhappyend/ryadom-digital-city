import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import * as argon from 'argon2';
import { PasswordSchema } from '@ryadom/accounts-types';
import { AccountFault } from './accounts-fault.js';

export const opaque = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Buffer): string {
  let bits = 0, value = 0, result = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function fromBase32(secret: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new AccountFault('MFA_INVALID');
  let bits = 0, value = 0; const bytes: number[] = [];
  for (const char of secret) { value = (value << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(bytes);
}
export function totp(secret: string, step: number): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 15;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000); let matched: number | null = null;
  for (const candidate of [step - 1, step, step + 1]) if (candidate >= 0 && equal(totp(secret, candidate), code)) matched = candidate;
  return matched;
}
export interface EncryptedSecret { ciphertext: string; nonce: string; tag: string; keyId: string }
export class MfaCipher {
  constructor(private readonly key: Buffer, readonly keyId: string) { if (key.length !== 32 || !/^[A-Za-z0-9_-]{1,80}$/.test(keyId)) throw new Error('Invalid MFA key configuration'); }
  seal(userId: string, secret: string): EncryptedSecret {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    cipher.setAAD(Buffer.from(`ryadom:mfa:${userId}:${this.keyId}`));
    return { ciphertext: Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]).toString('base64'), nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), keyId: this.keyId };
  }
  open(userId: string, sealed: EncryptedSecret): string {
    try {
      if (sealed.keyId !== this.keyId) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(sealed.nonce, 'base64'));
      decipher.setAAD(Buffer.from(`ryadom:mfa:${userId}:${this.keyId}`)); decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
      const secret = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
      return secret;
    } catch { throw new AccountFault('PROVIDER_UNAVAILABLE'); }
  }
}
export function recoveryCodes() { return Array.from({ length: 10 }, () => { const v = base32(randomBytes(10)); return `${v.slice(0, 8)}-${v.slice(8)}`; }); }
export function hashRecovery(code: string): string { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(code, salt, 32).toString('hex')}`; }
export function checkRecovery(code: string, encoded: string) { const [salt, hash] = encoded.split(':'); return !!salt && !!hash && equal(scryptSync(code, salt, 32).toString('hex'), hash); }

/** No waiting queue: a busy process rejects before allocating further Argon memory. */
export class PasswordHasher {
  private active = 0;
  private dummy: Promise<string> | undefined;
  private async bounded<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= 2) throw new AccountFault('RATE_LIMITED');
    this.active++;
    try { return await fn(); } finally { this.active--; }
  }
  async hash(password: string) {
    if (!PasswordSchema.safeParse(password).success) throw new AccountFault('VALIDATION_ERROR');
    return this.bounded(() => argon.hash(password, { type: argon.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }));
  }
  async initialize() { this.dummy ??= this.hash(opaque()); await this.dummy; }
  async verify(password: string, hash: string | null) {
    if (!PasswordSchema.safeParse(password).success) throw new AccountFault('INVALID_CREDENTIALS');
    await this.initialize();
    const encoded = hash ?? await this.dummy!;
    if (!/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/.test(encoded)) throw new AccountFault('PROVIDER_UNAVAILABLE');
    const matched = await this.bounded(() => argon.verify(encoded, password));
    return hash !== null && matched;
  }
}
