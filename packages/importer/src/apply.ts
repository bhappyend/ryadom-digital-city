import { ImportRepository, type createDatabasePool, type NormalizedPlace, type UpsertResult } from '@ryadom/db';
import type { Place } from '@ryadom/types';
import { NORMALIZER_REVISION } from './normalize';

// Reviewed schema has an explicit fail-closed ImportRepository field-override guard.
// Any new/modified migration requires another review, not an optimistic version range.
const reviewedMigrations = [
  ['001_catalog.sql','34783c82b5e071fa6ce388b35f3c564f285875ce4bf17a599c7b98b7671cfbf0'],
  ['002_normalization.sql','bedccc55778cb2001ce8f37a07eb8f5a992c4890106f7a2c7ade64ba2c4d9c51'],
  ['003_accounts_admin.sql','52b85d9e7eae2a467b401a4461c3abd0e4c19c8be3c4834a6951b7c501b15171'],
  ['004_ownership_claims.sql','02bba4d7b730b36c5601813ac7c5300f7b37fa5a3cd3dd5f9ece75c829905829'],
  ['005_owner_access.sql','b3e737da71f2dd945b835838a93c044033d0182f839138488448b4fc9bcdf1dc'],
];
export async function assertImportCompatibility(pool: ReturnType<typeof createDatabasePool>): Promise<void> {
  const result = await pool.query<{ name: string;checksum:string }>('SELECT name,checksum FROM schema_migrations ORDER BY name');
  if (![4,5].includes(result.rows.length)||JSON.stringify(result.rows.map(row => [row.name,row.checksum])) !== JSON.stringify(reviewedMigrations.slice(0,result.rows.length))) throw new Error('Import policy review required for this schema revision');
}

// DB05 explicitly owns source identity/locking/upsert policy. Never bypass its repository with ETL SQL.
export function toNormalized(place: Place): NormalizedPlace {
  return { slug: place.slug, name: place.name, cityId: place.cityId, categoryIds: place.categoryIds, address: place.address,
    coordinates: place.coordinates, description: place.description, phone: place.phone, website: place.website,
    openingHours: place.openingHours, accessibility: place.accessibility };
}
export type ApplyResult = { jobId: string; status: 'completed' | 'failed'; actions: Record<UpsertResult['action'], number>; applied: { sourceRecordId: string; placeId: string; action: UpsertResult['action'] }[]; errorCode: string | null };

export async function applyPlaces(repository: ImportRepository, places: Place[], rejectedCount: number, signal?: AbortSignal): Promise<ApplyResult> {
  const jobId = await repository.startImport('osm', { normalizerRevision: NORMALIZER_REVISION });
  const result: ApplyResult = { jobId, status: 'failed', actions: { inserted: 0, updated: 0, unchanged: 0, stale: 0 }, applied: [], errorCode: null };
  try {
    for (let i = 0; i < rejectedCount; i++) { signal?.throwIfAborted(); await repository.recordFailure(jobId); }
    // One concurrent write; per-record rollback and repeat-safe identity, never a public API loop.
    for (const place of places) {
      signal?.throwIfAborted();
      const provenance = place.provenance[0]!;
      const written = await repository.upsertPlace(jobId, toNormalized(place), provenance);
      result.actions[written.action]++;
      result.applied.push({ ...written, sourceRecordId: provenance.sourceRecordId });
    }
    await repository.finishImport(jobId, { status: 'completed' });
    result.status = 'completed';
  } catch {
    result.errorCode = signal?.aborted ? 'IMPORT_CANCELLED' : 'IMPORT_WRITE_FAILED';
    try { await repository.finishImport(jobId, { status: 'failed', errorCode: result.errorCode }); }
    catch { result.errorCode = 'IMPORT_JOURNAL_UNAVAILABLE'; }
  }
  return result;
}
