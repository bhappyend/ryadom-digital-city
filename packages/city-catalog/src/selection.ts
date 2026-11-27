import { CitySchema, DateTimeSchema, distanceBetween, type City, type Place } from '@ryadom/types';
import { normalizeElement } from '@ryadom/importer/normalize';
export type Position = [number, number];
export type Geometry = Position[][][];
export type Slice = {city:City;boundary:{geometry:Geometry;bounds:number[];recordId:string;timestamp:string;tags:Record<string,string>};candidates:unknown[]};
function inRing(ring:Position[],x:number,y:number):boolean{
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i]!,[xj,yj]=ring[j]!;
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }return inside;
}
export function contains(geometry:Geometry,point:{lon:number;lat:number}):boolean{
  return geometry.some(poly=>poly.length>0&&inRing(poly[0]!,point.lon,point.lat)&&!poly.slice(1).some(ring=>inRing(ring,point.lon,point.lat)));
}
export function commercial(input:unknown):boolean{
  const t=(input as {tags?:Record<string,string>})?.tags;if(!t)return false;
  if(Object.keys(t).some(k=>/^(disused|abandoned|demolished|razed|construction):/.test(k))||t.opening_hours==='closed'||t.access==='private'||t.access==='no')return false;
  return Boolean(t.shop&&!['no','vacant','closed','disused'].includes(t.shop))||['cafe','restaurant','fast_food','food_court','bar','pub','pharmacy','bank','fuel','car_wash','car_rental','dentist','veterinary'].includes(t.amenity??'')||['hotel','motel','hostel','guest_house'].includes(t.tourism??'')||['insurance','travel_agent','lawyer','accountant'].includes(t.office??'')||Boolean(t.craft);
}
function key(p:Place){return p.provenance[0]!.sourceRecordId;}
function title(p:Place){return p.name.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
export function assertNoCrossCity(places:Place[],seen=new Map<string,string>()){
  for(const p of places){const id=key(p);if(seen.has(id)&&seen.get(id)!==p.cityId)throw Error('Cross-city source identity collision');seen.set(id,p.cityId);}return seen;
}
export function select(slice:Slice,importedAt:string){
  const city=CitySchema.parse(slice.city);DateTimeSchema.parse(importedAt);
  if(!Array.isArray(slice.boundary.geometry)||slice.boundary.geometry.flat(2).length>200000)throw Error('Invalid/oversized city polygon');
  if(!contains(slice.boundary.geometry,city.center))throw Error('Source center is outside actual city polygon');
  if(slice.candidates.length>80)throw Error('Candidate budget exceeded');
  const issues:{row:number;code:string}[]=[],seen=new Set<string>(),places:Place[]=[];
  for(const [row,input] of slice.candidates.entries()){
    if(!commercial(input)){issues.push({row,code:'not_active_commercial_candidate'});continue;}
    const normalized=normalizeElement(input,row,{cityId:city.id,bounds:city.bounds,importedAt});
    const p=normalized.place;issues.push(...normalized.issues.map(i=>({row:i.row,code:i.code})));
    if(!p)continue;
    if(!contains(slice.boundary.geometry,p.coordinates)||distanceBetween(city.center,p.coordinates)>8000){issues.push({row,code:'outside_city_polygon_or_radius'});continue;}
    const source=key(p);if(seen.has(source)){issues.push({row,code:'duplicate_source_identity'});continue;}seen.add(source);places.push(p);
  }
  const score=(p:Place)=>(p.address==='Адрес не указан в OSM'?0:4)+(p.phone?2:0)+(p.website?2:0);
  places.sort((a,b)=>score(b)-score(a)||distanceBetween(city.center,a.coordinates)-distanceBetween(city.center,b.coordinates)||key(a).localeCompare(key(b),'en'));
  const selected:Place[]=[],categories=new Set<string>();
  const duplicate=(p:Place)=>selected.some(q=>title(p)===title(q)&&distanceBetween(p.coordinates,q.coordinates)<50);
  // Deterministic variety first; independent branches are retained when spatially distinct.
  for(const p of places){if(selected.length===5)break;if(!duplicate(p)&&p.categoryIds.some(c=>!categories.has(c))){selected.push(p);p.categoryIds.forEach(c=>categories.add(c));}}
  for(const p of places){if(selected.length===5)break;if(!selected.includes(p)&&!duplicate(p))selected.push(p);}
  return {city,selected,issues};
}
