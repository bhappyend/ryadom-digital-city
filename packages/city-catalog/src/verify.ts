import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createDatabasePool,CatalogRepository} from '@ryadom/db';
import {CitiesResponseSchema,type Place} from '@ryadom/types';
let stage='inputs';
async function main(){
  const args=process.argv.slice(2);
  const report=args.length===0?'verification.json':args.length===2&&args[0]==='--report'&&/^verification-[a-z0-9-]+\.json$/.test(args[1]??'')?args[1]!:null;
  if(!report)throw Error('Use --report verification-<snapshot>.json for a new immutable check');
  const root=path.resolve('data/cities'),showcase=JSON.parse(await readFile(path.join(root,'showcase35.json'),'utf8')) as {records:(Place&{apiPath:string})[]};
  const plan=JSON.parse(await readFile(path.join(root,'state/plan.json'),'utf8')) as {cities:{id:string;selectedIds:string[]}[]};
  const journal=JSON.parse(await readFile(path.join(root,'state/journal.json'),'utf8')) as {cities:Record<string,{ids?:string[];dbDistinctBusinessCount:number}>};
  const pool=createDatabasePool(process.env.APP_DATABASE_URL),repo=new CatalogRepository(pool);try{
    assert.equal(showcase.records.length,35);assert.equal(new Set(showcase.records.map(p=>p.id)).size,35);
    for(const p of showcase.records){stage='showcase_lookup';const live=await repo.findPlaceBySlug(p.slug);stage='showcase_compare';assert.ok(live);for(const k of ['id','name','cityId','categoryIds','address','coordinates','phone','website','openingState','openingHours','hoursVerifiedAt','rating','photos','provenance'] as const)assert.deepEqual(live[k],p[k]);assert.equal(p.apiPath,'/api/v1/places/'+p.slug);}
    stage='selected_checkpoint';
    const checked=[];
    for(const c of plan.cities){assert.ok(c.selectedIds.length<=5);const r=await pool.query<{id:string;distance:number;sourceId:string;sourceRecordId:string;license:string;timestamp:Date;categories:string[]}>(`SELECT p.id,ST_Distance(p.position,city.center) AS distance,s.source_id AS "sourceId",s.source_record_id AS "sourceRecordId",s.license,s.source_updated_at AS timestamp,
      ARRAY(SELECT category_id FROM place_categories pc WHERE pc.place_id=p.id ORDER BY category_id) AS categories
      FROM places p JOIN cities city ON city.id=p.city_id JOIN source_records s ON s.place_id=p.id
      WHERE p.city_id=$1 AND s.source_id='osm' AND s.source_record_id=ANY($2::text[]) AND p.active AND city.enabled`,[c.id,c.selectedIds]);
      const ids=r.rows.map(p=>p.id).sort();assert.deepEqual(ids,journal.cities[c.id]?.ids);assert.equal(ids.length,journal.cities[c.id]!.dbDistinctBusinessCount);for(const p of r.rows){assert.ok(Number(p.distance)<=8000);assert.equal(p.license,'ODbL-1.0');assert.ok(p.timestamp);assert.ok(p.categories.length);}checked.push({cityId:c.id,count:ids.length,ids,maxDistanceMeters:Math.max(...r.rows.map(p=>Number(p.distance)))});
    }
    stage='cities_schema';const cities=await repo.listCities();CitiesResponseSchema.parse({data:cities,meta:{requestId:'00000000-0000-4000-8000-000000000001',generatedAt:new Date().toISOString()}});
    const smolensk=await pool.query<{n:number}>("SELECT count(*)::int n FROM places WHERE city_id='smolensk'");assert.equal(smolensk.rows[0]!.n,2339);
    const total=await pool.query<{n:number}>('SELECT count(*)::int n FROM places');
    const evidence={verifiedAt:new Date().toISOString(),scope:'Read-only runtime-role PostGIS checks, not HTTP/browser QA',showcaseCount:35,showcaseCurrentFieldsAndProvenanceMatch:true,selectedBusinessCount:checked.reduce((n,c)=>n+c.count,0),selectedCities:checked.length,visibleCities:cities.length,citiesResponseSchemaLimit2000:true,totalPlaces:total.rows[0]!.n,smolenskPreserved:2339,idsUnchangedSinceApply:true,selectedCitiesEvidence:checked};
    stage='evidence_write';await writeFile(path.join(root,report),JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({...evidence,selectedCitiesEvidence:undefined}));
  }finally{await pool.end();}
}
main().catch((error:unknown)=>{const raw=(error as {code?:unknown})?.code;const code=typeof raw==='string'&&/^[A-Z0-9_]{1,40}$/.test(raw)?raw:'CHECK_FAILED';console.error(`Read-only verification failed: stage=${stage}, code=${code}. No raw error or secrets logged.`);process.exitCode=1;});
