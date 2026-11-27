import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createDatabasePool,ImportRepository,CatalogRepository,migrate,seed} from '@ryadom/db';
import {applyPlaces,toNormalized,assertImportCompatibility} from '@ryadom/importer/apply';
import {select,type Slice} from '../src/selection';
test('real city selections: PostGIS registration, per-record rollback, cancellation and replay',{timeout:120000},async t=>{
  assert.ok(process.env.DATABASE_URL,'Explicit DATABASE_URL required; isolated DB only');
  const file=JSON.parse(await readFile(path.resolve(__dirname,'../../../data/cities/derived/moscow.json'),'utf8')) as {cities:Slice[]};
  const sample=file.cities.slice(0,2).map(s=>({slice:s,...select(s,'2026-11-26T23:55:00Z')}));assert.equal(sample.length,2);
  const name='ryadom_citytest_'+randomUUID().replaceAll('-','');assert.match(name,/^ryadom_citytest_[a-f0-9]{32}$/);
  const base=new URL(process.env.DATABASE_URL),admin=createDatabasePool(base.toString(),'migration');let pool:ReturnType<typeof createDatabasePool>|undefined,created=false;
  try{
    await admin.query(`CREATE DATABASE "${name}"`);created=true;base.pathname='/'+name;pool=createDatabasePool(base.toString(),'migration');await migrate(pool);await seed(pool);await assertImportCompatibility(pool);
    const repo=new ImportRepository(pool),catalog=new CatalogRepository(pool);
    for(const s of sample)await repo.registerCity(s.city,{sourceId:'osm',sourceRecordId:s.slice.boundary.recordId,sourceUrl:'https://www.openstreetmap.org/'+s.slice.boundary.recordId,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:s.slice.boundary.timestamp,importedAt:'2026-11-26T23:55:00Z'});
    await t.test('actual rows and exact city/category/distance/provenance',async()=>{for(const s of sample){const applied=await applyPlaces(repo,s.selected,0);assert.equal(applied.status,'completed');assert.equal(applied.actions.inserted,5);const found=await catalog.searchPlaces({city:s.city.id,...s.city.center,radius:8000,page:1,limit:50,openNow:false});assert.equal(found.items.length,5);for(const p of found.items){assert.equal(p.cityId,s.city.id);assert.ok(p.distanceMeters<=8000);assert.ok(p.categoryIds.length);assert.equal(p.provenance[0]?.license,'ODbL-1.0');assert.ok(p.provenance[0]?.sourceUpdatedAt);}}});
    const before=(await pool.query('SELECT id,slug,city_id,name FROM places ORDER BY id')).rows;
    await t.test('checkpoint replay preserves IDs/count, no extra rows',async()=>{for(const s of sample){const replay=await applyPlaces(repo,s.selected,0);assert.equal(replay.actions.unchanged,5);}assert.deepEqual((await pool!.query('SELECT id,slug,city_id,name FROM places ORDER BY id')).rows,before);});
    await t.test('source-record failure rolls back place/categories and failed journal persists',async()=>{
      await pool!.query(`CREATE FUNCTION city_failure_probe() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$; CREATE TRIGGER city_failure_probe BEFORE INSERT OR UPDATE ON source_records FOR EACH ROW EXECUTE FUNCTION city_failure_probe()`);
      try{const p=sample[0]!.selected[0]!,job=await repo.startImport('osm',{normalizerRevision:2});await assert.rejects(repo.upsertPlace(job,{...toNormalized(p),name:'TEST ROLLBACK'}, {...p.provenance[0]!,sourceUpdatedAt:new Date().toISOString()}));await repo.finishImport(job,{status:'failed',errorCode:'INJECTED_FAILURE'});assert.deepEqual((await pool!.query('SELECT id,slug,city_id,name FROM places ORDER BY id')).rows,before);assert.equal((await pool!.query('SELECT status FROM import_jobs WHERE id=$1',[job])).rows[0].status,'failed');}finally{await pool!.query('DROP TRIGGER city_failure_probe ON source_records; DROP FUNCTION city_failure_probe()');}
    });
    await t.test('cancelled batch creates no new writes',async()=>{const controller=new AbortController();controller.abort();const result=await applyPlaces(repo,sample[0]!.selected,0,controller.signal);assert.equal(result.status,'failed');assert.equal(result.errorCode,'IMPORT_CANCELLED');assert.deepEqual((await pool!.query('SELECT id,slug,city_id,name FROM places ORDER BY id')).rows,before);});
    await t.test('invalid city registration rolls back and existing city cannot be silently changed',async()=>{const s=sample[0]!;const provenance={sourceId:'osm',sourceRecordId:s.slice.boundary.recordId,sourceUrl:'https://www.openstreetmap.org/'+s.slice.boundary.recordId,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:s.slice.boundary.timestamp,importedAt:new Date().toISOString()};await assert.rejects(repo.registerCity({...s.city,name:'TEST MUTATION'},provenance));await assert.rejects(repo.registerCity({...s.city,id:'test-invalid-city',center:{lon:0,lat:0}},provenance));assert.equal((await pool!.query('SELECT count(*)::int n FROM cities WHERE id=$1',['test-invalid-city'])).rows[0].n,0);});
  }finally{await pool?.end();if(created){await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()',[name]);await admin.query(`DROP DATABASE "${name}"`);}await admin.end();}
});
