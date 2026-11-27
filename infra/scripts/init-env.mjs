import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Local-only secrets; exclusive creation prevents silently rotating credentials on existing volumes.
const target = fileURLToPath(new URL('../.env.local', import.meta.url));
const secret = () => randomBytes(32).toString('hex');
const admin = secret();
const app = secret();
const redis = secret();
const content = [
  '# LOCAL ONLY. Do not copy these credentials to production. Do not commit.',
  'POSTGRES_DB=ryadom', 'POSTGRES_USER=ryadom_admin', `POSTGRES_PASSWORD=${admin}`,
  'APP_DB_USER=ryadom_app', `APP_DB_PASSWORD=${app}`, 'POSTGRES_PORT=5432', 'REDIS_PORT=6379',
  `REDIS_PASSWORD=${redis}`,
  `DATABASE_URL=postgresql://ryadom_admin:${admin}@127.0.0.1:5432/ryadom`,
  `APP_DATABASE_URL=postgresql://ryadom_app:${app}@127.0.0.1:5432/ryadom`,
  `REDIS_URL=redis://:${redis}@127.0.0.1:6379`,
  'MINIO_ROOT_USER=ryadom_local', `MINIO_ROOT_PASSWORD=${secret()}`,
  '',
].join('\n');
writeFileSync(target, content, { flag: 'wx', mode: 0o600 });
console.log('Created infra/.env.local with random local credentials (not printed).');
