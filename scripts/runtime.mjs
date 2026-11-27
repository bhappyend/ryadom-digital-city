import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const readEnv = path => existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};

export function runtimeEnvironment(target, local = {}, infra = {}, inherited = process.env, accounts = {}) {
  const defaults = target === 'api'
    ? { API_HOST: '127.0.0.1', API_PORT: '3001', CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000' }
    : { WEB_PORT: '3000', API_URL: 'http://localhost:3001', PUBLIC_SITE_URL: 'http://localhost:3000' };
  // Never copy the migration/admin credentials or the complete infrastructure env.
  const runtime = target === 'api' ? Object.fromEntries(
    ['APP_DATABASE_URL', 'REDIS_URL'].filter(key => infra[key]).map(key => [key, infra[key]])
  ) : {};
  const accountRuntime = target === 'api' ? Object.fromEntries(
    ['ACCOUNT_MFA_KEY', 'ACCOUNT_MFA_KEY_ID', 'ACCOUNT_RATE_KEY'].filter(key => accounts[key]).map(key => [key, accounts[key]])
  ) : {};
  return { ...defaults, ...runtime, ...accountRuntime, ...local, ...inherited };
}

export function launch(target, mode) {
  if (!['api', 'web'].includes(target) || !['dev', 'start'].includes(mode)) {
    throw new Error('Usage: node scripts/runtime.mjs api|web dev|start');
  }
  const local = readEnv(resolve(root, '.env'));
  const infra = target === 'api' ? readEnv(resolve(root, 'infra/.env.local')) : {};
  const accounts = target === 'api' ? readEnv(resolve(root, '.env.accounts.local')) : {};
  const env = runtimeEnvironment(target, local, infra, process.env, accounts);
  let args;
  let cwd;
  if (target === 'api') {
    cwd = resolve(root, 'apps/api');
    args = mode === 'dev' ? [require.resolve('tsx/cli'), 'watch', 'src/main.ts'] : ['dist/main.js'];
  } else {
    cwd = resolve(root, 'apps/web');
    args = [require.resolve('next/dist/bin/next'), mode, '--hostname', '127.0.0.1', '--port', env.WEB_PORT];
  }
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  child.on('error', () => { console.error('Application failed to start. Check installed dependencies and build outputs.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  return child;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch(process.argv[2], process.argv[3]);
}
