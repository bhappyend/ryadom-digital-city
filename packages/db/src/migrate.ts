import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

export async function migrate(pool: Pool, directory = join(__dirname, '../migrations')): Promise<string[]> {
  const files = (await readdir(directory)).filter(f => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  let locked = false;
  let discard = false;
  const applied: string[] = [];
  try {
    const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(745912, 1) AS locked');
    if (!lock.rows[0]?.locked) throw new Error('Another migration is running; retry after it finishes');
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const previous = await client.query<{ name: string; checksum: string }>('SELECT name,checksum FROM schema_migrations ORDER BY name');
    for (const known of previous.rows) {
      if (!files.includes(known.name)) throw new Error(`Applied migration is missing: ${known.name}`);
    }
    for (const name of files) {
      const sql = await readFile(join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const known = previous.rows.find(row => row.name === name);
      if (known) {
        if (known.checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      if (previous.rows.some(row => row.name > name)) throw new Error(`Out-of-order migration: ${name}`);
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        applied.push(name);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    return applied;
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock(745912, 1)'); } catch { discard = true; }
    }
    client.release(discard);
  }
}
