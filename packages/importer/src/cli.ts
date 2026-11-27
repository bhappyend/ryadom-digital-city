import { mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { loadInput } from './input';
import { CATEGORY_IDS } from '@ryadom/types';
import { NORMALIZER_REVISION } from './normalize';

function options(args: string[]) {
  const values = new Map<string, string>(); const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i]!;
    if (['--apply', '--allow-rejections'].includes(key)) { if (flags.has(key)) throw new Error('Duplicate flag'); flags.add(key); }
    else if (['--input', '--manifest', '--report'].includes(key)) {
      const value = args[++i]; if (!value || value.startsWith('--') || values.has(key)) throw new Error('Missing/duplicate option'); values.set(key, value);
    } else throw new Error('Unknown option');
  }
  if (!values.get('--input') || !values.get('--manifest') || !values.get('--report')) throw new Error('Usage: --input FILE --manifest FILE --report NEW_FILE [--apply] [--allow-rejections]');
  return { input: values.get('--input')!, manifest: values.get('--manifest')!, report: values.get('--report')!, apply: flags.has('--apply'), allowRejections: flags.has('--allow-rejections') };
}

async function main() {
  const config = options(process.argv.slice(2));
  const importedAt = new Date().toISOString();
  const data = await loadInput(config.input, config.manifest, importedAt);
  if (!data.places.length) throw new Error('No accepted places; no DB writes');
  const errors = data.issues.filter(issue => issue.severity === 'error');
  await mkdir(path.dirname(path.resolve(config.report)), { recursive: true });
  // Reserve report before mutation. Reports never overwrite source or another run.
  const handle = await open(config.report, 'wx');
  const summary = { mode: config.apply ? 'apply' : 'dry-run', normalizerRevision: NORMALIZER_REVISION, importedAt, sourceHash: data.sourceHash, inputHash: data.inputHash, sourceUpdatedAt: data.sourceUpdatedAt,
    fetchedAt: data.fetchedAt, license: data.manifest.license, attribution: data.manifest.attribution, boundaryRecordId: data.boundaryRecordId, bounds: data.bounds,
    counts: { input: data.inputCount, accepted: data.places.length, rejected: errors.length, warnings: data.issues.filter(issue => issue.severity === 'warning').length,
      skipped: data.issues.filter(issue => issue.severity === 'skip').length, matchCandidates: data.candidates.length },
    categories: Object.fromEntries(CATEGORY_IDS.map(category => [category, data.places.filter(place => place.categoryIds.includes(category)).length])),
    issues: data.issues, manualReviewQueue: data.candidates, reviewQueueTruncated: data.reviewQueueTruncated,
  };
  let applied: unknown = null;
  try {
    if (config.apply && errors.length && !config.allowRejections) throw new Error('Rejected rows found; review dry-run report, then pass --allow-rejections explicitly');
    if (config.apply) {
      const { createDatabasePool, ImportRepository } = await import('@ryadom/db');
      const { applyPlaces, assertImportCompatibility } = await import('./apply.js');
      const pool = createDatabasePool(process.env.DATABASE_URL, 'migration');
      const abort = new AbortController(); const cancel = () => abort.abort();
      process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
      try {
        await assertImportCompatibility(pool);
        applied = await applyPlaces(new ImportRepository(pool), data.places, errors.length, abort.signal);
        if ((applied as { status: string }).status !== 'completed') process.exitCode = 1;
      } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); await pool.end(); }
    }
  } finally {
    try { await handle.writeFile(`${JSON.stringify({ ...summary, applied }, null, 2)}\n`); await handle.sync(); }
    finally { await handle.close(); }
  }
  console.log(JSON.stringify({ ...summary, issues: undefined, manualReviewQueue: undefined, applied: applied ? { ...(applied as object), applied: undefined } : null }, null, 2));
}
main().catch(() => { console.error('Import failed. Check input/manifest/options, reviewed rejections, local report and DB journal. No raw input or credentials are logged.'); process.exitCode = 1; });
