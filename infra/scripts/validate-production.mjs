import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateProduction(source) {
  assert.ok(!source.includes('# LOCAL ONLY.'), 'Generated local credentials cannot be reused for production');
  const env = parseEnv(source);
  for (const name of ['POSTGRES_PASSWORD','APP_DB_PASSWORD','REDIS_PASSWORD']) {
    assert.ok(env[name]?.length >= 32 && !/replace|example|changeme|password/i.test(env[name]), `${name} must be an independently supplied secret of at least 32 characters`);
  }
  assert.notEqual(env.POSTGRES_PASSWORD, env.APP_DB_PASSWORD, 'Separate admin/runtime secrets required');
  assert.match(env.REDIS_PASSWORD, /^[a-zA-Z0-9_-]+$/, 'Redis secret must be config-safe');
  for (const name of ['WEB_IMAGE','API_IMAGE']) assert.match(env[name] || '', /^[-a-zA-Z0-9._/:]+@sha256:[a-f0-9]{64}$/, `${name} requires immutable digest`);
  for (const name of ['POSTGIS_IMAGE','TOOLS_IMAGE','NODE_IMAGE']) assert.match(env[name] || '', /^[-a-zA-Z0-9._/:]+@sha256:[a-f0-9]{64}$/, `${name} requires reviewed immutable digest`);
  assert.match(env.SITE_HOST || '', /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/, 'SITE_HOST must be a hostname without scheme, port or path');
  assert.ok(env.ACME_EMAIL && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACME_EMAIL), 'Supply ACME_EMAIL');
  const app = new URL(env.APP_DATABASE_URL);
  assert.equal(app.protocol, 'postgresql:');
  assert.equal(app.hostname, 'db');
  assert.equal(app.port, '5432');
  assert.equal(decodeURIComponent(app.username), env.APP_DB_USER || 'ryadom_app');
  assert.equal(decodeURIComponent(app.password), env.APP_DB_PASSWORD);
  assert.equal(app.pathname, `/${env.POSTGRES_DB || 'ryadom'}`);
  assert.notEqual(app.username, env.POSTGRES_USER || 'ryadom_admin');
  const migration = new URL(env.DATABASE_URL);
  assert.equal(migration.protocol, 'postgresql:');
  assert.equal(migration.hostname, 'db');
  assert.equal(migration.port, '5432');
  assert.equal(decodeURIComponent(migration.username), env.POSTGRES_USER || 'ryadom_admin');
  assert.equal(decodeURIComponent(migration.password), env.POSTGRES_PASSWORD);
  assert.equal(migration.pathname, app.pathname);
  const redis = new URL(env.REDIS_URL);
  assert.equal(redis.protocol, 'redis:');
  assert.equal(redis.hostname, 'redis');
  assert.equal(redis.port, '6379');
  assert.equal(decodeURIComponent(redis.password), env.REDIS_PASSWORD);
  assert.ok(['true','false'].includes(env.ACCOUNTS_ENABLED ?? 'false'), 'ACCOUNTS_ENABLED must be explicit boolean');
  if (env.ACCOUNTS_ENABLED === 'true') {
    for (const name of ['ACCOUNT_MFA_KEY','ACCOUNT_RATE_KEY']) {
      const decoded = Buffer.from(env[name] ?? '', 'base64');
      assert.equal(decoded.length, 32, `${name} requires 32 random bytes`);
      assert.equal(decoded.toString('base64'), env[name], `${name} requires canonical base64`);
    }
    assert.notEqual(env.ACCOUNT_MFA_KEY, env.ACCOUNT_RATE_KEY, 'Independent keys required');
    assert.match(env.ACCOUNT_MFA_KEY_ID ?? '', /^[a-zA-Z0-9_-]{1,32}$/);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert.ok(process.argv[2], 'Usage: node infra/scripts/validate-production.mjs <private-env-path>');
    validateProduction(readFileSync(process.argv[2], 'utf8'));
    console.log('PASS: production environment has explicit secrets, runtime role, internal endpoints and immutable app images.');
  } catch (error) {
    // URL/assert failures may contain credentials; never print the received value or stack.
    console.error('Production environment validation failed. Review required variables and constraints in docs/DEPLOYMENT.md.');
    process.exitCode = 1;
  }
}
