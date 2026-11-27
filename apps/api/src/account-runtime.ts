import { AdminRepository, createDatabasePool } from '@ryadom/db/compiled';
import { AccountService } from './accounts.js';
import { loadAccountConfig } from './account-config.js';
import { AccountRedisRate } from './account-rate.js';
import { MfaCipher } from './account-crypto.js';
import { LocalMedia } from './account-media.js';

export async function createAccounts(origins: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  const config = loadAccountConfig(origins, env); if (!config.enabled) return undefined;
  const pool = createDatabasePool(config.databaseUrl);
  const rate = new AccountRedisRate(config.redisUrl!, config.rateKey!);
  const cipher = new MfaCipher(config.mfaKey!, config.keyId);
  const admin = new AdminRepository(pool, { encrypt: (value, id) => cipher.seal(`phone:${id}`, value), decrypt: (value, id) => cipher.open(`phone:${id}`, value) });
  const media = new LocalMedia(config.mediaRoot, admin);
  const runtime = new AccountService(pool, config, origins, rate, admin, media);
  try { await rate.connect(); await runtime.hasher.initialize(); return runtime; }
  catch (error) { await runtime.close(); throw error; }
}
