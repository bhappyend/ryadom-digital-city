import { createDatabasePool } from './pool';
import { migrate } from './migrate';
import { seed } from './seed';
import { grantRuntime,grantAdminRuntime } from './privileges';

async function main() {
  const command = process.argv[2];
  if (!['migrate','seed','grant-runtime','grant-admin-runtime'].includes(command ?? '')) throw new Error('Use migrate, seed, grant-runtime, or grant-admin-runtime');
  const pool = createDatabasePool(process.env.DATABASE_URL,'migration');
  try {
    if (command==='migrate') console.log(`Migrations applied: ${(await migrate(pool)).join(', ') || 'none'}`);
    if (command==='seed') { await seed(pool); console.log('Seed complete: taxonomy/city only; no organizations created'); }
    if (command==='grant-runtime') { await grantRuntime(pool,process.env.APP_DB_USER ?? 'ryadom_app'); console.log('Runtime least-privilege grants applied'); }
    if (command==='grant-admin-runtime') { await grantAdminRuntime(pool,process.env.APP_DB_USER ?? 'ryadom_app'); console.log('Admin service least-privilege grants applied'); }
  } finally { await pool.end(); }
}
main().catch((error:unknown)=>{
  const code=typeof error==='object' && error!==null && 'code' in error && typeof error.code==='string' && /^[A-Z0-9]{5}$/.test(error.code) ? ` (SQLSTATE ${error.code})` : '';
  console.error(`Database command failed${code}. Check configuration and migration state; credentials and raw errors are suppressed.`);
  process.exitCode=1;
});
