import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { base32, checkRecovery, hashRecovery, MfaCipher, PasswordHasher, recoveryCodes, totp, verifyTotp } from '../src/account-crypto.js';
import { loadAccountConfig } from '../src/account-config.js';
import { AccountRedisRate } from '../src/account-rate.js';
import { loadPublicMediaOrigin } from '../src/media-origin.js';

describe('account crypto and deployment policy', () => {
  it('matches RFC6238 SHA1 vectors at six-digit truncation and window bounds', () => {
    const secret = base32(Buffer.from('12345678901234567890'));
    for (const [time, expected] of [[59,'287082'],[1111111109,'081804'],[1111111111,'050471'],[1234567890,'005924'],[2000000000,'279037'],[20000000000,'353130']] as const) expect(totp(secret, Math.floor(time / 30))).toBe(expected);
    expect(verifyTotp(secret, totp(secret, 100), 101 * 30000)).toBe(100);
    expect(verifyTotp(secret, totp(secret, 100), 102 * 30000)).toBeNull();
    expect(verifyTotp(secret, '12')).toBeNull();
  });
  it('authenticates encrypted MFA to account and key id and rejects tampering', () => {
    const cipher = new MfaCipher(randomBytes(32), 'test'), secret = base32(randomBytes(20));
    const sealed = cipher.seal('user-a', secret);
    expect(cipher.open('user-a', sealed)).toBe(secret);
    expect(sealed.ciphertext).not.toContain(secret);
    expect(() => cipher.open('user-b', sealed)).toThrow();
    expect(() => cipher.open('user-a', { ...sealed, keyId: 'other' })).toThrow();
    expect(() => cipher.open('user-a', { ...sealed, tag: randomBytes(16).toString('base64') })).toThrow();
  });
  it('salts recovery codes, verifies exactly and produces unique 80bit codes', () => {
    const codes = recoveryCodes(); expect(new Set(codes).size).toBe(10);
    const hash = hashRecovery(codes[0]!); expect(hashRecovery(codes[0]!)).not.toBe(hash);
    expect(checkRecovery(codes[0]!, hash)).toBe(true); expect(checkRecovery(codes[1]!, hash)).toBe(false);
    expect(hash).not.toContain(codes[0]);
  });
  it('uses real Argon2id and dummy verification with exact password preservation', async () => {
    const hasher = new PasswordHasher(); const password = '  Test-only-password  ';
    const started = performance.now(); const hash = await hasher.hash(password);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(password, hash)).toBe(true);
    expect(await hasher.verify(password.trim(), hash)).toBe(false);
    expect(await hasher.verify(password, null)).toBe(false);
    expect(performance.now() - started).toBeGreaterThan(0);
    await expect(hasher.hash('short')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('denies production HTTP downgrade and nonloopback development bypass', () => {
    expect(() => loadAccountConfig(['http://localhost:3000'], { NODE_ENV:'production', ACCOUNTS_ENABLED:'true', ACCOUNT_ALLOW_LOOPBACK_HTTP:'true' })).toThrow();
    expect(() => loadAccountConfig(['http://evil.invalid'], { NODE_ENV:'development', ACCOUNT_ALLOW_LOOPBACK_HTTP:'true' })).toThrow();
    expect(loadAccountConfig(['http://localhost:3000'], { NODE_ENV:'development', ACCOUNT_ALLOW_LOOPBACK_HTTP:'true' }).sessionCookie).toBe('ryadom-session-dev');
    expect(loadAccountConfig(['https://example.invalid'], { NODE_ENV:'production', ACCOUNT_ALLOW_LOOPBACK_HTTP:'true' }).sessionCookie).toBe('__Host-ryadom-session');
  });
  it('fails closed without a connected Redis, no local account limiter fallback', async () => {
    const rate = new AccountRedisRate('redis://127.0.0.1:1', randomBytes(32));
    await expect(rate.consume('write','user',20,60000)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' }); await rate.close();
  });
  it('accepts only explicit public media origins and never production HTTP', () => {
    expect(loadPublicMediaOrigin({})).toBeUndefined();
    expect(loadPublicMediaOrigin({PUBLIC_MEDIA_ORIGIN:'https://media.example.invalid'})).toBe('https://media.example.invalid');
    for(const value of ['http://127.0.0.1:3000','https://example.invalid/','https://example.invalid/path','https://user:secret@example.invalid','https://example.invalid?q=1']) expect(()=>loadPublicMediaOrigin({NODE_ENV:'production',PUBLIC_MEDIA_ORIGIN:value,PUBLIC_MEDIA_ALLOW_LOOPBACK_HTTP:'true'})).toThrow();
    expect(loadPublicMediaOrigin({NODE_ENV:'development',PUBLIC_MEDIA_ORIGIN:'http://127.0.0.1:3171',PUBLIC_MEDIA_ALLOW_LOOPBACK_HTTP:'true'})).toBe('http://127.0.0.1:3171');
  });
});
