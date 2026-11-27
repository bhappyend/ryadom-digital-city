import { readFile, writeFile } from 'node:fs/promises';
import { createDatabasePool, CatalogRepository } from '@ryadom/db';
import { loadInput } from './input';

async function main() {
  const input = await loadInput('data/osm/smolensk-replay.json', 'data/osm/source-manifest.json', new Date().toISOString());
  const before = JSON.parse(await readFile('data/osm/reports/apply-01.json', 'utf8'));
  const applied = JSON.parse(await readFile('data/osm/reports/apply-rev2-01.json', 'utf8'));
  const repeated = JSON.parse(await readFile('data/osm/reports/apply-rev2-02.json', 'utf8'));
  const queue = JSON.parse(await readFile('data/osm/taxonomy-corrections.json', 'utf8'));
  const identities = new Map(before.applied.applied.map((row: { sourceRecordId: string; placeId: string }) => [row.sourceRecordId, row.placeId]));
  const pool = createDatabasePool(process.env.DATABASE_URL, 'migration');
  try {
    const rows = (await pool.query(`SELECT sr.source_record_id,sr.place_id,sr.source_updated_at,sr.normalizer_revision,sr.content_hash,p.slug,
      array_agg(pc.category_id ORDER BY pc.category_id) AS categories FROM source_records sr JOIN places p ON p.id=sr.place_id JOIN place_categories pc ON pc.place_id=p.id
      WHERE sr.source_id='osm' GROUP BY sr.source_record_id,sr.place_id,sr.source_updated_at,sr.normalizer_revision,sr.content_hash,p.slug ORDER BY sr.source_record_id`)).rows;
    const desired = new Map(input.places.map(place => [place.provenance[0]!.sourceRecordId, place]));
    if (rows.length !== 2339 || identities.size !== 2339 || applied.applied.actions.updated !== 19 || repeated.applied.actions.unchanged !== 2339 || repeated.applied.actions.stale !== 0) throw new Error('Unexpected count/revision actions');
    for (const row of rows) {
      const place = desired.get(row.source_record_id)!;
      if (identities.get(row.source_record_id) !== row.place_id || place.slug !== row.slug || row.normalizer_revision !== 2 ||
        Date.parse(place.provenance[0]!.sourceUpdatedAt!) !== row.source_updated_at.getTime() || JSON.stringify([...place.categoryIds].sort()) !== JSON.stringify(row.categories)) throw new Error('Identity/timestamp/category mismatch');
    }
    const corrections = queue.corrections.map((old: { sourceRecordId: string; expectedOldContentHash: string; placeId: string }) => {
      const current = rows.find(row => row.source_record_id === old.sourceRecordId)!;
      if (current.place_id !== old.placeId || old.expectedOldContentHash === current.content_hash) throw new Error('Correction was not applied');
      return { ...old, actualContentHash: current.content_hash, actualCategoryIds: current.categories, sourceUpdatedAt: current.source_updated_at, normalizerRevision: current.normalizer_revision, status: 'corrected' };
    });
    const nearby = await new CatalogRepository(pool).searchPlaces({ city: 'smolensk', lon: 32.049985, lat: 54.7823535, radius: 1500, category: 'cafe', page: 1, limit: 5, openNow: false });
    await writeFile('data/osm/revision2-validation.json', `${JSON.stringify({ measuredAt: new Date().toISOString(), license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', sourceHash: input.sourceHash,
      normalizerRevision: 2, sourceIdentityCount: rows.length, unchangedDurableIdsSlugsAndSourceTimestamps: true, allCategoriesMatchFinalNormalizer: true,
      correctionJobId: applied.applied.jobId, correctionActions: applied.applied.actions, rerunJobId: repeated.applied.jobId, rerunActions: repeated.applied.actions,
      categories: applied.categories, nearbyTotal: nearby.pagination.total, corrections }, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ identities: rows.length, corrections: corrections.length, actions: applied.applied.actions, rerun: repeated.applied.actions, nearbyTotal: nearby.pagination.total }));
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Revision reconciliation verification failed'); process.exitCode = 1; });
