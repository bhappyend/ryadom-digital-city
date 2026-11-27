import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowed, sourceFiles } from './package-release.mjs';

test('release excludes private credentials, uploads, backups and build artifacts', () => {
  for (const path of ['infra/.env.local', '.env.accounts.local', 'infra/backups/customer.dump', 'apps/web/.next/server.js', 'packages/qa/artifacts/trace.zip', 'infra/key.pem', 'infra/secrets.json', 'apps/api/node_modules/a/index.js', 'infra/gis/runtime/valhalla/tiles.tar', 'infra/data/tools/tool.exe']) assert.equal(allowed(path), false, path);
  for (const path of ['.env.example', '.env.production.example', 'infra/Dockerfile', 'apps/web/public/assets/logo.svg']) assert.equal(allowed(path), true, path);
});
test('source selection has no symlink escapes or private env files', async () => {
  const files = await sourceFiles();
  assert(files.includes('package-lock.json'));
  assert(files.includes('data/osm/smolensk-replay.json'));
  assert(files.every(p => !p.startsWith('/') && !p.split('/').includes('..') && allowed(p)));
});
