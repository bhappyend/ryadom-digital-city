import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const SOURCES={
  moscow:'https://download.bbbike.org/osm/bbbike/Moscow/Moscow.osm.pbf',
  petersburg:'https://download.bbbike.org/osm/bbbike/SanktPetersburg/SanktPetersburg.osm.pbf',
  kaliningrad:'https://download.geofabrik.de/russia/kaliningrad-latest.osm.pbf',
  caucasus:'https://download.geofabrik.de/russia/north-caucasus-fed-district-latest.osm.pbf',
  amur:'https://download.openstreetmap.fr/extracts/russia/far_eastern_federal_district/amur_oblast-latest.osm.pbf',
  kemerovo:'https://download.openstreetmap.fr/extracts/russia/siberian_federal_district/kemerovo_oblast-latest.osm.pbf',
  mari:'https://download.openstreetmap.fr/extracts/russia/volga_federal_district/mari_el_republic-latest.osm.pbf',
  kurgan:'https://download.openstreetmap.fr/extracts/russia/ural_federal_district/kurgan_oblast-latest.osm.pbf',
  novgorod:'https://download.openstreetmap.fr/extracts/russia/northwestern_federal_district/novgorod_oblast-latest.osm.pbf',
  kaluga:'https://download.openstreetmap.fr/extracts/russia/central_federal_district/kaluga_oblast-latest.osm.pbf',
  adygea:'https://download.openstreetmap.fr/extracts/russia/southern_federal_district/adygea_republic-latest.osm.pbf',
  smolensk:'https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast-latest.osm.pbf',
};
const root=path.resolve('data/cities');
export async function acquire(key){
  const url=SOURCES[key];if(!url)throw Error('Source is not allowlisted');
  await fs.mkdir(path.join(root,'raw'),{recursive:true});
  const dest=path.join(root,'raw',key+'.osm.pbf'),manifest=dest+'.json';
  try {const prior=JSON.parse(await fs.readFile(manifest,'utf8'));const bytes=await fs.readFile(dest);if(createHash('sha256').update(bytes).digest('hex')!==prior.sha256)throw Error('Cached file hash mismatch');console.log(key,'cached',prior.bytes);return prior;}catch(e){if(e.code!=='ENOENT')throw e;}
  // Explicit one-off fixed file endpoint; no public query service, redirect, TLS bypass, or infinite retries.
  let target=url,r;
  for(let hop=0;hop<3;hop++){
    r=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(120000),headers:{'User-Agent':'Ryadom-Patchvale-city-catalog/0.1 (https://t.me/patchvale)'}});
    if(![301,302,303,307,308].includes(r.status))break;
    const next=new URL(r.headers.get('location'),target),initial=new URL(url);
    if(next.origin!==initial.origin||next.username||next.password||next.search||!next.pathname.startsWith('/russia/')||!/^\/[a-z0-9/.-]+\.osm\.pbf$/.test(next.pathname))throw Error('Disallowed source redirect');
    target=next.href;await r.body?.cancel();
  }
  if(!r.ok)throw Error(`Source HTTP ${r.status}; stop and respect Retry-After ${r.headers.get('retry-after')??'unspecified'}`);
  const limit=150*1024*1024;if(Number(r.headers.get('content-length'))>limit)throw Error('Source over 150 MiB budget');
  const existing=(await fs.readdir(path.join(root,'raw'))).filter(n=>n.endsWith('.osm.pbf'));
  let aggregate=0;for(const file of existing)aggregate+=(await fs.stat(path.join(root,'raw',file))).size;
  if(aggregate+Math.max(0,Number(r.headers.get('content-length')))>640*1024*1024)throw Error('Aggregate 640 MiB acquisition budget exceeded');
  const handle=await fs.open(dest+'.part','w');let count=0;const hash=createHash('sha256');
  try{for await(const chunk of r.body){count+=chunk.length;if(count>limit||aggregate+count>640*1024*1024)throw Error('Source/aggregate acquisition budget exceeded');hash.update(chunk);await handle.write(chunk);}await handle.sync();}finally{await handle.close();}
  await fs.rename(dest+'.part',dest);
  const result={url,resolvedUrl:target,fetchedAt:new Date().toISOString(),sourceLastModified:r.headers.get('last-modified'),bytes:count,sha256:hash.digest('hex'),tlsVerified:true,license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',transform:'PBF source; metadata dates read individually, never inferred from HTTP date'};
  await fs.writeFile(manifest,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(key,'downloaded',count);return result;
}
if(process.argv[1]?.endsWith('download.mjs')){const key=process.argv[2];acquire(key).catch(e=>{console.error(e.message);process.exitCode=1});}
