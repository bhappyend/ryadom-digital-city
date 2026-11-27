import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { checkedBackupPath, backup, restoreCheck } from '../scripts/db.mjs';

test('backup paths reject traversal, outside targets, nested paths and non-dumps', () => {
  for (const input of ['../../package.json', '../outside.dump', '/tmp/outside.dump', 'nested/inside.dump', 'secret.txt', '.']) {
    assert.throws(() => checkedBackupPath(input, 'write'));
  }
});

test('restore rejects missing and corrupt checksum before any database command', () => {
  const name = `checksum-${randomBytes(8).toString('hex')}.dump`;
  const path = checkedBackupPath(name, 'write');
  writeFileSync(path, 'not a dump', { flag: 'wx' });
  try {
    assert.throws(() => restoreCheck(name), /checksum sidecar/);
    writeFileSync(`${path}.sha256`, '0'.repeat(64), { flag: 'wx' });
    assert.throws(() => restoreCheck(name), /SHA256 mismatch/);
  } finally {
    unlinkSync(path);
    unlinkSync(`${path}.sha256`);
  }
});

test('backup never overwrites an existing file and restore requires a file', () => {
  const name = `safety-${randomBytes(8).toString('hex')}.dump`;
  const path = checkedBackupPath(name, 'write');
  writeFileSync(path, 'preserve', { flag: 'wx' });
  try {
    assert.throws(() => backup(name), /EEXIST/);
    assert.equal(readFileSync(path, 'utf8'), 'preserve');
    assert.throws(() => checkedBackupPath(`${name}.missing.dump`, 'read'));
  } finally { unlinkSync(path); }
});
