import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { envFile, root } from './runtime.mjs';

function config(files, profile) {
  const result = spawnSync('docker', ['compose', '--env-file', envFile, ...files.flatMap(file => ['-f', file]), ...(profile ? ['--profile', profile] : []), 'config', '--format', 'json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 30_000,
    env: { ...process.env,
      WEB_IMAGE: 'validation.invalid/web@sha256:' + 'a'.repeat(64),
      API_IMAGE: 'validation.invalid/api@sha256:' + 'b'.repeat(64),
      TOOLS_IMAGE: 'validation.invalid/tools@sha256:' + 'd'.repeat(64),
      POSTGIS_IMAGE: 'postgis/postgis:16-3.4@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5',
      MINIO_IMAGE: 'validation.invalid/minio@sha256:' + 'c'.repeat(64),
      SITE_HOST: 'example.invalid', ACME_EMAIL: 'operations@example.invalid',
      APP_DATABASE_URL: 'postgresql://validation:validation@db:5432/ryadom',
      DATABASE_URL: 'postgresql://validation:validation@db:5432/ryadom',
      REDIS_URL: 'redis://:validation@redis:6379',
    },
  });
  assert.equal(result.status, 0, 'Compose config must parse (resolved secrets are deliberately not logged)');
  return JSON.parse(result.stdout);
}

const local = config(['compose.yaml']);
assert.deepEqual(Object.keys(local.services).sort(), ['db', 'redis']);
for (const [name, service] of Object.entries(local.services)) {
  assert.match(service.image, /@sha256:[a-f0-9]{64}$/);
  assert.ok(service.healthcheck && service.mem_limit && service.cpus && service.pids_limit, `${name} must be bounded and checked`);
  for (const port of service.ports) assert.equal(port.host_ip, '127.0.0.1');
}
const production = config(['compose.yaml', 'infra/compose.production.yaml']);
for (const name of ['db', 'redis', 'web', 'api']) assert.ok(!production.services[name].ports?.length, `${name} cannot publish production ports`);
assert.deepEqual(production.services.proxy.ports.map(port => port.target).sort((a,b) => a-b), [80,443]);
for (const name of ['web','api']) {
  assert.equal(production.services[name].read_only, true);
  assert.ok(production.services[name].cap_drop.includes('ALL'));
}
const storage = config(['compose.yaml', 'infra/compose.storage.yaml'], 'storage');
assert.ok(storage.services.minio.profiles.includes('storage'));
for (const port of storage.services.minio.ports) assert.equal(port.host_ip, '127.0.0.1');
console.log('PASS: local/production/storage Compose configuration; digest pins, bounded resources, local ports, production port isolation.');
