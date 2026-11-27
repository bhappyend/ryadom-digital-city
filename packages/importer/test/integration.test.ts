import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { AccountsRepository, AdminRepository, CatalogRepository, ImportRepository, createDatabasePool, migrate, seed } from '@ryadom/db';
import { CATEGORY_IDS, PlacesQuerySchema, distanceBetween, type Place } from '@ryadom/types';
import { loadInput } from '../src/input';
import { applyPlaces, toNormalized, assertImportCompatibility } from '../src/apply';

test('real OSM file → isolated real PostGIS → radius/category, rerun and rollback', { timeout: 120_000 }, async t => {
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL required; creates one isolated test database');
  const root = path.resolve(__dirname, '../../..');
  const input = await loadInput(path.join(root, 'data/osm/smolensk-replay.json'), path.join(root, 'data/osm/source-manifest.json'), new Date().toISOString());
  const sample = new Map<string, Place>();
  for (const category of CATEGORY_IDS) { const place = input.places.find(p => p.categoryIds.includes(category))!; sample.set(place.slug, place); }
  const places = [...sample.values()];
  const database = `ryadom_importtest_${randomUUID().replaceAll('-', '')}`;
  assert.match(database, /^ryadom_importtest_[a-f0-9]{32}$/);
  const base = new URL(process.env.DATABASE_URL);
  const admin = createDatabasePool(base.toString(), 'migration');
  let created = false;
  let pool: ReturnType<typeof createDatabasePool> | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    base.pathname = `/${database}`; pool = createDatabasePool(base.toString(), 'migration');
    await migrate(pool); await seed(pool);
    const imports = new ImportRepository(pool); const catalog = new CatalogRepository(pool);
    await t.test('unknown schema revision blocks ETL until owner-field policy is reviewed', async () => {
      await assertImportCompatibility(pool!);
      await pool!.query("INSERT INTO schema_migrations(name,checksum) VALUES('999_owner_policy_probe.sql','test-only')");
      try { await assert.rejects(assertImportCompatibility(pool!), /policy review/); }
      finally { await pool!.query("DELETE FROM schema_migrations WHERE name='999_owner_policy_probe.sql'"); }
      const known=(await pool!.query("SELECT checksum FROM schema_migrations WHERE name='005_owner_access.sql'")).rows[0].checksum;
      await pool!.query("UPDATE schema_migrations SET checksum='test-only-tampered' WHERE name='005_owner_access.sql'");
      try{await assert.rejects(assertImportCompatibility(pool!),/policy review/);}
      finally{await pool!.query("UPDATE schema_migrations SET checksum=$1 WHERE name='005_owner_access.sql'",[known]);}
    });
    await t.test('imports real objects and preserves source provenance, with no licensed media/ratings', async () => {
      const applied = await applyPlaces(imports, places, 0);
      assert.equal(applied.status, 'completed'); assert.equal(applied.actions.inserted, places.length);
      const place = await catalog.findPlaceBySlug(places[0]!.slug); assert.ok(place);
      assert.equal(place.provenance[0]?.sourceRecordId, places[0]!.provenance[0]?.sourceRecordId);
      assert.equal(place.openingState, 'unknown'); assert.equal(place.rating, null); assert.deepEqual(place.photos, []);
    });
    await t.test('PostGIS radius/category search returns actual distances and exact categories', async () => {
      for (const category of CATEGORY_IDS) {
        const origin = places.find(p => p.categoryIds.includes(category))!;
        const query = PlacesQuerySchema.parse({ city: 'smolensk', ...origin.coordinates, radius: 300, category });
        const found = await catalog.searchPlaces(query);
        assert.ok(found.items.some(p => p.slug === origin.slug));
        for (const item of found.items) { assert.ok(item.categoryIds.includes(category)); assert.ok(item.distanceMeters <= 300); assert.ok(Math.abs(item.distanceMeters - distanceBetween(item.coordinates, origin.coordinates)) < 5); }
      }
    });
    await t.test('rerun preserves count, durable IDs and payload; all source identities unchanged', async () => {
      const before = (await pool!.query('SELECT id,slug,name FROM places ORDER BY slug')).rows;
      const result = await applyPlaces(imports, places, 0);
      assert.equal(result.actions.unchanged, places.length); assert.equal(result.actions.inserted, 0);
      assert.deepEqual((await pool!.query('SELECT id,slug,name FROM places ORDER BY slug')).rows, before);
      assert.equal((await pool!.query('SELECT count(*)::int AS count FROM source_records')).rows[0].count, places.length);
    });
    await t.test('database failure after place/category updates rolls back record and leaves failed job journal', async () => {
      const before = (await pool!.query('SELECT row_to_json(p) AS place FROM places p ORDER BY slug')).rows;
      const sourcesBefore = (await pool!.query('SELECT row_to_json(s) AS source FROM source_records s ORDER BY source_record_id')).rows;
      await pool!.query(`CREATE FUNCTION importer_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'integration failure injection'; END $$;
        CREATE TRIGGER importer_failure_probe BEFORE INSERT OR UPDATE ON source_records FOR EACH ROW EXECUTE FUNCTION importer_failure_probe()`);
      try {
        const real = places[0]!;
        const changed = { ...real, name: `${real.name.slice(0, 170)} TEST-ROLLBACK`, provenance: [{ ...real.provenance[0]!, sourceUpdatedAt: new Date().toISOString() }] };
        const jobId = await imports.startImport('osm', { normalizerRevision: 2 });
        await assert.rejects(imports.upsertPlace(jobId, toNormalized(changed), changed.provenance[0]!));
        await imports.recordFailure(jobId); await imports.finishImport(jobId, { status: 'failed', errorCode: 'INJECTED_TEST_FAILURE' });
        assert.deepEqual((await pool!.query('SELECT row_to_json(p) AS place FROM places p ORDER BY slug')).rows, before);
        assert.deepEqual((await pool!.query('SELECT row_to_json(s) AS source FROM source_records s ORDER BY source_record_id')).rows, sourcesBefore);
        const journal = await pool!.query('SELECT status,failed_count,error_code FROM import_jobs WHERE id=$1', [jobId]);
        assert.deepEqual(journal.rows[0], { status: 'failed', failed_count: 1, error_code: 'INJECTED_TEST_FAILURE' });
      } finally { await pool!.query('DROP TRIGGER importer_failure_probe ON source_records; DROP FUNCTION importer_failure_probe()'); }
    });
    await t.test('cancelled job ends failed without importing remaining records', async () => {
      const abort = new AbortController(); abort.abort();
      const cancelled = await applyPlaces(imports, places, 0, abort.signal);
      assert.equal(cancelled.status, 'failed'); assert.equal(cancelled.errorCode, 'IMPORT_CANCELLED'); assert.equal(cancelled.applied.length, 0);
    });
    await t.test('revision2 corrects actual chemist taxonomy at the same OSM timestamp, keeps UUID/slug and reruns unchanged', async () => {
      const queue = JSON.parse(await readFile(path.join(root, 'data/osm/taxonomy-corrections.json'), 'utf8')) as { corrections: { sourceRecordId: string }[] };
      const real = input.places.find(p => p.provenance[0]!.sourceRecordId === queue.corrections[0]!.sourceRecordId)!;
      const revision1 = await imports.startImport('osm', { normalizerRevision: 1 });
      const old = await imports.upsertPlace(revision1, { ...toNormalized(real), categoryIds: ['pharmacy'] }, real.provenance[0]!);
      await imports.finishImport(revision1, { status: 'completed' });
      const before = await pool!.query('SELECT content_hash,source_updated_at FROM source_records WHERE place_id=$1', [old.placeId]);
      const corrected = await applyPlaces(imports, [real], 0);
      assert.equal(corrected.status, 'completed'); assert.equal(corrected.actions.updated, 1);
      assert.equal(corrected.applied[0]!.placeId, old.placeId);
      const place = await catalog.findPlaceBySlug(real.slug); assert.ok(place);
      assert.equal(place.id, old.placeId); assert.equal(place.slug, real.slug); assert.deepEqual(place.categoryIds, ['shopping']);
      assert.equal(Date.parse(place.provenance[0]!.sourceUpdatedAt!), Date.parse(real.provenance[0]!.sourceUpdatedAt!));
      const after = await pool!.query('SELECT content_hash,source_updated_at,normalizer_revision FROM source_records WHERE place_id=$1', [old.placeId]);
      assert.equal(after.rows[0].normalizer_revision, 2); assert.notEqual(after.rows[0].content_hash, before.rows[0].content_hash);
      assert.deepEqual(after.rows[0].source_updated_at, before.rows[0].source_updated_at);
      assert.equal((await applyPlaces(imports, [real], 0)).actions.unchanged, 1);
    });
    await t.test('reviewed004 permits imports while published admin overrides remain untouched',async()=>{
      await assertImportCompatibility(pool!);
      const account=await new AccountsRepository(pool!).bootstrapSuperAdmin({email:'import-policy@fixture.invalid',passwordPhc:'$argon2id$v=19$m=65536,t=3,p=1$test$test',displayName:'TEST ONLY editor',termsVersion:'test',privacyVersion:'test',emailVerifiedAt:new Date().toISOString()},{actorId:null,requestId:randomUUID()},'TEST ONLY independent policy check');
      const repo=new AdminRepository(pool!),ctx={actorId:account.id,requestId:randomUUID()},real=places[0]!;
      const existing=await catalog.findPlaceBySlug(real.slug);assert.ok(existing);
      const draft=await repo.execute('updateCatalogBusiness',{params:{placeId:existing.id},body:{expectedVersion:1,organization:{name:'TEST ONLY published operator correction',cityId:real.cityId,categoryIds:real.categoryIds,address:real.address,coordinates:real.coordinates,description:null,phone:null,website:null,openingHours:null},addressParts:{street:real.address,house:null},provenance:real.provenance,photos:[],reason:'TEST ONLY independently verified editorial change'}},ctx) as any;
      await repo.execute('publishCatalogBusiness',{params:{placeId:existing.id},body:{expectedVersion:draft.version}},ctx);
      const before=await catalog.findPlaceBySlug(real.slug),source=(await pool!.query('SELECT row_to_json(s) v FROM source_records s WHERE place_id=$1',[existing.id])).rows;
      const applied=await applyPlaces(imports,[{...real,name:'TEST ONLY upstream replacement',provenance:[{...real.provenance[0]!,sourceUpdatedAt:new Date().toISOString()}]}],0);
      assert.equal(applied.status,'failed');assert.equal(applied.errorCode,'IMPORT_WRITE_FAILED');assert.equal(applied.applied.length,0);
      assert.deepEqual(await catalog.findPlaceBySlug(real.slug),before);
      assert.deepEqual((await pool!.query('SELECT row_to_json(s) v FROM source_records s WHERE place_id=$1',[existing.id])).rows,source);
      assert.equal((await pool!.query('SELECT imported_count FROM import_jobs WHERE id=$1',[applied.jobId])).rows[0].imported_count,0);
    });
  } finally {
    await pool?.end();
    if (created) await admin.query(`DROP DATABASE "${database}"`);
    await admin.end();
  }
});
