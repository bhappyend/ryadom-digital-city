import type { Pool } from 'pg';
import { CATEGORIES, CitySchema, ProvenanceSchema } from '@ryadom/types';
import { withTransaction } from './pool';

// One manual Nominatim request, not an application geocoder or a catalog of organizations.
export const SMOLENSK_SEED = CitySchema.parse({
  id:'smolensk',name:'Смоленск',region:'Смоленская область',countryCode:'RU',
  center:{lon:32.0471812,lat:54.7789701},bounds:[31.7883262,54.7075603,32.2095639,54.8503780],
  timezone:'Europe/Moscow',enabled:true,
});
export const CITY_PROVENANCE = ProvenanceSchema.parse({
  sourceId:'osm',sourceRecordId:'relation/3339993',sourceUrl:'https://www.openstreetmap.org/relation/3339993',
  license:'ODbL-1.0',attribution:'© OpenStreetMap contributors',sourceUpdatedAt:'2026-05-22T17:00:43Z',importedAt:new Date().toISOString(),
});

export async function seed(pool: Pool): Promise<void> {
  await withTransaction(pool,async client=>{
    await client.query('SELECT pg_advisory_xact_lock(745912,2)');
    await client.query(`INSERT INTO data_sources(id,name,license,attribution,source_url,enabled) VALUES('osm','OpenStreetMap',$1,$2,'https://www.openstreetmap.org/copyright',true)
      ON CONFLICT(id) DO NOTHING`,[CITY_PROVENANCE.license,CITY_PROVENANCE.attribution]);
    for (const [index,category] of CATEGORIES.entries()) {
      await client.query(`INSERT INTO categories(id,name,icon,marker,sort_order) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,icon=EXCLUDED.icon,marker=EXCLUDED.marker,sort_order=EXCLUDED.sort_order`,
      [category.id,category.name,category.icon,category.marker,index]);
    }
    const c = SMOLENSK_SEED;
    // Preserve later administrative edits. Seed repetition never refreshes provenance dates.
    await client.query(`INSERT INTO cities(id,name,region,country_code,center,bounds,timezone,enabled,provenance)
      VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,$10) ON CONFLICT(id) DO NOTHING`,
    [c.id,c.name,c.region,c.countryCode,c.center.lon,c.center.lat,c.bounds,c.timezone,c.enabled,CITY_PROVENANCE]);
  });
}
