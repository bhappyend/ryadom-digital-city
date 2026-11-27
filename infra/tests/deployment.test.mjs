import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
test('deployment keeps media durable and only the exact raster route has a larger budget', () => {
  const caddy = read('infra/proxy/Caddyfile');
  assert.match(caddy, /method PUT/);
  assert.match(caddy, /path_regexp raster .*admin\/media\/.*\/content/);
  assert.equal((caddy.match(/max_size 2097152/g) ?? []).length, 1);
  assert.equal((caddy.match(/max_size 16KB/g) ?? []).length, 3);
  const compose = read('infra/compose.production.yaml');
  assert.match(compose, /media_data:\/var\/lib\/ryadom\/media/);
  assert.match(compose, /ACCOUNT_MEDIA_ROOT: \/var\/lib\/ryadom\/media/);
  assert.match(compose, /ACCOUNTS_ENABLED: \$\{ACCOUNTS_ENABLED:-false\}/);
});
test('image build uses lockfile, compiled packages, non-root and excludes runtime secrets', () => {
  const docker = read('infra/docker/Dockerfile');
  assert.match(docker, /npm ci/);
  assert.match(docker, /API_URL=http:\/\/api:3001/);
  assert.match(docker, /USER 10001:10001/);
  assert.match(docker, /npm prune --omit=dev/);
  const ignore = read('infra/docker/Dockerfile.dockerignore');
  for (const path of ['**/.env.*','infra/backups','infra/data','.local-media','**/node_modules']) assert.ok(ignore.includes(path));
  assert.match(read('.github/workflows/ci.yml'), /npm run contracts:accounts:check/);
});
