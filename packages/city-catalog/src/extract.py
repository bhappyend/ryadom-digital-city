"""Bounded offline PBF processing with image-bundled pyosmium. No network or DB writes.

Run in the existing pinned GIS Nominatim image with --memory=768m --cpus=1,
read-only /catalog and /code, writable /out and temporary on-disk location index.
"""
import osmium, json, math, sys, pathlib, tempfile, hashlib, datetime

key=sys.argv[1]
if key not in ('moscow','petersburg','kaliningrad','caucasus','amur','kemerovo','mari','kurgan','novgorod','kaluga','adygea','smolensk'): raise ValueError('Unknown source')
root=pathlib.Path('/catalog'); out=pathlib.Path('/out'); out.mkdir(exist_ok=True)
registry=json.loads((root/'registry.json').read_text())
source=root/'raw'/(key+'.osm.pbf')
manifest=json.loads((root/'raw'/(key+'.osm.pbf.json')).read_text())
digest=hashlib.sha256()
with source.open('rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''): digest.update(chunk)
if digest.hexdigest()!=manifest['sha256']: raise ValueError('Source hash mismatch')
def norm(s): return s.casefold().replace('ё','е').replace('город ','').strip()
def distance(a,b):
    x1,y1,x2,y2=map(math.radians,[*a,*b]);return 6371008.8*2*math.asin(min(1,math.sqrt(math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2)))
def ring_contains(r,x,y):
    inside=False;j=len(r)-1
    for i in range(len(r)):
        xi,yi=r[i];xj,yj=r[j]
        if (yi>y)!=(yj>y) and x<(xj-xi)*(y-yi)/(yj-yi)+xi: inside=not inside
        j=i
    return inside
def contains(polys,x,y): return any(ring_contains(p[0],x,y) and not any(ring_contains(h,x,y) for h in p[1:]) for p in polys)
def business(t):
    return t.get('shop') not in (None,'no','vacant','closed','disused') or t.get('amenity') in ('cafe','restaurant','fast_food','bar','pub','pharmacy','bank','fuel','car_wash','car_rental','dentist','veterinary') or t.get('tourism') in ('hotel','motel','hostel','guest_house') or t.get('office') in ('insurance','travel_agent','lawyer','accountant') or bool(t.get('craft'))
reader=osmium.io.Reader(str(source)); header=reader.header();reader.close()
b=header.box()
try:bbox=[b.bottom_left.lon,b.bottom_left.lat,b.top_right.lon,b.top_right.lat]
except osmium.InvalidLocationError:bbox=None
cities=[c for c in registry['cities'] if c['timezone'] and (bbox is None or (bbox[0]<=c['center']['lon']<=bbox[2] and bbox[1]<=c['center']['lat']<=bbox[3]))]
byname={}
for c in cities: byname.setdefault(norm(c['name']),[]).append(c)
print(json.dumps(dict(source=key,bbox=bbox,candidateCities=len(cities))),flush=True)
class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__(); self.pois={c['id']:[] for c in cities};self.boundaries={};self.factory=osmium.geom.GeoJSONFactory();self.count=0
    def node(self,n):
        self.count+=1
        if not n.location.valid(): return
        t=dict(n.tags)
        if not (t.get('name:ru') or t.get('name')) or not business(t): return
        if any(t.get(k) in ('yes','true','1') for k in ('disused','abandoned','demolished','razed','construction')) or t.get('access') in ('no','private'): return
        x,y=n.location.lon,n.location.lat
        near=[(distance((x,y),(c['center']['lon'],c['center']['lat'])),c) for c in cities if abs(x-c['center']['lon'])<0.3 and abs(y-c['center']['lat'])<0.1]
        if not near: return
        d,c=min(near,key=lambda v:v[0])
        if d>8000 or (t.get('addr:city') and norm(t['addr:city'])!=norm(c['name'])): return
        ts=n.timestamp.isoformat().replace('+00:00','Z')
        if ts.startswith('1970'): return
        item=dict(type='node',id=n.id,lon=x,lat=y,timestamp=ts,tags=t)
        score=(bool(t.get('addr:full') or (t.get('addr:street') and t.get('addr:housenumber'))),bool(t.get('phone') or t.get('contact:phone') or t.get('website') or t.get('contact:website')),-d,-n.id)
        self.pois[c['id']].append((score,item))
        if len(self.pois[c['id']])>400:self.pois[c['id']]=sorted(self.pois[c['id']],reverse=True,key=lambda v:v[0])[:200]
    def area(self,a):
        t=dict(a.tags);name=t.get('name:ru') or t.get('name','')
        matches=byname.get(norm(name),[])
        if not matches or not (t.get('place') in ('city','town') or t.get('boundary')=='place' or (t.get('boundary')=='administrative' and t.get('admin_level')=='8')):return
        try: geometry=json.loads(self.factory.create_multipolygon(a))['coordinates']
        except (RuntimeError,ValueError):return
        vertices=[v for poly in geometry for ring in poly for v in ring]
        if len(vertices)>200000:return
        extent=[min(v[0] for v in vertices),min(v[1] for v in vertices),max(v[0] for v in vertices),max(v[1] for v in vertices)]
        for c in matches:
            if not contains(geometry,c['center']['lon'],c['center']['lat']):continue
            size=(extent[2]-extent[0])*(extent[3]-extent[1])
            if c['id'] in self.boundaries and self.boundaries[c['id']]['size']<=size:continue
            self.boundaries[c['id']]=dict(geometry=geometry,bounds=extent,size=size,recordId=('way/' if a.from_way() else 'relation/')+str(a.orig_id()),timestamp=a.timestamp.isoformat().replace('+00:00','Z'),tags=t)

handler=Extract()
with tempfile.TemporaryDirectory(prefix='city-catalog-') as tmp:
    handler.apply_file(str(source),locations=True,idx='sparse_file_array,'+tmp+'/locations.idx')
result=[]
for c in cities:
    boundary=handler.boundaries.get(c['id'])
    if not boundary:continue
    candidates=[p for _,p in sorted(handler.pois[c['id']],reverse=True,key=lambda v:v[0]) if contains(boundary['geometry'],p['lon'],p['lat'])][:80]
    city={k:c[k] for k in ('id','name','region','center','timezone')};city.update(countryCode='RU',bounds=boundary['bounds'],enabled=True)
    result.append(dict(city=city,boundary=boundary,candidates=candidates))
dataset=dict(schemaVersion=1,source=manifest,pbfHeaderTimestamp=header.get('osmosis_replication_timestamp'),extractedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    selectionMethod='Named commercial node candidates, nearest vetted city center within 8km, actual OSM city/place/admin_level8 polygon containment; no coordinate fabrication',cities=result)
dest=out/(key+'.json')
with dest.open('x',encoding='utf8') as f:json.dump(dataset,f,ensure_ascii=False,indent=2)
print(json.dumps(dict(source=key,nodesScanned=handler.count,citiesWithGeometry=len(result),citiesWith3Candidates=sum(len(r['candidates'])>=3 for r in result),candidateCounts={r['city']['name']:len(r['candidates']) for r in result}),ensure_ascii=False),flush=True)
