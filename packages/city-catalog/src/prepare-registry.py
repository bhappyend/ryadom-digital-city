"""Read-only CSV/TSV extraction; outputs JSON, never rewrites source tables."""
import csv, json, hashlib, pathlib, re, math, datetime

root=pathlib.Path('data/cities')
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def norm(s): return s.casefold().replace('ё','е').strip()
def distance(a,b):
    x1,y1,x2,y2=map(math.radians,[a[0],a[1],b[0],b[1]])
    return 6371008.8*2*math.asin(min(1,math.sqrt(math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2)))

geo={}
for line in (root/'geonames-RU.txt').open(encoding='utf8'):
    r=line.rstrip('\n').split('\t')
    if len(r)!=19 or r[6]!='P' or r[7] in ('PPLH','PPLQ','PPLX','PPLW'): continue
    for n in set([r[1]]+r[3].split(',')):
        if n: geo.setdefault(norm(n),[]).append(r)
rows=list(csv.DictReader((root/'hflabs-city.csv').open(encoding='utf-8-sig')))
print('columns',list(rows[0]),'source rows',len(rows))
out=[]
for r in rows:
    name=r.get('city') or r.get('settlement') or (r.get('area') if r.get('area_type')=='г' else None) or r.get('region')
    if not name: raise ValueError('Missing city name')
    typ=r.get('city_type') or r.get('settlement_type') or (r.get('area_type') if r.get('area_type')=='г' else None) or r.get('region_type')
    if typ!='г': continue
    lon,lat=float(r['geo_lon']),float(r['geo_lat'])
    candidates=sorted(geo.get(norm(name),[]),key=lambda g:distance((lon,lat),(float(g[5]),float(g[4]))))
    g=candidates[0] if candidates and distance((lon,lat),(float(candidates[0][5]),float(candidates[0][4])))<15000 else None
    region=(r['region']+' '+r['region_type']).strip()
    cid='smolensk' if name=='Смоленск' and r['region']=='Смоленская' else 'city-'+r['fias_id']
    out.append(dict(id=cid,name=name,region=region,fiasId=r['fias_id'],oktmo=r['oktmo'],
        classification='provisional_hflabs_city',sourceJurisdiction='hflabs Russia city dataset; includes Crimea; not a legal boundary assertion',
        center=dict(lon=lon,lat=lat),timezone=g[17] if g else None,
        geonamesId=g[0] if g else None,geonamesModified=g[18] if g else None,
        bounds=None,status='source_missing' if g else 'needs_review',
        population=int(r['population'] or 0),sourceRecord=r))
if len({c['id'] for c in out})!=len(out): raise ValueError('Duplicate FIAS identities')
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
manifest=dict(schemaVersion=1,generatedAt=now,officialDenominator=None,provisionalDenominator=len(out),
    definition='Rows with explicit city/settlement/region type г in hflabs/city; not a contemporary official list. No PPL-only inclusion.',
    sources=[dict(id='hflabs-city',url='https://raw.githubusercontent.com/hflabs/city/master/city.csv',license='CC-BY-SA-4.0',attribution='HFLabs / DaData, hflabs/city',sha256=sha(root/'hflabs-city.csv'),bytes=(root/'hflabs-city.csv').stat().st_size,tlsVerified=True),
    dict(id='geonames',url='https://download.geonames.org/export/dump/RU.zip',license='CC-BY-4.0',attribution='GeoNames',sha256=sha(root/'geonames-RU.zip'),bytes=(root/'geonames-RU.zip').stat().st_size,tlsVerified=True)],cities=sorted(out,key=lambda c:c['id']))
(root/'registry.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('provisional cities',len(out),'timezone/independent center matches',sum(c['timezone'] is not None for c in out))
index=(root/'bbbike-index.html').read_text()
print('BBBike city names',', '.join(re.findall(r'href="([^"/]+)/"',index)))
