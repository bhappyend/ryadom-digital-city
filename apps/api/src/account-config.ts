import { resolve } from 'node:path';

export interface AccountConfig {
  enabled: boolean; databaseUrl: string | undefined; redisUrl: string | undefined;
  mfaKey: Buffer | undefined; keyId: string; rateKey: Buffer | undefined;
  secure: boolean; sessionCookie: string; preauthCookie: string; mediaRoot: string;
}
export function loadAccountConfig(origins: readonly string[], env: NodeJS.ProcessEnv = process.env): AccountConfig {
  const decode = (key: string) => { const raw = env[key]; if (!raw) return undefined; const value = Buffer.from(raw, 'base64'); if (value.length !== 32 || value.toString('base64') !== raw) throw new Error(`Invalid ${key}`); return value; };
  const insecure = env.NODE_ENV === 'development' && env.ACCOUNT_ALLOW_LOOPBACK_HTTP === 'true';
  if (insecure && (!origins.length || origins.some(origin => { const url = new URL(origin); return !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname); }))) throw new Error('HTTP account cookies require loopback origins');
  const enabled = env.ACCOUNTS_ENABLED === 'true';
  if (enabled && !insecure && origins.some(origin => new URL(origin).protocol !== 'https:')) throw new Error('Accounts require HTTPS origins');
  const config = { enabled, databaseUrl: env.ACCOUNTS_DATABASE_URL ?? env.APP_DATABASE_URL, redisUrl: env.REDIS_URL,
    mfaKey: decode('ACCOUNT_MFA_KEY'), rateKey: decode('ACCOUNT_RATE_KEY'), keyId: env.ACCOUNT_MFA_KEY_ID ?? 'v1',
    secure: !insecure, sessionCookie: insecure ? 'ryadom-session-dev' : '__Host-ryadom-session', preauthCookie: insecure ? 'ryadom-preauth-dev' : '__Host-ryadom-preauth',
    mediaRoot: resolve(env.ACCOUNT_MEDIA_ROOT ?? '.local-media') };
  if (enabled && (!config.databaseUrl || !config.redisUrl || !config.mfaKey || !config.rateKey)) throw new Error('Accounts configuration incomplete');
  return config;
}
