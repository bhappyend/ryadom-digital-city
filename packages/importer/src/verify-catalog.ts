/** Read-only evidence capture after explicit apply and rerun. No network acquisitions. */
import { readFile, writeFile } from 'node:fs/promises';
import { createDatabasePool, CatalogRepository } from '@ryadom/db';
import { PlacesQuerySchema } from '@ryadom/types';
import { loadInput } from './input';

async function main() {
  if (process.argv.slice(2).length !== 0) throw new Error('Run from repository root; evidence paths are fixed and exclusive');
  const input = await loadInput('data/osm/smolensk-replay.json', 'data/osm/source-manifest.json', new Date().toISOString());
  const first = JSON.parse(await readFile('data/osm/reports/apply-01.json', 'utf8'));
  const rerun = JSON.parse(await readFile('data/osm/reports/apply-02.json', 'utf8'));
  const admin = createDatabasePool(process.env.DATABASE_URL, 'migration');
  const runtime = createDatabasePool(process.env.APP_DATABASE_URL);
  try {
    const counts = await admin.query(`SELECT (SELECT count(*)::int FROM places) AS places,
      (SELECT count(*)::int FROM source_records WHERE source_id='osm') AS osm_source_records,
      (SELECT count(*)::int FROM (SELECT source_id,source_record_id FROM source_records GROUP BY source_id,source_record_id HAVING count(*)>1) d) AS duplicate_identities`);
    if (counts.rows[0].places !== input.places.length || counts.rows[0].osm_source_records !== input.places.length || counts.rows[0].duplicate_identities !== 0 || first.applied.actions.inserted !== input.places.length || rerun.applied.actions.unchanged !== input.places.length || rerun.applied.actions.inserted !== 0) throw new Error('Real import/rerun evidence does not match catalog');
    const jobs = await admin.query('SELECT id,status,started_at,finished_at,imported_count,skipped_count,failed_count,error_code FROM import_jobs WHERE id=ANY($1::uuid[]) ORDER BY started_at', [[first.applied.jobId, rerun.applied.jobId]]);
    if (jobs.rows.length !== 2 || jobs.rows.some(job => job.status !== 'completed')) throw new Error('Expected completed import journals');
    const categoryCounts = await runtime.query('SELECT category_id,count(*)::int AS count FROM place_categories GROUP BY category_id ORDER BY category_id');
    // This control address was independently verified by GIS06, docs/GIS.md (not a guessed point).
    const query = PlacesQuerySchema.parse({ city: 'smolensk', lon: 32.049985, lat: 54.7823535, radius: 1500, category: 'cafe', page: 1, limit: 5 });
    const catalog = new CatalogRepository(runtime);
    const nearby = await catalog.searchPlaces(query);
    if (nearby.items.length === 0 || nearby.items.some(item => item.distanceMeters > query.radius || !item.categoryIds.includes('cafe'))) throw new Error('Nearby real category search failed');
    const explain = await runtime.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT p.id,
      ST_Distance(p.position,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS distance_meters
      FROM places p WHERE p.active AND p.city_id=$3
      AND ST_DWithin(p.position,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$4)
      AND EXISTS(SELECT 1 FROM place_categories pc WHERE pc.place_id=p.id AND pc.category_id=$5)
      ORDER BY distance_meters,p.id LIMIT 5`, [query.lon, query.lat, query.city, query.radius, query.category]);
    const issuesByCode: Record<string, number> = {};
    for (const issue of input.issues) issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
    const evidence = { measuredAt: new Date().toISOString(), sourceHash: input.sourceHash, inputHash: input.inputHash, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors',
      sourceUpdatedAt: input.sourceUpdatedAt, boundaryRecordId: input.boundaryRecordId, counts: counts.rows[0], inputCounts: first.counts, issuesByCode, categoryCounts: categoryCounts.rows, jobs: jobs.rows,
      firstActions: first.applied.actions, rerunActions: rerun.applied.actions,
      controlAddress: { label: 'Смоленск, улица Ленина, 8', verification: 'docs/GIS.md; one manual Nominatim request 2026-11-26T23:16:58.972Z; OSM way/99066474' },
      query, pagination: nearby.pagination, sample: nearby.items.map(({ slug, name, address, coordinates, distanceMeters, provenance }) => ({ slug, name, address, coordinates, distanceMeters, provenance })),
      explain: explain.rows[0]['QUERY PLAN'], limitations: ['Record-level transaction rollback; earlier successful records remain committed on job failure', '56 same-name proximity pairs await manual review; no merges', 'Hours unknown, ratings null, photos empty', 'Future schema migrations block importer pending owner-field policy review'] };
    await writeFile('data/osm/validation-summary.json', `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
    await writeFile('data/osm/manual-review.json', `${JSON.stringify({ sourceHash: input.sourceHash, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', status: 'pending_manual_review', candidates: input.candidates }, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ counts: evidence.counts, nearbyTotal: nearby.pagination.total, sample: evidence.sample.map(({ name, distanceMeters, slug }) => ({ name, distanceMeters, slug })), firstActions: evidence.firstActions, rerunActions: evidence.rerunActions }, null, 2));
  } finally { await runtime.end(); await admin.end(); }
}
main().catch(() => { console.error('Catalog evidence capture failed; verify local schema, reports, env and exclusive output files'); process.exitCode = 1; });
