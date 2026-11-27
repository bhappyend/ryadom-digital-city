import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabasePool, DatabaseConfigurationError, escapeLike } from '../src';

test('missing/invalid database configuration fails without echoing credentials',()=>{
  for (const value of [undefined,'https://user:SECRET@example.test/db','postgresql://']) {
    assert.throws(()=>createDatabasePool(value),error=>error instanceof DatabaseConfigurationError && !error.message.includes('SECRET'));
  }
});
test('LIKE metacharacters are escaped as literal search text',()=>{
  assert.equal(escapeLike('50%_\\test'),String.raw`50\%\_\\test`);
});
