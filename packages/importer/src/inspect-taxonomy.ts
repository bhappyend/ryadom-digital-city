/** Read-only comparison; never alters DB timestamps or bypasses ImportRepository. */
import { writeFile } from 'node:fs/promises';
import { createDatabasePool } from '@ryadom/db';
import { loadInput } from './input';

async function main() {
  const input = await loadInput('data/osm/smolensk-replay.json', 'data/osm/source-manifest.json', new Date().toISOString());
  const pool = createDatabasePool(process.env.DATABASE_URL, 'migration');
  try {
    const current = await pool.query<{ source_record_id: string; place_id: string; content_hash: string; source_updated_at: Date; category_ids: string[] }>(`SELECT sr.source_record_id,sr.place_id,sr.content_hash,sr.source_updated_at,
      array_agg(pc.category_id ORDER BY pc.category_id) AS category_ids
      FROM source_records sr JOIN place_categories pc ON pc.place_id=sr.place_id WHERE sr.source_id='osm'
      GROUP BY sr.source_record_id,sr.place_id,sr.content_hash,sr.source_updated_at`);
    const indexed = new Map(current.rows.map(row => [row.source_record_id, row]));
    const corrections = input.places.flatMap(place => {
      const record = place.provenance[0]!; const row = indexed.get(record.sourceRecordId);
      if (!row || JSON.stringify([...place.categoryIds].sort()) === JSON.stringify(row.category_ids)) return [];
      return [{ sourceRecordId: record.sourceRecordId, placeId: row.place_id, slug: place.slug, sourceUpdatedAt: record.sourceUpdatedAt,
        expectedOldContentHash: row.content_hash, currentCategoryIds: row.category_ids, desiredCategoryIds: place.categoryIds,
        reason: 'shop=chemist sells household/hygiene/cosmetics; pharmacy requires amenity=pharmacy' }];
    });
    await writeFile('data/osm/taxonomy-corrections.json', `${JSON.stringify({ measuredAt: new Date().toISOString(), sourceHash: input.sourceHash, status: 'awaiting_reviewed_DB05_renormalization_API',
      license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', corrections }, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ corrections: corrections.length, writes: 0 }));
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Read-only taxonomy comparison failed'); process.exitCode = 1; });
