import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { admin, compose, database, root, sql } from './runtime.mjs';

const directory = resolve(root, 'infra/backups');

function sha256(target) {
  // Bounded pilot backup: avoid loading the dump into memory.
  const hash = createHash('sha256');
  const file = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let count;
    while ((count = readSync(file, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, count));
  } finally { closeSync(file); }
  return hash.digest('hex');
}

export function checkedBackupPath(input, mode) {
  // Canonical parents plus exclusive creation prevent traversal/symlink overwrite of unrelated files.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const canonical = realpathSync(directory);
  if (canonical !== directory) throw new Error('Backup directory must not be a symlink');
  const target = resolve(directory, input);
  const rel = relative(canonical, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel) || dirname(target) !== canonical || extname(target) !== '.dump') {
    throw new Error('Backup must be a .dump file directly inside infra/backups');
  }
  if (mode === 'read' && (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink())) {
    throw new Error('Backup must be an existing regular file');
  }
  return target;
}

export function backup(filename = `ryadom-${Date.now()}-${randomBytes(3).toString('hex')}.dump`) {
  const target = checkedBackupPath(filename, 'write');
  const descriptor = openSync(target, 'wx', 0o600);
  try {
    compose(['exec', '-T', 'db', 'pg_dump', '-U', admin, '-d', database, '--format=custom', '--no-owner', '--no-privileges'], {
      stdio: ['ignore', descriptor, 'pipe'], timeout: 120_000,
    });
  } catch (error) {
    closeSync(descriptor);
    unlinkSync(target); // Only the just-created file, never a caller-supplied existing file.
    throw error;
  }
  closeSync(descriptor);
  const checksum = `${target}.sha256`;
  if (existsSync(checksum)) throw new Error('Checksum already exists; preserve and inspect the new backup manually');
  writeFileSync(checksum, `${sha256(target)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Created infra/backups/${basename(target)}`);
  return target;
}

export function restoreCheck(filename) {
  const target = checkedBackupPath(filename, 'read');
  const checksum = `${target}.sha256`;
  if (!existsSync(checksum) || !lstatSync(checksum).isFile() || lstatSync(checksum).isSymbolicLink()) throw new Error('A trusted regular .dump.sha256 checksum sidecar is required');
  const expected = readFileSync(checksum, 'utf8').trim();
  if (!/^[a-f0-9]{64}$/.test(expected) || sha256(target) !== expected) throw new Error('Backup SHA256 mismatch; no database was created');
  const scratch = `ryadom_restore_${Date.now()}_${randomBytes(4).toString('hex')}`;
  if (!/^ryadom_restore_[0-9]+_[a-f0-9]{8}$/.test(scratch) || scratch === database || scratch === 'postgres') {
    throw new Error('Unsafe restore target');
  }
  let created = false;
  let descriptor;
  try {
    compose(['exec', '-T', 'db', 'createdb', '-U', admin, '--maintenance-db=postgres', '--template=template0', scratch]);
    created = true;
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    compose(['exec', '-T', 'db', 'pg_restore', '-U', admin, '--exit-on-error', '--no-owner', '--no-privileges', '-d', scratch], {
      stdio: [descriptor, 'pipe', 'pipe'], timeout: 120_000,
    });
    const version = sql('SELECT postgis_lib_version();', scratch);
    if (!version.startsWith('3.4.')) throw new Error('Restored PostGIS version differs from required 3.4');
    const tables = sql('SELECT count(*) FROM pg_tables WHERE schemaname=current_schema();', scratch);
    if (sql("SELECT to_regclass('public.places') IS NOT NULL;", scratch) === 't') {
      const counts = sql('SET statement_timeout=3000; SELECT count(*) FROM cities; SELECT count(*) FROM places;', scratch).split(/\r?\n/).slice(-2);
      console.log(`Restored public tables=${tables}; cities=${counts[0]}, places=${counts[1]} (snapshot counts; not a comparison with live concurrent imports).`);
    } else console.log(`Restored public tables=${tables}; application schema not present in this snapshot.`);
    // Persistently disposable fixture verifies restored GIS execution and write/read behavior.
    const result = sql("CREATE TABLE infra_restore_probe (id int PRIMARY KEY, location geography(Point,4326)); INSERT INTO infra_restore_probe VALUES (1, ST_SetSRID(ST_Point(32.05,54.78),4326)::geography); SELECT ST_DWithin(location,location,1) FROM infra_restore_probe WHERE id=1;", scratch);
    if (!result.endsWith('t')) throw new Error('Restore GIS probe failed');
    console.log(`Restore verified in disposable database ${scratch}; PostGIS ${version}.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created) {
      // The target is generated above, never configurable; there is no --clean on the application database.
      compose(['exec', '-T', 'db', 'dropdb', '-U', admin, '--maintenance-db=postgres', scratch]);
      console.log('Disposed restore database.');
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'backup') backup(process.argv[3]);
    else if (process.argv[2] === 'restore-check' && process.argv[3]) restoreCheck(process.argv[3]);
    else throw new Error('Usage: node infra/scripts/db.mjs backup [name.dump] | restore-check name.dump');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
