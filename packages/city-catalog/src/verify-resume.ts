/** Bounded read-only source audit independent of pending admin schema migration. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createDatabasePool} from '@ryadom/db';
import type {Place} from '@ryadom/types';
async function main(){
 const root=path.resolve('data/cities'),bytes=await readFile(path.join(root,'showcase35.json'),'utf8');
 const showcase=JSON.parse(bytes) as {records:Place[];lineage:Record<string,string>};
 assert.equal(showcase.records.length,35);assert.equal(new Set(showcase.records.map(p=>p.id)).size,35);
 let lineageCount=0;for(const [file,sha] of Object.entries(showcase.lineage)){const b=await readFile(path.resolve(root,file));assert.equal(createHash('sha256').update(b).digest('hex'),sha);lineageCount++;}
 const pool=createDatabasePool(process.env.APP_DATABASE_URL);try{
  for(const p of showcase.records){
   const r=await pool.query(`SELECT id,slug,name,city_id AS "cityId",address,phone,website,opening_hours AS "openingHours",ST_X(position::geometry) AS lon,ST_Y(position::geometry) AS lat,
    ARRAY(SELECT category_id FROM place_categories pc WHERE pc.place_id=p.id ORDER BY category_id) AS categories FROM places p WHERE id=$1 AND active`,[p.id]);
   assert.equal(r.rows.length,1);const row=r.rows[0];for(const field of ['id','slug','name','cityId','address','phone','website','openingHours'] as const)assert.deepEqual(row[field],p[field]);
   assert.deepEqual({lon:row.lon,lat:row.lat},p.coordinates);assert.deepEqual(row.categories,[...p.categoryIds].sort());
   const sources=await pool.query(`SELECT source_id AS "sourceId",source_record_id AS "sourceRecordId",source_url AS "sourceUrl",license,attribution,source_updated_at AS "sourceUpdatedAt",imported_at AS "importedAt" FROM source_records WHERE place_id=$1 ORDER BY source_id,source_record_id`,[p.id]);
   assert.equal(sources.rows.length,p.provenance.length);
   for(const [i,s] of sources.rows.entries()){const expected=p.provenance[i]!;for(const k of ['sourceId','sourceRecordId','sourceUrl','license','attribution'] as const)assert.equal(s[k],expected[k]);assert.equal(s.sourceUpdatedAt===null?null:new Date(s.sourceUpdatedAt).toISOString(),expected.sourceUpdatedAt===null?null:new Date(expected.sourceUpdatedAt).toISOString());assert.equal(new Date(s.importedAt).toISOString(),new Date(expected.importedAt).toISOString());}
  }
  const counts=await pool.query(`SELECT (SELECT count(*)::int FROM places) AS places,(SELECT count(*)::int FROM cities WHERE enabled) AS cities,(SELECT count(*)::int FROM places WHERE city_id=$1) AS smolensk`,['smolensk']);assert.equal(counts.rows[0].smolensk,2339);
  const table=await pool.query('SELECT to_regclass($1) IS NOT NULL AS present',['public.place_admin_metadata']);
  const report={verifiedAt:new Date().toISOString(),showcaseSha256:createHash('sha256').update(bytes).digest('hex'),uniqueIdsVerified:35,currentDbFieldsAndProvenanceMatch:true,lineageHashesVerified:lineageCount,counts:counts.rows[0],adminMetadataTablePresent:table.rows[0].present,repositoryCheck:table.rows[0].present?'not_retried':'blocked: SQLSTATE 42P01, pending migration003; no migration attempted',scope:'Runtime role SELECT only; no downloads, imports, owner or payment mutations'};
  await writeFile(path.join(root,'verification-resume-source-20261127.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));
 }finally{await pool.end();}
}
main().catch(()=>{console.error('Bounded read-only source audit failed; no raw data or secrets logged');process.exitCode=1;});
