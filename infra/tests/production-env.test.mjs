import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProduction } from '../scripts/validate-production.mjs';

function fixture() {
  const secret = 'a'.repeat(64);
  const runtime = 'b'.repeat(64);
  return [
    `POSTGRES_PASSWORD=${secret}`, `APP_DB_PASSWORD=${runtime}`, `REDIS_PASSWORD=${secret}`,
    `WEB_IMAGE=registry.example.invalid/web@sha256:${'c'.repeat(64)}`,
    `API_IMAGE=registry.example.invalid/api@sha256:${'d'.repeat(64)}`,
    `TOOLS_IMAGE=registry.example.invalid/tools@sha256:${'e'.repeat(64)}`,
    `POSTGIS_IMAGE=registry.example.invalid/postgis@sha256:${'f'.repeat(64)}`,
    `NODE_IMAGE=registry.example.invalid/node@sha256:${'1'.repeat(64)}`,
    'SITE_HOST=example.invalid', 'ACME_EMAIL=ops@example.invalid',
    `APP_DATABASE_URL=postgresql://ryadom_app:${runtime}@db:5432/ryadom`,
    `DATABASE_URL=postgresql://ryadom_admin:${secret}@db:5432/ryadom`,
    `REDIS_URL=redis://:${secret}@redis:6379`,
  ].join('\n');
}
test('production requires digests, distinct secrets, private endpoints and runtime identity', () => {
  assert.equal(validateProduction(fixture()), true);
  for (const [before, after] of [
    ['POSTGRES_PASSWORD=' + 'a'.repeat(64), 'POSTGRES_PASSWORD=changeme'],
    ['ryadom_app:', 'ryadom_admin:'], ['@db:5432', '@127.0.0.1:5432'],
    ['@redis:6379', '@public.example.invalid:6379'],
    ['WEB_IMAGE=registry.example.invalid/web@sha256:' + 'c'.repeat(64), 'WEB_IMAGE=registry.example.invalid/web:latest'],
  ]) assert.throws(() => validateProduction(fixture().replace(before, after)));
  assert.throws(() => validateProduction('# LOCAL ONLY.\n' + fixture()));
});

test('enabled accounts require independent canonical encryption and rate keys', () => {
  const enabled = fixture() + '\nACCOUNTS_ENABLED=true\nACCOUNT_MFA_KEY_ID=v1';
  assert.throws(() => validateProduction(enabled));
  const key = Buffer.alloc(32, 17).toString('base64');
  const rate = Buffer.alloc(32, 29).toString('base64');
  assert.equal(validateProduction(enabled + `\nACCOUNT_MFA_KEY=${key}\nACCOUNT_RATE_KEY=${rate}`), true);
  assert.throws(() => validateProduction(enabled + `\nACCOUNT_MFA_KEY=${key}\nACCOUNT_RATE_KEY=${key}`));
});
