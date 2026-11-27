import { Pool, type PoolClient, type PoolConfig } from 'pg';

export class DatabaseConfigurationError extends Error {
  constructor(key: string) { super(`${key} must be a configured PostgreSQL connection URL`); this.name = 'DatabaseConfigurationError'; }
}

export function createDatabasePool(connectionString: string | undefined, purpose: 'runtime' | 'migration' = 'runtime'): Pool {
  const key = purpose === 'runtime' ? 'APP_DATABASE_URL' : 'DATABASE_URL';
  if (!connectionString) throw new DatabaseConfigurationError(key);
  try {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) throw new Error();
  } catch { throw new DatabaseConfigurationError(key); }
  const config: PoolConfig = {
    connectionString, max: purpose === 'runtime' ? 10 : 2,
    connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000,
    statement_timeout: 3000, query_timeout: purpose === 'runtime' ? 5000 : 35_000,
    application_name: `ryadom-${purpose}`, options: '-c search_path=public -c lock_timeout=2000',
  };
  // Never log a pg Error object (it may contain connection details or SQL input).
  const pool = new Pool(config);
  pool.on('error', () => { /* acquire/query rejects; idle disconnect is handled by pg */ });
  return pool;
}

export async function withTransaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
