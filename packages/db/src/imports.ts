import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { CATEGORIES, CitySchema, IdSchema, PlaceSchema, ProvenanceSchema, type City, type Place, type Provenance } from '@ryadom/types';
import { withTransaction } from './pool';

const fields = ['slug','name','cityId','categoryIds','address','coordinates','description','phone','website','openingHours','accessibility'] as const;
export type NormalizedPlace = Pick<Place, typeof fields[number]>;
export type DataSourceRegistration = { id: string; name: string; license: string; attribution: string; sourceUrl: string | null; enabled: boolean };
export type UpsertResult = { placeId: string; action: 'inserted' | 'updated' | 'unchanged' | 'stale' };

function normalize(input: NormalizedPlace, provenance: Provenance): NormalizedPlace {
  if (Object.keys(input).some(key => !(fields as readonly string[]).includes(key))) throw new Error('Unknown normalized place field');
  const parsed = PlaceSchema.parse({...input,id:randomUUID(),openingState:'unknown',hoursVerifiedAt:null,rating:null,photos:[],provenance:[provenance],updatedAt:provenance.importedAt});
  return {
    slug:parsed.slug,name:parsed.name,cityId:parsed.cityId,
    categoryIds:CATEGORIES.map(c=>c.id).filter(id=>parsed.categoryIds.includes(id)),address:parsed.address,
    coordinates:parsed.coordinates,description:parsed.description,phone:parsed.phone,website:parsed.website,
    openingHours:parsed.openingHours,accessibility:parsed.accessibility,
  };
}

export class ImportRepository {
  constructor(private readonly pool: Pool) {}

  async registerCity(input:City, provenanceInput:Provenance):Promise<'inserted'|'unchanged'> {
    const city=CitySchema.parse(input);
    const provenance=ProvenanceSchema.parse(provenanceInput);
    try {new Intl.DateTimeFormat('en',{timeZone:city.timezone}).format();} catch {throw new Error('Invalid city timezone');}
    if(city.center.lon<city.bounds[0] || city.center.lon>city.bounds[2] || city.center.lat<city.bounds[1] || city.center.lat>city.bounds[3]) throw new Error('City center must be within viewport bounds');
    return withTransaction(this.pool,async client=>{
      const source=await client.query('SELECT license,attribution FROM data_sources WHERE id=$1 AND enabled FOR SHARE',[provenance.sourceId]);
      if(!source.rows[0] || source.rows[0].license!==provenance.license || source.rows[0].attribution!==provenance.attribution) throw new Error('City source absent, disabled, or policy mismatch');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`city:${city.id}`]);
      const existing=await client.query(`SELECT id,name,region,country_code AS "countryCode",bounds,timezone,enabled,
        jsonb_build_object('lon',ST_X(center::geometry),'lat',ST_Y(center::geometry)) AS center FROM cities WHERE id=$1 FOR UPDATE`,[city.id]);
      if(existing.rows[0]) {
        const prior=CitySchema.parse(existing.rows[0]);
        if(JSON.stringify(prior)!==JSON.stringify(city)) throw new Error('Existing city differs; administrative review required');
        return 'unchanged';
      }
      await client.query(`INSERT INTO cities(id,name,region,country_code,center,bounds,timezone,enabled,provenance)
        VALUES($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($5,$6),4326)::geography,$7,$8,$9,$10)`,
      [city.id,city.name,city.region,city.countryCode,city.center.lon,city.center.lat,city.bounds,city.timezone,city.enabled,provenance]);
      return 'inserted';
    });
  }

  async registerDataSource(input: DataSourceRegistration): Promise<void> {
    const checked = ProvenanceSchema.parse({sourceId:input.id,sourceRecordId:'registration',sourceUrl:input.sourceUrl,
      license:input.license,attribution:input.attribution,sourceUpdatedAt:null,importedAt:new Date().toISOString()});
    if (typeof input.enabled !== 'boolean' || typeof input.name !== 'string' || !input.name.trim() || input.name.length>200) throw new Error('Invalid data source registration');
    await this.pool.query(`INSERT INTO data_sources(id,name,license,attribution,source_url,enabled) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,license=EXCLUDED.license,attribution=EXCLUDED.attribution,source_url=EXCLUDED.source_url,enabled=EXCLUDED.enabled`,
    [checked.sourceId,input.name.trim(),checked.license,checked.attribution,checked.sourceUrl,input.enabled]);
  }

  async startImport(sourceId: string, options: {normalizerRevision?:number} = {}): Promise<string> {
    const revision=options.normalizerRevision ?? 1;
    if (!Number.isInteger(revision) || revision<1 || revision>2_147_483_647 || Object.keys(options).some(key=>key!=='normalizerRevision')) throw new Error('Invalid normalizer revision');
    const result = await this.pool.query(`INSERT INTO import_jobs(source_id,normalizer_revision)
      SELECT id,$2 FROM data_sources WHERE id=$1 AND enabled RETURNING id`, [sourceId,revision]);
    if (!result.rows[0]) throw new Error('Import source is absent or disabled');
    return result.rows[0].id as string;
  }

  async upsertPlace(jobId: string, input: NormalizedPlace, provenanceInput: Provenance): Promise<UpsertResult> {
    IdSchema.parse(jobId);
    const provenance = ProvenanceSchema.parse(provenanceInput);
    const place = normalize(input,provenance);
    return withTransaction(this.pool, async client => {
      const job = await client.query('SELECT id,normalizer_revision FROM import_jobs WHERE id=$1 AND source_id=$2 AND status=\'running\' FOR UPDATE', [jobId,provenance.sourceId]);
      if (!job.rows[0]) throw new Error('Import job is absent, finished, or belongs to another source');
      const revision=job.rows[0].normalizer_revision as number;
      const source = await client.query('SELECT license,attribution FROM data_sources WHERE id=$1 AND enabled FOR SHARE',[provenance.sourceId]);
      if (!source.rows[0] || source.rows[0].license!==provenance.license || source.rows[0].attribution!==provenance.attribution) throw new Error('Source license/attribution mismatch or source disabled');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([provenance.sourceId,provenance.sourceRecordId])]);
      const existingResult = await client.query(`SELECT sr.place_id,sr.source_updated_at,sr.imported_at,sr.content_hash,sr.normalizer_revision,p.slug
        FROM source_records sr JOIN places p ON p.id=sr.place_id WHERE sr.source_id=$1 AND sr.source_record_id=$2 FOR UPDATE OF sr,p`,[provenance.sourceId,provenance.sourceRecordId]);
      const existing = existingResult.rows[0];
      // Fail closed until per-field source reconciliation has been reviewed. Never let ETL
      // overwrite an operator/owner correction, even when the upstream version is newer.
      if(existing && (await client.query('SELECT 1 FROM place_field_overrides WHERE place_id=$1 LIMIT 1',[existing.place_id])).rowCount) throw new Error('Editorial field ownership requires review before import');
      const stableSlug = existing ? existing.slug as string : place.slug;
      const hash = createHash('sha256').update(JSON.stringify({...place,slug:stableSlug})).digest('hex');
      const incomingTime = provenance.sourceUpdatedAt === null ? null : Date.parse(provenance.sourceUpdatedAt);
      const existingTime = existing?.source_updated_at ? (existing.source_updated_at as Date).getTime() : null;
      const stale = existing && (revision<existing.normalizer_revision
        || (existingTime !== null && (incomingTime === null || incomingTime < existingTime))
        || (incomingTime===existingTime && existing.content_hash!==hash && revision<=existing.normalizer_revision)
        || (existingTime === null && incomingTime === null && Date.parse(provenance.importedAt)<(existing.imported_at as Date).getTime()));
      if (stale || (existing && existing.content_hash===hash)) {
        if (!stale && (revision>existing.normalizer_revision || (incomingTime !== null && (existingTime === null || incomingTime > existingTime)))) {
          await client.query(`UPDATE source_records SET source_updated_at=$3,imported_at=$4,source_url=$5,normalizer_revision=$6,import_job_id=$7 WHERE source_id=$1 AND source_record_id=$2`,
          [provenance.sourceId,provenance.sourceRecordId,provenance.sourceUpdatedAt,provenance.importedAt,provenance.sourceUrl,revision,jobId]);
        }
        await client.query('UPDATE import_jobs SET skipped_count=skipped_count+1 WHERE id=$1',[jobId]);
        return {placeId:existing.place_id as string,action:stale ? 'stale' : 'unchanged'};
      }
      const placeId = existing ? existing.place_id as string : randomUUID();
      const values = [placeId,stableSlug,place.cityId,place.name,place.address,place.coordinates.lon,place.coordinates.lat,
        place.description,place.phone,place.website,place.openingHours,place.accessibility];
      await client.query(`INSERT INTO places(id,slug,city_id,name,address,position,description,phone,website,opening_hours,accessibility)
        VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,$10,$11,$12)
        ON CONFLICT(id) DO UPDATE SET city_id=EXCLUDED.city_id,name=EXCLUDED.name,address=EXCLUDED.address,
        position=EXCLUDED.position,description=EXCLUDED.description,phone=EXCLUDED.phone,website=EXCLUDED.website,
        opening_hours=EXCLUDED.opening_hours,hours_verified_at=NULL,accessibility=EXCLUDED.accessibility,updated_at=clock_timestamp()`, values);
      await client.query('DELETE FROM place_categories WHERE place_id=$1',[placeId]);
      await client.query('INSERT INTO place_categories(place_id,category_id) SELECT $1,unnest($2::text[])',[placeId,place.categoryIds]);
      await client.query(`INSERT INTO source_records(source_id,source_record_id,place_id,source_url,license,attribution,source_updated_at,imported_at,content_hash,import_job_id,normalizer_revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(source_id,source_record_id) DO UPDATE SET source_url=EXCLUDED.source_url,license=EXCLUDED.license,
        attribution=EXCLUDED.attribution,source_updated_at=EXCLUDED.source_updated_at,imported_at=EXCLUDED.imported_at,
        content_hash=EXCLUDED.content_hash,import_job_id=EXCLUDED.import_job_id,normalizer_revision=EXCLUDED.normalizer_revision`,
      [provenance.sourceId,provenance.sourceRecordId,placeId,provenance.sourceUrl,provenance.license,provenance.attribution,provenance.sourceUpdatedAt,provenance.importedAt,hash,jobId,revision]);
      await client.query('UPDATE import_jobs SET imported_count=imported_count+1 WHERE id=$1',[jobId]);
      return {placeId,action:existing ? 'updated' : 'inserted'};
    });
  }

  async recordFailure(jobId: string): Promise<void> {
    const result = await this.pool.query(`UPDATE import_jobs SET failed_count=failed_count+1 WHERE id=$1 AND status='running' RETURNING id`,[IdSchema.parse(jobId)]);
    if (!result.rows[0]) throw new Error('Import job is absent or finished');
  }

  async finishImport(jobId: string, result: {status:'completed'|'failed';errorCode?:string}): Promise<void> {
    if (!['completed','failed'].includes(result.status) || (result.errorCode !== undefined && !/^[A-Z0-9_]{1,100}$/.test(result.errorCode))) throw new Error('Invalid import completion');
    const update = await this.pool.query(`UPDATE import_jobs SET status=$2,error_code=$3,finished_at=clock_timestamp()
      WHERE id=$1 AND status='running' RETURNING id`,[IdSchema.parse(jobId),result.status,result.errorCode ?? null]);
    if (!update.rows[0]) throw new Error('Import job is absent or finished');
  }
}
