import { readFile, writeFile, mkdir, rename, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import { createDatabasePool, ImportRepository, CatalogRepository } from '@ryadom/db';
import { CitySchema, PlaceSchema, type Place } from '@ryadom/types';
import { assertImportCompatibility, applyPlaces } from '@ryadom/importer/apply';
import {select,assertNoCrossCity,type Slice} from './selection';

const root=path.resolve('data/cities'),state=path.join(root,'state');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
type Dataset={schemaVersion:number;source:{tlsVerified:boolean;sha256:string;url:string;fetchedAt:string};cities:Slice[]};
type PlanCity={id:string;dataset:string;datasetHash:string;selectedIds:string[];selected:Place[];issueCount:number};
type Plan={schemaVersion:1;createdAt:string;registryHash:string;officialDenominator:null;provisionalDenominator:number;cities:PlanCity[]};
type JournalRow={status:'source_missing'|'needs_review'|'partial'|'complete';selectedCount:number;dbDistinctBusinessCount:number;coverageComplete:boolean;jobId?:string;errorCode?:string;ids?:string[];maxDistanceMeters?:number};
type Journal={schemaVersion:1;updatedAt:string;cities:Record<string,JournalRow>};
async function json<T>(file:string,max=64*1024*1024):Promise<T>{const b=await readFile(file);if(b.length>max)throw Error('Local input budget exceeded');return JSON.parse(b.toString('utf8')) as T;}
async function atomic(file:string,value:unknown){const h=await open(file+'.tmp','w');try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}await rename(file+'.tmp',file);}
async function loadDatasets(){const map=new Map<string,{dataset:Dataset;bytes:string}>();for(const name of (await readdir(path.join(root,'derived'))).filter(n=>/^[a-z]+\.json$/.test(n)).sort()){const bytes=await readFile(path.join(root,'derived',name),'utf8');if(Buffer.byteLength(bytes)>64*1024*1024)throw Error('Dataset budget exceeded');const dataset=JSON.parse(bytes) as Dataset;if(dataset.schemaVersion!==1||dataset.source.tlsVerified!==true||!dataset.source.sha256||!Array.isArray(dataset.cities)||dataset.cities.length>2000)throw Error('Untrusted dataset');map.set(name,{dataset,bytes});}return map;}
async function dryRun(extend=false){
  const registryBytes=await readFile(path.join(root,'registry.json'),'utf8'),registry=JSON.parse(registryBytes) as {cities:{id:string}[];provisionalDenominator:number};
  const prior=extend?await json<Plan>(path.join(state,'plan.json')):null;
  if(prior&&prior.registryHash!==hash(registryBytes))throw Error('Cannot extend changed registry');
  const valid=new Set(registry.cities.map(c=>c.id)),used=new Map<string,string>(),planned=new Set<string>(),cities:PlanCity[]=[...(prior?.cities??[])];
  for(const c of cities){planned.add(c.id);for(const id of c.selectedIds)used.set(id,c.id);}
  const datasets=await loadDatasets(),now=new Date().toISOString();
  for(const [dataset,{dataset:doc,bytes}] of datasets){for(const slice of doc.cities){
    if(!valid.has(slice.city.id))throw Error('City is absent from reviewed registry');if(planned.has(slice.city.id))continue;
    const result=select(slice,now);if(!result.selected.length)continue;
    assertNoCrossCity(result.selected,used);
    planned.add(slice.city.id);cities.push({id:slice.city.id,dataset,datasetHash:hash(bytes),selectedIds:result.selected.map(p=>p.provenance[0]!.sourceRecordId),selected:result.selected,issueCount:result.issues.length});
  }}
  const plan:Plan={schemaVersion:1,createdAt:now,registryHash:hash(registryBytes),officialDenominator:null,provisionalDenominator:registry.provisionalDenominator,cities};
  // A saved plan is immutable. Apply/replay this exact selection; never silently add another five.
  if(prior){await writeFile(path.join(state,'plan-'+hash(JSON.stringify(prior)).slice(0,16)+'.json'),JSON.stringify(prior,null,2)+'\n',{flag:'wx'}).catch(e=>{if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;});await atomic(path.join(state,'plan.json'),plan);}
  else await writeFile(path.join(state,'plan.json'),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({plannedCities:cities.length,selectedBusinesses:cities.reduce((n,c)=>n+c.selected.length,0),officialDenominator:null,provisionalDenominator:plan.provisionalDenominator}));
}
async function measure(pool:ReturnType<typeof createDatabasePool>,city:PlanCity):Promise<JournalRow>{
  const result=await pool.query<{id:string;sourceRecordId:string;distance:number}>(`SELECT DISTINCT p.id,s.source_record_id AS "sourceRecordId",ST_Distance(p.position,c.center) AS distance
    FROM places p JOIN cities c ON c.id=p.city_id JOIN source_records s ON s.place_id=p.id
    WHERE p.city_id=$1 AND p.active AND c.enabled AND s.source_id='osm' AND s.source_record_id=ANY($2::text[])
      AND s.license='ODbL-1.0' AND s.source_updated_at IS NOT NULL AND ST_DWithin(p.position,c.center,8000)
      AND EXISTS(SELECT 1 FROM place_categories pc WHERE pc.place_id=p.id AND pc.category_id=ANY($3::text[]))`,[city.id,city.selectedIds,['cafe','shopping','pharmacy','beauty','auto','hotel','bank','fuel','services','medicine']]);
  const count=result.rows.length;return {status:count>=3?'complete':'partial',selectedCount:city.selectedIds.length,dbDistinctBusinessCount:count,coverageComplete:count>=3,ids:result.rows.map(r=>r.id).sort(),maxDistanceMeters:Math.max(0,...result.rows.map(r=>Number(r.distance)))};
}
async function apply(){
  const plan=await json<Plan>(path.join(state,'plan.json'));if(plan.schemaVersion!==1||plan.cities.length>2000)throw Error('Invalid plan');
  if(hash(await readFile(path.join(root,'registry.json'),'utf8'))!==plan.registryHash)throw Error('Registry changed since dry-run');
  const datasets=await loadDatasets();const registry=await json<{cities:{id:string;status:string}[]}>(path.join(root,'registry.json'));
  let journal:Journal;try{journal=await json<Journal>(path.join(state,'journal.json'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;journal={schemaVersion:1,updatedAt:plan.createdAt,cities:Object.fromEntries(registry.cities.map(c=>[c.id,{status:c.status==='needs_review'?'needs_review':'source_missing',selectedCount:0,dbDistinctBusinessCount:0,coverageComplete:false}]))};}
  const signal=new AbortController();const cancel=()=>signal.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const pool=createDatabasePool(process.env.DATABASE_URL,'migration');
  try{
    await assertImportCompatibility(pool);const repo=new ImportRepository(pool);
    await repo.registerDataSource({id:'hflabs-city',name:'HFLabs / DaData city dataset (provisional)',license:'CC-BY-SA-4.0',attribution:'HFLabs / DaData, hflabs/city',sourceUrl:'https://github.com/hflabs/city',enabled:true});
    for(const pc of plan.cities){signal.signal.throwIfAborted();
      const ds=datasets.get(pc.dataset);if(!ds||hash(ds.bytes)!==pc.datasetHash)throw Error('Dataset changed since dry-run');
      const slice=ds.dataset.cities.find(s=>s.city.id===pc.id);if(!slice)throw Error('Plan city missing from dataset');
      const selected=select(slice,pc.selected[0]!.provenance[0]!.importedAt).selected.map(p=>PlaceSchema.parse(p));
      if(JSON.stringify(selected)!==JSON.stringify(pc.selected)||pc.selectedIds.length>5)throw Error('Selection changed or exceeded budget');
      const frozen=journal.cities[pc.id];if(frozen?.selectedCount&&frozen.ids&&frozen.selectedCount!==selected.length)throw Error('Prior city selection changed; review required');
      const registered=CitySchema.parse(slice.city);
      try{
        await repo.registerCity(registered,{sourceId:'hflabs-city',sourceRecordId:pc.id,sourceUrl:'https://github.com/hflabs/city/blob/master/city.csv',license:'CC-BY-SA-4.0',attribution:'HFLabs / DaData, hflabs/city',sourceUpdatedAt:null,importedAt:plan.createdAt});
        const result=await applyPlaces(repo,selected,0,signal.signal);const measured=await measure(pool,pc);
        journal.cities[pc.id]={...measured,jobId:result.jobId,...(result.status==='failed'||result.actions.stale?{status:'needs_review' as const,coverageComplete:false,errorCode:result.errorCode??'STALE_SOURCE'}:{})};
      }catch{journal.cities[pc.id]={status:'needs_review',selectedCount:selected.length,dbDistinctBusinessCount:0,coverageComplete:false,errorCode:'CITY_OR_IMPORT_FAILED'};}
      journal.updatedAt=new Date().toISOString();await atomic(path.join(state,'journal.json'),journal);
      console.log(pc.id,journal.cities[pc.id]!.status,journal.cities[pc.id]!.dbDistinctBusinessCount);
    }
    const visible=await new CatalogRepository(pool).listCities();console.log(JSON.stringify({visibleCities:visible.length,limit2000:visible.length<=2000}));
  }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);await pool.end();}
}
async function coverage(){const plan=await json<Plan>(path.join(state,'plan.json')),journal=await json<Journal>(path.join(state,'journal.json'));const registry=await json<{cities:{id:string;name:string;region:string}[]}>(path.join(root,'registry.json'));
  const counts:Record<string,number>={};for(const c of Object.values(journal.cities))counts[c.status]=(counts[c.status]??0)+1;
  const report={measuredAt:journal.updatedAt,officialDenominator:null,provisionalDenominator:plan.provisionalDenominator,counts,selectedBusinessCount:Object.values(journal.cities).reduce((n,c)=>n+c.dbDistinctBusinessCount,0),missing:registry.cities.filter(c=>!journal.cities[c.id]?.coverageComplete)};
  await atomic(path.join(root,'coverage.json'),report);console.log(JSON.stringify({...report,missing:report.missing.length}));
  const snapshot=`Измерение ${report.measuredAt}. Предварительный знаменатель **${report.provisionalDenominator}**, официальный **null**.\n\n- Complete: **${counts.complete??0}**.\n- Partial: **${counts.partial??0}**.\n- Source missing: **${counts.source_missing??0}**.\n- Needs review: **${counts.needs_review??0}**.\n- Всего выбранных записей, подтверждённых в БД: **${report.selectedBusinessCount}** (включая предыдущие batch, не число новых записей последнего запуска).\n- Городов без complete: **${report.missing.length}**.\n\nТочный поимённый список пропусков: [coverage.json](../data/cities/coverage.json), поле missing; состояния каждого города: [journal.json](../data/cities/state/journal.json). Исходные2339 записей Смоленска сохраняются отдельно; его выбранная пятёрка ещё требует отдельной сверки геометрии. GIS вне Смоленска этим импортом не включён.\n`;
  const doc=path.resolve('docs/CITY-COVERAGE.md'),text=await readFile(doc,'utf8');await atomicText(doc,text.split('## Текущее измерение')[0]+'## Текущее измерение\n\n'+snapshot);
  const handoff=path.resolve('docs/HANDOFFS/07.1.md'),handoffText=await readFile(handoff,'utf8');await atomicText(handoff,handoffText.split('## Последнее измерение')[0]+'## Последнее измерение\n\n'+snapshot.replaceAll('../data/','../../data/'));
}
async function atomicText(file:string,text:string){await writeFile(file+'.tmp',text);await rename(file+'.tmp',file);}
async function main(){await mkdir(state,{recursive:true});const [command,...rest]=process.argv.slice(2);
  if(command==='acquire'||command==='extract'){
    const {SOURCES,acquire}=await import('./download.mjs');const key=rest[0];if(rest.length!==1||!key||!Object.hasOwn(SOURCES,key))throw Error('One allowlisted source key required');
    if(command==='acquire'){await acquire(key);return;}
    await mkdir(path.join(root,'derived'),{recursive:true});
    try{await readFile(path.join(root,'derived',key+'.json'));console.log(key,'cached extraction; no CPU work');return;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const image=process.env.CITY_CATALOG_OSMIUM_IMAGE;if(!image||!/^sha256:[a-f0-9]{64}$/.test(image))throw Error('Set CITY_CATALOG_OSMIUM_IMAGE to reviewed local image SHA256 containing pyosmium');
    await new Promise<void>((resolve,reject)=>{const child=spawn('docker',['run','--rm','--memory=768m','--cpus=1','--network=none','-v',root+':/catalog:ro','-v',path.resolve(__dirname)+':/code:ro','-v',path.join(root,'derived')+':/out',image,'python3','/code/extract.py',key],{stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Offline extraction failed')));});return;
  }
  if(rest.length)throw Error('Unknown arguments');if(command==='dry-run')await dryRun();else if(command==='extend')await dryRun(true);else if(command==='apply')await apply();else if(command==='coverage')await coverage();else throw Error('Use acquire <source> | extract <source> | dry-run | extend | apply | coverage.');}
main().catch(()=>{console.error('Catalog command failed; inspect reviewed inputs and per-city journal. No secrets logged.');process.exitCode=1;});
