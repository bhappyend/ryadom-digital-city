import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { Pool } from 'pg';
import { PlacesQuerySchema, PlaceSchema, NearbyPlaceSchema, type Provenance } from '@ryadom/types';
import { CatalogRepository, ImportRepository, createDatabasePool, migrate, seed, grantRuntime, withTransaction, SMOLENSK_SEED, type NormalizedPlace } from '../src';

// Never writes fixtures into ryadom. Creates and drops ONLY a freshly generated test database.
test('real PostGIS repository integration', {timeout:120_000},async t=>{
  assert.ok(process.env.DATABASE_URL,'DATABASE_URL required (owner; ephemeral database creation)');
  const base = new URL(process.env.DATABASE_URL);
  const database = `ryadom_dbtest_${randomUUID().replaceAll('-','')}`;
  assert.match(database,/^ryadom_dbtest_[0-9a-f]{32}$/);
  const admin = createDatabasePool(base.toString(),'migration');
  let pool:Pool|undefined;
  let runtime:Pool|undefined;
  let created=false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created=true;
    base.pathname=`/${database}`;
    pool=createDatabasePool(base.toString(),'migration');
    const db=pool;
    const catalog=new CatalogRepository(db);
    const imports=new ImportRepository(db);
    await t.test('transactional migrations and repeatable seed; real version/SRID/indexes',async()=>{
      assert.deepEqual(await migrate(db),['001_catalog.sql','002_normalization.sql','003_accounts_admin.sql','004_ownership_claims.sql']);
      assert.deepEqual(await migrate(db),[]);
      await seed(db); await seed(db);
      assert.equal((await catalog.listCategories()).length,14);
      assert.deepEqual((await catalog.listCities())[0],SMOLENSK_SEED);
      const r=await db.query('SELECT ST_SRID(center::geometry) AS srid,PostGIS_Lib_Version() AS version FROM cities');
      assert.equal(r.rows[0].srid,4326); assert.match(r.rows[0].version,/^3\.4\./);
      const indexes=await db.query("SELECT indexdef FROM pg_indexes WHERE tablename='places'");
      assert.ok(indexes.rows.some(r=>(r.indexdef as string).includes('USING gist ("position")')) || indexes.rows.some(r=>(r.indexdef as string).includes('USING gist (position)')));
      assert.equal((await catalog.getStats()).metrics.find(m=>m.key==='places')?.value,0);
      assert.deepEqual((await catalog.listPlatformReviews()).items,[]);
      assert.equal((await db.query('SELECT count(*)::int AS count FROM places')).rows[0].count,0);
    });
    await t.test('advisory migration lock refuses simultaneous runner',async()=>{
      const lock=await db.connect();
      try { await lock.query('SELECT pg_advisory_lock(745912,1)'); await assert.rejects(migrate(db),/Another migration/); }
      finally { await lock.query('SELECT pg_advisory_unlock(745912,1)');lock.release(); }
    });
    await t.test('failed SQL migration rolls back DDL and journal; checksum mutation rejected',async()=>{
      const dir=await mkdtemp(join(tmpdir(),'ryadom-db-migrations-'));
      try {
        const original=await readFile(join(__dirname,'../migrations/001_catalog.sql'),'utf8').catch(()=>readFile(join(__dirname,'../../migrations/001_catalog.sql'),'utf8'));
        await writeFile(join(dir,'001_catalog.sql'),original);
        await writeFile(join(dir,'002_normalization.sql'),await readFile(join(__dirname,'../migrations/002_normalization.sql'),'utf8'));
        await writeFile(join(dir,'003_accounts_admin.sql'),await readFile(join(__dirname,'../migrations/003_accounts_admin.sql'),'utf8'));
        await writeFile(join(dir,'004_ownership_claims.sql'),await readFile(join(__dirname,'../migrations/004_ownership_claims.sql'),'utf8'));
        await writeFile(join(dir,'005_failure.sql'),'CREATE TABLE rollback_probe(id int); SELECT 1/0;');
        await assert.rejects(migrate(db,dir));
        assert.equal((await db.query("SELECT to_regclass('public.rollback_probe') AS name")).rows[0].name,null);
        assert.equal((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name='005_failure.sql'")).rows[0].n,0);
        await writeFile(join(dir,'001_catalog.sql'),`${original}\n-- mutated`);
        await assert.rejects(migrate(db,dir),/modified/);
      } finally {
        assert.equal(dirname(resolve(dir)),resolve(tmpdir())); assert.match(basename(dir),/^ryadom-db-migrations-/);
        await rm(dir,{recursive:true,force:true});
      }
    });

    const registration={id:'integration-test',name:'TEST ONLY - isolated database',license:'test-fixture',attribution:'TEST ONLY integration fixture',sourceUrl:null,enabled:true};
    await imports.registerDataSource(registration);
    const job=await imports.startImport(registration.id);
    const provenance=(recordId:string,updated='2026-01-01T00:00:00Z'):Provenance=>({sourceId:registration.id,sourceRecordId:recordId,sourceUrl:null,license:registration.license,attribution:registration.attribution,sourceUpdatedAt:updated,importedAt:new Date().toISOString()});
    const fixture=(slug:string,overrides:Partial<NormalizedPlace>={}):NormalizedPlace=>({slug,name:`TEST ONLY ${slug}`,cityId:'smolensk',categoryIds:['cafe'],address:'TEST ONLY isolated fixture',coordinates:SMOLENSK_SEED.center,description:null,phone:null,website:null,openingHours:null,accessibility:'unknown',...overrides});
    const query=(overrides:Record<string,unknown>={})=>PlacesQuerySchema.parse({city:'smolensk',...SMOLENSK_SEED.center,radius:300,...overrides});
    let firstId='';
    await t.test('idempotent importer, stale protection, category update and journal consistency',async()=>{
      const p=fixture('test-first',{name:'TEST ONLY literal 50%_\\ café',accessibility:'yes',openingHours:'Mo-Fr 09:00-18:00'});
      const inserted=await imports.upsertPlace(job,p,provenance('first')); firstId=inserted.placeId;
      assert.equal(inserted.action,'inserted');
      assert.equal((await imports.upsertPlace(job,p,provenance('first'))).action,'unchanged');
      assert.equal((await imports.upsertPlace(job,{...p,slug:'test-proposed-rename'},provenance('first'))).action,'unchanged');
      assert.equal(await catalog.findPlaceBySlug('test-proposed-rename'),null);
      assert.equal((await imports.upsertPlace(job,{...p,name:'old content'},provenance('first','2025-01-01T00:00:00Z'))).action,'stale');
      assert.equal((await imports.upsertPlace(job,{...p,name:'same version mutated'},provenance('first'))).action,'stale');
      assert.equal((await imports.upsertPlace(job,{...p,categoryIds:['cafe','pharmacy']},provenance('first','2026-02-01T00:00:00Z'))).action,'updated');
      const saved=await catalog.findPlaceBySlug(p.slug); assert.ok(saved); PlaceSchema.parse(saved);
      assert.equal(saved.id,firstId); assert.deepEqual(saved.categoryIds,['cafe','pharmacy']);
      assert.equal(saved.openingState,'unknown'); assert.equal(saved.hoursVerifiedAt,null); assert.equal(saved.openingHours,p.openingHours);
      assert.equal(saved.rating,null); assert.deepEqual(saved.photos,[]);
      assert.equal(saved.provenance.length,1); assert.equal(saved.name,p.name);
      const counts=(await db.query('SELECT imported_count,skipped_count FROM import_jobs WHERE id=$1',[job])).rows[0];
      assert.deepEqual(counts,{imported_count:2,skipped_count:4});
    });
    await t.test('geography meter radius boundaries, exact distance and id tie-breaker',async()=>{
      for (const [slug,meters] of [['test-tie',0],['test-inside',299.99],['test-outside',300.01],['test-far',1499.99]] as const) {
        const projected=await db.query(`SELECT ST_X(p::geometry) AS lon,ST_Y(p::geometry) AS lat FROM
          (SELECT ST_Project(ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3::double precision,pi()/2) AS p) a`,[SMOLENSK_SEED.center.lon,SMOLENSK_SEED.center.lat,meters]);
        await imports.upsertPlace(job,fixture(slug,{coordinates:projected.rows[0]}),provenance(slug));
      }
      const result=await catalog.searchPlaces(query());
      assert.equal(result.pagination.total,3);
      assert.ok(result.items.every(p=>p.distanceMeters<=300));
      const inside=result.items.find(p=>p.slug==='test-inside'); assert.ok(inside); assert.ok(Math.abs(inside.distanceMeters-299.99)<0.005);
      const ties=result.items.filter(p=>p.distanceMeters<0.001).map(p=>p.id);
      assert.deepEqual(ties,[...ties].sort()); result.items.forEach(p=>NearbyPlaceSchema.parse(p));
      assert.equal((await catalog.searchPlaces(query({radius:1500}))).pagination.total,5);
      const srid=(await db.query('SELECT ST_SRID(position::geometry) AS srid FROM places LIMIT 1')).rows[0].srid;assert.equal(srid,4326);
    });
    await t.test('category, literal search, injection, accessibility, unknown hours/ratings filters',async()=>{
      assert.equal((await catalog.searchPlaces(query({category:'pharmacy'}))).pagination.total,1);
      assert.equal((await catalog.searchPlaces(query({accessibility:'yes'}))).pagination.total,1);
      assert.equal((await catalog.searchPlaces(query({accessibility:'no'}))).pagination.total,0);
      assert.equal((await catalog.searchPlaces(query({q:'50%_\\'}))).pagination.total,1);
      assert.equal((await catalog.searchPlaces(query({q:"%' OR 1=1 --"}))).pagination.total,0);
      assert.equal((await catalog.searchPlaces(query({q:'%_'}))).pagination.total,1);
      assert.equal((await catalog.searchPlaces(query({openNow:true}))).pagination.total,0);
      assert.equal((await catalog.searchPlaces(query({rating:0}))).pagination.total,0);
      assert.equal((await catalog.searchPlaces(query({city:'unknown'}))).pagination.total,0);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM places')).rows[0].n,5);
    });
    await t.test('bounded pagination includes empty page total and maximum limit',async()=>{
      for(let i=0;i<51;i++) await imports.upsertPlace(job,fixture(`test-page-${i}`),provenance(`page-${i}`));
      const first=await catalog.searchPlaces(query({limit:50}));
      const second=await catalog.searchPlaces(query({limit:50,page:2}));
      assert.equal(first.items.length,50); assert.equal(first.pagination.total,54); assert.equal(first.pagination.hasMore,true);
      assert.equal(second.items.length,4);assert.equal(second.pagination.hasMore,false);
      assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,54);
      const empty=await catalog.searchPlaces(query({page:100,limit:50}));assert.equal(empty.items.length,0);assert.equal(empty.pagination.total,54);
      await assert.rejects(catalog.searchPlaces({...query(),limit:51}));
      await assert.rejects(catalog.searchPlaces({...query(),radius:10001}));
      await assert.rejects(catalog.searchPlaces({...query(),radius:299}));
      await assert.rejects(catalog.searchPlaces({...query(),page:101}));
    });
    await t.test('GiST radius index is usable and disabled/inactive records are excluded',async()=>{
      await withTransaction(db,async client=>{
        await client.query('SET LOCAL enable_seqscan=off');
        const explained=await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM places p
          WHERE active AND ST_DWithin(position,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,300)
          ORDER BY ST_Distance(position,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography),id LIMIT 50`,
        [SMOLENSK_SEED.center.lon,SMOLENSK_SEED.center.lat]);
        assert.ok(JSON.stringify(explained.rows).includes('places_position_gist'));
        t.diagnostic(`Isolated fixture EXPLAIN execution ms: ${explained.rows[0]['QUERY PLAN'][0]['Execution Time']} (index usability only; enable_seqscan=off)`);
      });
      await db.query('UPDATE places SET active=false WHERE id=$1',[firstId]);
      try {assert.equal(await catalog.findPlaceBySlug('test-first'),null);}
      finally {await db.query('UPDATE places SET active=true WHERE id=$1',[firstId]);}
      await db.query("UPDATE cities SET enabled=false WHERE id='smolensk'");
      try {assert.equal((await catalog.searchPlaces(query())).pagination.total,0);assert.equal(await catalog.findPlaceBySlug('test-first'),null);}
      finally {await db.query("UPDATE cities SET enabled=true WHERE id='smolensk'");}
    });
    await t.test('source uniqueness, concurrent retry, rollback and invalid provenance protection',async()=>{
      const before=(await db.query('SELECT count(*)::int AS n FROM places')).rows[0].n;
      await assert.rejects(imports.upsertPlace(job,fixture('test-first'),provenance('collision')));
      assert.equal((await db.query('SELECT count(*)::int AS n FROM places')).rows[0].n,before);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM source_records WHERE source_record_id='collision'")).rows[0].n,0);
      await assert.rejects(imports.upsertPlace(job,fixture('test-bad-license'),{...provenance('bad'),license:'unlicensed'}));
      await assert.rejects(withTransaction(db,async client=>{
        await client.query("INSERT INTO data_sources(id,name,license,attribution) VALUES('rollback-source','test','test','test')");throw new Error('intentional rollback');
      }),/intentional rollback/);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM data_sources WHERE id='rollback-source'")).rows[0].n,0);
      const secondJob=await imports.startImport(registration.id);
      const results=await Promise.all([imports.upsertPlace(job,fixture('test-concurrent'),provenance('concurrent')),imports.upsertPlace(secondJob,fixture('test-concurrent'),provenance('concurrent'))]);
      assert.equal(results[0]?.placeId,results[1]?.placeId);assert.deepEqual(results.map(r=>r.action).sort(),['inserted','unchanged']);
      await assert.rejects(db.query(`INSERT INTO source_records SELECT * FROM source_records WHERE source_record_id='concurrent'`),e=>(e as {code:string}).code==='23505');
      await imports.finishImport(secondJob,{status:'completed'});
    });
    await t.test('report durable receipt and FK; no fabricated statistics; published review only',async()=>{
      const receipt=await catalog.createReport({placeId:firstId,reason:'other',description:'TEST ONLY isolated integration report',consent:true});assert.ok(receipt);
      assert.equal((await db.query('SELECT count(*)::int AS n FROM reports WHERE id=$1',[receipt.id])).rows[0].n,1);
      assert.equal(await catalog.createReport({placeId:randomUUID(),reason:'other',description:'TEST ONLY unknown record',consent:true}),null);
      await assert.rejects(db.query("INSERT INTO reports(place_id,reason,description) VALUES($1,'other','TEST ONLY unknown FK')",[randomUUID()]),e=>(e as {code:string}).code==='23503');
      const stats=await catalog.getStats('smolensk');
      assert.deepEqual(stats.metrics.map(m=>m.key),['places','cities']);
      assert.equal(stats.metrics.find(m=>m.key==='places')?.value,57);
      await db.query(`INSERT INTO platform_reviews(author_name,rating,body,source,consent_recorded_at,status,published_at)
        VALUES('TEST ONLY',4,'TEST ONLY draft','test',now(),'draft',NULL),
        ('TEST ONLY',5,'TEST ONLY published','test',now(),'published',now()),
        ('TEST ONLY',3,'TEST ONLY future','test',now(),'published',now()+interval '1 day')`);
      assert.equal((await catalog.listPlatformReviews()).pagination.total,1);
      assert.equal((await catalog.listPlatformReviews({page:100})).pagination.total,1);
    });
    await t.test('runtime role can read and report but cannot modify catalog/journal/schema',async()=>{
      assert.ok(process.env.APP_DATABASE_URL,'APP_DATABASE_URL required for least privilege integration');
      const runtimeUrl=new URL(process.env.APP_DATABASE_URL);runtimeUrl.pathname=`/${database}`;
      const role=decodeURIComponent(runtimeUrl.username);await grantRuntime(db,role);await grantRuntime(db,role);
      runtime=createDatabasePool(runtimeUrl.toString());const api=new CatalogRepository(runtime);
      assert.ok((await api.searchPlaces(query())).items.length>0);
      assert.ok(await api.createReport({placeId:firstId,reason:'other',description:'TEST ONLY runtime report permission',consent:true}));
      await assert.rejects(runtime.query("UPDATE places SET name='bad'"),e=>(e as {code:string}).code==='42501');
      await assert.rejects(runtime.query('SELECT * FROM import_jobs'),e=>(e as {code:string}).code==='42501');
      await assert.rejects(runtime.query('SELECT description FROM reports'),e=>(e as {code:string}).code==='42501');
      await assert.rejects(runtime.query('CREATE TABLE forbidden(id int)'),e=>(e as {code:string}).code==='42501');
      await assert.rejects(runtime.query('SELECT pg_sleep(4)'),e=>(e as {code:string}).code==='57014');
      assert.equal((await runtime.query('SELECT 1 AS alive')).rows[0].alive,1);
    });
    await t.test('missing source time uses import observation order; invalid input never partly persists',async()=>{
      const undated={...provenance('undated'),sourceUpdatedAt:null,importedAt:'2026-03-01T00:00:00Z'};
      const p=fixture('test-undated');await imports.upsertPlace(job,p,undated);
      assert.equal((await imports.upsertPlace(job,{...p,name:'old observation'},{...undated,importedAt:'2026-02-01T00:00:00Z'})).action,'stale');
      assert.equal((await imports.upsertPlace(job,{...p,name:'unversioned changed payload'},{...undated,importedAt:'2026-04-01T00:00:00Z'})).action,'stale');
      const count=(await db.query('SELECT imported_count FROM import_jobs WHERE id=$1',[job])).rows[0].imported_count;
      await assert.rejects(imports.upsertPlace(job,fixture('test-no-city',{cityId:'not-registered'}),provenance('no-city')));
      assert.equal((await db.query("SELECT count(*)::int AS n FROM places WHERE slug='test-no-city'")).rows[0].n,0);
      assert.equal((await db.query('SELECT imported_count FROM import_jobs WHERE id=$1',[job])).rows[0].imported_count,count);
      await assert.rejects(imports.upsertPlace(job,fixture('test-bad-url',{website:'javascript:alert(1)'}),provenance('bad-url')));
      await assert.rejects(catalog.createReport({placeId:firstId,reason:'other',description:'TEST ONLY invalid consent',consent:false as true}));
    });
    await t.test('normalizer revisions reprocess equal source timestamps without lying about dates',async()=>{
      const source=provenance('revision','2026-04-01T00:00:00Z');
      const original=fixture('test-revision',{categoryIds:['shopping']});
      const initial=await imports.upsertPlace(job,original,source);
      const fixed={...original,slug:'test-new-slug-proposal',categoryIds:['pharmacy'] as NormalizedPlace['categoryIds']};
      const revision2=await imports.startImport(registration.id,{normalizerRevision:2});
      assert.equal((await imports.upsertPlace(revision2,fixed,source)).action,'updated');
      const saved=await catalog.findPlaceBySlug(original.slug);assert.ok(saved);
      assert.equal(saved.id,initial.placeId);assert.equal(saved.slug,original.slug);assert.deepEqual(saved.categoryIds,['pharmacy']);
      assert.equal(Date.parse(saved.provenance[0]!.sourceUpdatedAt!),Date.parse(source.sourceUpdatedAt!));
      assert.equal((await imports.upsertPlace(revision2,fixed,source)).action,'unchanged');
      assert.equal((await imports.upsertPlace(revision2,original,source)).action,'stale');
      assert.equal((await imports.upsertPlace(job,original,{...source,sourceUpdatedAt:'2026-05-01T00:00:00Z'})).action,'stale');
      assert.deepEqual((await db.query('SELECT normalizer_revision,imported_count,skipped_count FROM import_jobs WHERE id=$1',[revision2])).rows[0],{normalizer_revision:2,imported_count:1,skipped_count:2});
      await imports.finishImport(revision2,{status:'completed'});
      const revision3=await imports.startImport(registration.id,{normalizerRevision:3});
      assert.equal((await imports.upsertPlace(revision3,original,{...source,sourceUpdatedAt:'2026-03-01T00:00:00Z'})).action,'stale');
      assert.equal((await imports.upsertPlace(revision3,fixed,source)).action,'unchanged');
      const advanced=(await db.query('SELECT normalizer_revision,import_job_id,source_updated_at FROM source_records WHERE source_id=$1 AND source_record_id=$2',[registration.id,'revision'])).rows[0];
      assert.equal(advanced.normalizer_revision,3);assert.equal(advanced.import_job_id,revision3);assert.equal(advanced.source_updated_at.getTime(),Date.parse(source.sourceUpdatedAt!));
      assert.equal((await catalog.findPlaceBySlug(original.slug))?.updatedAt,saved.updatedAt);
      const revision4=await imports.startImport(registration.id,{normalizerRevision:4});
      await assert.rejects(imports.upsertPlace(revision4,{...fixed,cityId:'not-registered'},source));
      assert.equal((await db.query('SELECT normalizer_revision FROM source_records WHERE place_id=$1',[initial.placeId])).rows[0].normalizer_revision,3);
      assert.equal((await db.query('SELECT imported_count FROM import_jobs WHERE id=$1',[revision4])).rows[0].imported_count,0);
      assert.deepEqual((await catalog.findPlaceBySlug(original.slug))?.categoryIds,['pharmacy']);
      await imports.finishImport(revision3,{status:'completed'});
      await imports.finishImport(revision4,{status:'failed',errorCode:'TEST_ROLLBACK'});
      await assert.rejects(imports.startImport(registration.id,{normalizerRevision:0}));
      await assert.rejects(imports.startImport(registration.id,{normalizerRevision:2.5}));
    });
    await t.test('import completion counters and closed-job rejection',async()=>{
      await imports.recordFailure(job);await imports.finishImport(job,{status:'completed'});
      const row=(await db.query('SELECT status,failed_count FROM import_jobs WHERE id=$1',[job])).rows[0];
      assert.deepEqual(row,{status:'completed',failed_count:1});
      await assert.rejects(imports.upsertPlace(job,fixture('test-closed-job'),provenance('closed-job')),/finished/);
    });
    await t.test('city registration is transactional, source-checked and preserves existing city data',async()=>{
      const city={...SMOLENSK_SEED,id:'test-city',name:'TEST ONLY city',enabled:false};
      const source=provenance('city-record');
      assert.equal(await imports.registerCity(city,source),'inserted');
      assert.equal(await imports.registerCity(city,{...source,importedAt:new Date().toISOString()}),'unchanged');
      await assert.rejects(imports.registerCity({...city,name:'conflicting name'},source),/review/);
      await assert.rejects(imports.registerCity({...city,id:'test-unlicensed'},{...source,license:'wrong'}));
      await assert.rejects(imports.registerCity({...city,id:'test-timezone',timezone:'invalid/timezone'},source));
      await assert.rejects(imports.registerCity({...city,id:'test-bounds',center:{lon:0,lat:0}},source));
      const stored=(await db.query('SELECT name,provenance FROM cities WHERE id=$1',[city.id])).rows[0];
      assert.equal(stored.name,city.name);assert.deepEqual(stored.provenance,source);
      assert.equal((await db.query("SELECT count(*)::int AS n FROM cities WHERE id IN ('test-unlicensed','test-timezone','test-bounds')")).rows[0].n,0);
    });
  } finally {
    await runtime?.end();await pool?.end();
    if(created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
