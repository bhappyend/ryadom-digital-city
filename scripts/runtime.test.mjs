import assert from 'node:assert/strict';
import test from 'node:test';
import { runtimeEnvironment } from './runtime.mjs';

test('API takes only runtime infrastructure credentials; explicit env wins', () => {
  const env = runtimeEnvironment('api', { REDIS_URL: 'local' }, {
    APP_DATABASE_URL: 'runtime', REDIS_URL: 'infra', DATABASE_URL: 'admin', POSTGRES_PASSWORD: 'secret'
  }, { REDIS_URL: 'inherited' });
  assert.equal(env.APP_DATABASE_URL, 'runtime');
  assert.equal(env.REDIS_URL, 'inherited');
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.POSTGRES_PASSWORD, undefined);
});

test('web does not receive credentials from infrastructure', () => {
  const env = runtimeEnvironment('web', {}, { APP_DATABASE_URL: 'runtime', REDIS_URL: 'secret' }, {});
  assert.equal(env.APP_DATABASE_URL, undefined);
  assert.equal(env.REDIS_URL, undefined);
  assert.equal(env.API_URL, 'http://localhost:3001');
});

test('account key file is API-only and cannot turn on insecure cookies', () => {
  const keys = { ACCOUNT_MFA_KEY: 'test-key', ACCOUNT_MFA_KEY_ID: 'test-id', ACCOUNT_RATE_KEY: 'test-rate', ACCOUNT_ALLOW_LOOPBACK_HTTP: 'true' };
  const api = runtimeEnvironment('api', {}, {}, {}, keys);
  assert.equal(api.ACCOUNT_MFA_KEY, 'test-key');
  assert.equal(api.ACCOUNT_RATE_KEY, 'test-rate');
  assert.equal(api.ACCOUNT_ALLOW_LOOPBACK_HTTP, undefined);
  const web = runtimeEnvironment('web', {}, {}, {}, keys);
  assert.equal(web.ACCOUNT_MFA_KEY, undefined);
  assert.equal(web.ACCOUNT_RATE_KEY, undefined);
  assert.equal(runtimeEnvironment('api', {}, {}, { ACCOUNT_MFA_KEY: 'override' }, keys).ACCOUNT_MFA_KEY, 'override');
});
