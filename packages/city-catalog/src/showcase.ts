import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createDatabasePool,CatalogRepository} from '@ryadom/db';
import {commercial} from './selection';
import type {Place} from '@ryadom/types';

type Candidate={id:string;slug:string;cityId:string;name:string;cityName:string;region:string;categoryIds:string[];address:string;phone:string|null;website:string|null;recordId:string};
export function choose35(candidates:Candidate[]){
  const selected:Candidate[]=[],remaining=[...candidates].sort((a,b)=>a.recordId.localeCompare(b.recordId,'en'));
  const regions=new Set<string>(),cities=new Set<string>(),categories=new Map<string,number>();
  while(selected.length<35&&remaining.length){
    const score=(c:Candidate)=>c.categoryIds.reduce((n,k)=>n+(categories.has(k)?0:100),0)+(regions.has(c.region)?0:20)+(cities.has(c.cityId)?0:10)+(c.address==='Адрес не указан в OSM'?0:4)+(c.phone?2:0)+(c.website?2:0)-c.categoryIds.reduce((n,k)=>n+(categories.get(k)??0),0);
    remaining.sort((a,b)=>score(b)-score(a)||a.recordId.localeCompare(b.recordId,'en'));
    const next=remaining.shift()!;
    if(selected.some(p=>p.id===next.id||p.recordId===next.recordId))continue;
    if(selected.filter(p=>p.cityId===next.cityId).length>=3)continue;
    selected.push(next);regions.add(next.region);cities.add(next.cityId);next.categoryIds.forEach(k=>categories.set(k,(categories.get(k)??0)+1));
  }
  if(selected.length!==35)throw Error('Insufficient actual business candidates');return selected;
}
async function main(){
  const root=path.resolve('data/cities'),tags=new Map<string,Record<string,string>>(),lineage:Record<string,string>={};
  for(const filename of (await readdir(path.join(root,'derived'))).filter(n=>n.endsWith('.json')).sort()){
    const bytes=await readFile(path.join(root,'derived',filename),'utf8');lineage['derived/'+filename]=createHash('sha256').update(bytes).digest('hex');
    const doc=JSON.parse(bytes) as {cities:{candidates:{type:string;id:number;tags:Record<string,string>}[]}[]};for(const city of doc.cities)for(const p of city.candidates)tags.set(`${p.type}/${p.id}`,p.tags);
  }
  const replay=await readFile(path.resolve('data/osm/smolensk-replay.json'),'utf8');lineage['../osm/smolensk-replay.json']=createHash('sha256').update(replay).digest('hex');
  for(const p of (JSON.parse(replay) as {elements:{type:string;id:number;tags?:Record<string,string>}[]}).elements)if(p.tags)tags.set(`${p.type}/${p.id}`,p.tags);
  const pool=createDatabasePool(process.env.APP_DATABASE_URL),catalog=new CatalogRepository(pool);
  try{
    const result=await pool.query<Candidate>(`SELECT p.id,p.slug,p.city_id AS "cityId",p.name,c.name AS "cityName",c.region,p.address,p.phone,p.website,s.source_record_id AS "recordId",
      ARRAY(SELECT category_id FROM place_categories pc WHERE pc.place_id=p.id ORDER BY category_id) AS "categoryIds"
      FROM places p JOIN cities c ON c.id=p.city_id JOIN source_records s ON s.place_id=p.id
      WHERE p.active AND c.enabled AND s.source_id='osm' AND s.license='ODbL-1.0' AND s.source_updated_at IS NOT NULL ORDER BY s.source_record_id LIMIT 10000`);
    const candidates=result.rows.filter(p=>{const t=tags.get(p.recordId);return t&&(commercial({tags:t})||(['fitness_centre','sports_centre'].includes(t.leisure??'')&&!['private','no'].includes(t.access??''))||t.amenity==='cinema'||t.leisure==='amusement_arcade');});
    const chosen=choose35(candidates),records=[];
    for(const c of chosen){const p=await catalog.findPlaceBySlug(c.slug);if(!p||p.id!==c.id)throw Error('Selected DB place changed');const actual=p as Place;
      records.push({id:actual.id,slug:actual.slug,cityId:actual.cityId,cityName:c.cityName,region:c.region,name:actual.name,categoryIds:actual.categoryIds,address:actual.address,coordinates:actual.coordinates,phone:actual.phone,website:actual.website,
        openingState:actual.openingState,openingHours:actual.openingHours,hoursVerifiedAt:actual.hoursVerifiedAt,rating:actual.rating,photos:actual.photos,provenance:actual.provenance,
        apiPath:'/api/v1/places/'+encodeURIComponent(actual.slug),webPath:'/places/'+encodeURIComponent(actual.slug),
        listingOrigin:'open_source_starter',ownershipStatus:'not_claimed_by_this_manifest',paymentStatus:'not_asserted',operatingStatusEvidence:'OSM active tags only; operation not independently confirmed'});
    }
    const manifest={schemaVersion:1,measuredAt:new Date().toISOString(),purpose:'35 real diverse businesses for read-only admin showcase, not paid customers, owners, advertisers or partners',
      count:records.length,cityCount:new Set(records.map(p=>p.cityId)).size,regionCount:new Set(records.map(p=>p.region)).size,categoryIds:[...new Set(records.flatMap(p=>p.categoryIds))].sort(),
      selection:'Deterministic greedy: unseen commercial categories, then source regions/cities, actual address and contacts; sourceRecordId tie break; max3 per city',lineage,records};
    await writeFile(path.join(root,'showcase35.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({count:manifest.count,cities:manifest.cityCount,regions:manifest.regionCount,categories:manifest.categoryIds}));
  }finally{await pool.end();}
}
if(process.argv[1]?.endsWith('showcase.ts'))main().catch(()=>{console.error('Read-only showcase generation failed; no DB mutations performed.');process.exitCode=1;});
