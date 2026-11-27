import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

export const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
export const envFile = resolve(root, process.env.INFRA_ENV_FILE || 'infra/.env.local');
export const settings = { ...parseEnv(readFileSync(envFile, 'utf8')), ...process.env };
export const admin = settings.POSTGRES_USER || 'ryadom_admin';
export const database = settings.POSTGRES_DB || 'ryadom';
export const appUser = settings.APP_DB_USER || 'ryadom_app';
for (const name of [admin, database, appUser]) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error('Unsafe database/role identifier');
}
const project = settings.COMPOSE_PROJECT_NAME || 'ryadom';
if (!/^[a-z][a-z0-9_-]{0,40}$/.test(project)) throw new Error('Unsafe Compose project name');

export function compose(args, options = {}) {
  const result = spawnSync('docker', ['compose', '--env-file', envFile, '-p', project, '-f', 'compose.yaml', ...args], {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024, ...options,
  });
  if (result.error || result.status !== 0) {
    // Only controlled subcommands are used; do not include resolved config or secrets in exceptions.
    throw new Error(`Docker Compose command failed (${result.status ?? result.error?.code}). Check service health locally.`);
  }
  return result.stdout?.trim() || '';
}

export function sql(query, db = database) {
  return compose(['exec', '-T', 'db', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', admin, '-d', db, '-At'], { input: query });
}
