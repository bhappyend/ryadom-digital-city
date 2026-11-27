import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {VectorTile} from '@mapbox/vector-tile';
import {PbfReader} from 'pbf';
import {NominatimGeocoder} from '../../packages/gis/src/nominatim.ts';
import {ValhallaRouter} from '../../packages/gis/src/valhalla.ts';
import {CitySchema} from '../../packages/types/src/index.ts';
import {validateStyleMin} from '@maplibre/maplibre-gl-style-spec';
const evidence=new URL('./evidence/',import.meta.url);await mkdir(evidence,{recursive:true});
const get=async(url:string,init?:RequestInit)=>{const r=await fetch(url,{...init,signal:AbortSignal.timeout(5000)});assert.equal(r.status,200,url);return r;};
const api='http://127.0.0.1:3001/api/v1';
const cities=await(await get(`${api}/cities`)).json();
const city=CitySchema.parse(cities.data.find((x:{id:string})=>x.id==='smolensk'));
const shared={allowedOrigins:['http://127.0.0.1:8088','http://127.0.0.1:8002'],allowHttp:true,userAgent:'Ryadom-Patchvale/0.1 (https://vk.ru/patchvale)',timeoutMs:5000};
const geocoder=new NominatimGeocoder({...shared,baseUrl:'http://127.0.0.1:8088'});
const router=new ValhallaRouter({...shared,baseUrl:'http://127.0.0.1:8002'});
const geocodes=[];
for(const query of ['улица Ленина, 8, Смоленск','улица Ленина, 6, Смоленск','улица Октябрьской Революции, 1, Смоленск']){
 const result=await geocoder.search(query,city);assert(result.items.length>0,`No local result: ${query}`);geocodes.push({query,result});
}
const origin=geocodes[0].result.items[0].coordinates;
assert.equal((await geocoder.search('НесуществующаяПроверочнаяУлица824693, Смоленск',city)).items.length,0);
assert(Math.abs(origin.lon-32.049985)<0.001&&Math.abs(origin.lat-54.7823535)<0.001,'Control address outside tolerance');
const nearby=await(await get(`${api}/places/near?${new URLSearchParams({city:'smolensk',lon:String(origin.lon),lat:String(origin.lat),radius:'1500',category:'cafe',limit:'10'})}`)).json();
assert(nearby.data.items.length>0,'Imported cafe catalog empty');
const cafe=nearby.data.items[0];assert(cafe.provenance.some((p:{sourceId:string})=>p.sourceId==='osm'));
const routes=[];
for(const mode of ['walking','driving','cycling'] as const){
 const result=await router.route({origin,destination:cafe.coordinates,mode});
 assert(result.geometry.coordinates.length>2,'Route must use real street geometry');assert(result.maneuvers.length>=2);assert(result.distanceMeters>0);assert(result.durationSeconds>0);
 routes.push({mode,distanceMeters:result.distanceMeters,durationSeconds:result.durationSeconds,points:result.geometry.coordinates.length,maneuvers:result.maneuvers.length,result});
}
const tileOrigin='http://127.0.0.1:8089';
const tilejson=await(await get(`${tileOrigin}/tiles.json`)).json();
const style=await(await get(`${tileOrigin}/style.json`)).json();assert.deepEqual(validateStyleMin(style),[]);
const expected=['transportation','transportation_name','water','waterway','building','housenumber','place','park','landcover'];
for(const name of expected)assert(tilejson.vector_layers.some((x:{id:string})=>x.id===name),`Metadata missing ${name}`);
const tileX=(lon:number,z:number)=>Math.floor((lon+180)/360*2**z);
const tileY=(lat:number,z:number)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
const layers:Record<string,{features:number,keys:Set<string>}>=Object.create(null);let tiles=0;let riverPolygons=0;
const z=14,cx=tileX(origin.lon,z),cy=tileY(origin.lat,z);
for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
 const r=await get(`${tileOrigin}/tiles/${z}/${cx+dx}/${cy+dy}.pbf`);
 const t=new VectorTile(new PbfReader(new Uint8Array(await r.arrayBuffer())));tiles++;
 for(const [name,layer] of Object.entries(t.layers)){
  const stats=layers[name]??={features:0,keys:new Set()};stats.features+=layer.length;
  for(let i=0;i<layer.length;i++){const f=layer.feature(i);Object.keys(f.properties).forEach(k=>stats.keys.add(k));const geometry=f.loadGeometry();assert(geometry.length>0);if(name==='water'&&f.type===3)riverPolygons++;}
 }
}
for(const name of ['transportation','transportation_name','water','building','housenumber','place'])assert((layers[name]?.features??0)>0,`No real center features: ${name}`);
assert(layers.transportation.keys.has('class'));assert(layers.transportation_name.keys.has('name'));assert(layers.housenumber.keys.has('housenumber'));assert(riverPolygons>0,'No real inland water polygons');
const glyph=await get(`${tileOrigin}/glyphs/Noto%20Sans%20Regular/1024-1279.pbf`);const glyphBytes=(await glyph.arrayBuffer()).byteLength;assert(glyphBytes>1000,'Cyrillic glyph range empty');
for(const [path,status] of [['/tiles/99/0/0.pbf',400],['/tiles/14/999999/0.pbf',400],['/style.json?url=https://example.org',400],['/glyphs/Noto%20Sans%20Regular/1-256.pbf',400],['/%2e%2e/source.lock.json',404]] as const){assert.equal((await fetch(`${tileOrigin}${path}`)).status,status,path);}
assert.equal((await fetch(`${tileOrigin}/style.json`,{method:'POST'})).status,405);
assert.equal((await get(`${tileOrigin}/style.json`,{headers:{Origin:'https://untrusted.example'}})).headers.get('access-control-allow-origin'),null);
assert.equal((await get(`${tileOrigin}/style.json`,{headers:{Origin:'http://localhost:3000'}})).headers.get('access-control-allow-origin'),'http://localhost:3000');
const report={checkedAt:new Date().toISOString(),city,geocodes,cafe,nearbyCafeCount:nearby.data.items.length,routes,tiles:{checked:tiles,riverPolygons,layers:Object.fromEntries(Object.entries(layers).map(([k,v])=>[k,{features:v.features,keys:[...v.keys]}])),glyphBytes,styleLayers:style.layers.length,metadata:tilejson}};
await writeFile(new URL('live-smoke.json',evidence),JSON.stringify(report,null,2));
console.log(JSON.stringify({address:origin,geocodeQueries:geocodes.map(x=>({query:x.query,count:x.result.items.length})),cafe:{id:cafe.id,name:cafe.name,source:cafe.provenance},routes:routes.map(({result,...r})=>r),tileCount:tiles,riverPolygons,glyphBytes,layers:Object.keys(layers)},null,2));
