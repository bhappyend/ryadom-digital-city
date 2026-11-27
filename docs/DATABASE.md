# Database package — stage 1

Owner 05. `@ryadom/db` default source TypeScript exports are intentional (task requirement); TS-aware consumers run with tsx or bundle the dependency. Production Node consumers import `@ryadom/db/compiled`, which points to CommonJS and declarations under dist; build shared types then db before API. Do not import the DB package into frontend/browser code. Shared DTO source is `packages/types`, unchanged. Runtime errors propagate to Nest: no in-memory fallback; missing APP_DATABASE_URL throws DatabaseConfigurationError; API must return 503 with catalog/reports unavailable state. No credentials or raw query/body should be logged.

## Repository contract

```ts
import { createDatabasePool, CatalogRepository, ImportRepository, migrate, seed } from '@ryadom/db';
const pool = createDatabasePool(process.env.APP_DATABASE_URL); // runtime role only
const catalog = new CatalogRepository(pool);
await catalog.listCities(); // City[]
await catalog.listCategories(); // Category[]
await catalog.searchPlaces(validatedPlacesQuery); // {items: NearbyPlace[], pagination}
await catalog.findPlaceBySlug(slug); // Place | null (404)
await catalog.getStats(city /* optional slug */); // Stats DTO, measured counts only
await catalog.listPlatformReviews({page:1,limit:20}); // ReviewsPage DTO
await catalog.createReport(report); // ReportReceipt | null (unknown/inactive place, 404)
await pool.end(); // Nest shutdown hook
```

The repository validates input and output against shared Zod schemas. `openNow=true` and any rating filter currently return no matches: every openingState is `unknown`, every rating is null. Photos are empty. Imported openingHours are descriptive only, never proof of current opening. No fake users/routes/partners statistics. Place slugs are globally unique because v1 detail route has no city argument; source identity is unique `(source_id,source_record_id)`; city and category use stable string IDs.

## Importer contract

```ts
const imports = new ImportRepository(migrationOrDedicatedImporterPool);
// Registration is an administrative act, not derived automatically from downloaded input.
await imports.registerDataSource({id:'osm', name:'OpenStreetMap', license:'ODbL-1.0',
  attribution:'© OpenStreetMap contributors', sourceUrl:'https://www.openstreetmap.org/copyright', enabled:true});
const jobId = await imports.startImport('osm', {normalizerRevision:2}); // optional, defaults to1
const result = await imports.upsertPlace(jobId, normalizedPlace, provenance);
// result: {placeId:string, action:'inserted'|'updated'|'unchanged'|'stale'}
await imports.recordFailure(jobId); // optional, one rejected input; never persist raw input/errors
await imports.finishImport(jobId, {status:'completed'}); // or {status:'failed',errorCode:'BOUNDED_CODE'}
```

`NormalizedPlace` is exported: Pick<Place, 'slug'|'name'|'cityId'|'categoryIds'|'address'|'coordinates'|'description'|'phone'|'website'|'openingHours'|'accessibility'>. Do not supply id, rating, photos, openingState, verified hours or timestamps. `Provenance` is the shared exact type: sourceId, sourceRecordId, sourceUrl|null, license, attribution, sourceUpdatedAt|null, importedAt. Source must be registered/enabled and license/attribution must match its administrative registration; job must be running and belong to that source. Each upsert owns its transaction and source-record advisory lock, updates place/categories/provenance/job counters atomically, skips unchanged payload or stale timestamps, and never deletes missing records. Existing ID and slug are preserved even if ETL proposes a new slug. Older sourceUpdatedAt, missing date replacing a known date, or differing content with the same source version timestamp return stale. When both source timestamps are absent, an older importedAt observation is stale. Equal payload is unchanged; a newer source timestamp can refresh provenance without touching the place content timestamp. Counters: inserted/updated increment imported_count, unchanged/stale increment skipped_count; rejected records require recordFailure from ETL. Interrupted jobs remain running until ETL/operator marks them failed; no implicit success or automatic deletion. Different sources are not auto-merged; new-source slug collision rolls back for explicit ETL deduplication. Business-owned field protection requires the future ownership/audit model before enabling business editing. No business editor exists in stage 1.

Normalizer revision follow-up (migration002): `startImport(sourceId,{normalizerRevision?:number}={})` accepts a positive PostgreSQL integer, defaults to1, and persists it on import_jobs. upsert reads that trusted administrative job revision; shared DTOs do not change. A strictly higher normalizer revision may change normalized content at the same sourceUpdatedAt (including both timestamps absent) while preserving truthful source timestamp, place ID and original slug. Same revision + same timestamp + different content remains stale; a lower normalizer revision never overwrites a higher one even with a newer source timestamp. A higher revision cannot override an older source timestamp or an older undated importedAt observation. An unchanged content hash can advance source_records.normalizer_revision and import_job_id, counted as skipped, without editing the place/updatedAt. Version bumps are explicit ETL code releases, not a public/API parameter or a substitute for future business-owned field protection. Importer07 should use revision2 for the approved chemist label correction and include002_normalization.sql in its schema compatibility check.

## Schema and queries

Internal city API for07.1: `await imports.registerCity(city: City, provenance: Provenance): Promise<'inserted'|'unchanged'>`. Available on ImportRepository and both package export paths after build. Validate CitySchema/ProvenanceSchema, actual IANA timezone and center within viewport; source must be pre-registered/enabled and license+attribution must match. Transactional parameterized insert with city advisory lock. An identical existing City returns unchanged and preserves its original provenance; differing existing City throws for administrative review, never overwriting Smolensk or source geometry. This API is owner/importer-only, no public write endpoint or runtime INSERT grant. City-source selection, definitions and national coverage/gaps remain owned by07.1; registration does not assert exhaustive coverage or add paid/verified/advertising labels. Open-source starter records and future paid owner listings remain distinct product concerns; prices are unset.

`cities` stores geography center, non-crossing viewport bounds, IANA timezone configuration, enabled state and provenance. `categories` holds exactly the allowed taxonomy IDs. `places` stores geography(Point,4326), contacts and descriptive hours; `place_categories` is indexed in both directions. `data_sources`, `source_records` and `import_jobs` enforce source identity and job/source consistency. Provenance is stored per record, preserving the license/attribution at import time. `reports` has a real place FK and consent timestamp; report descriptions are inaccessible to the runtime role. `platform_reviews` requires consent, publication status/date; draft/future/withdrawn reviews are excluded. No fabricated reviews are seeded.

Nearby SQL uses [ST_DWithin](https://postgis.net/docs/ST_DWithin.html) on geography in meters with a partial GiST index, then exact spheroidal [ST_Distance](https://postgis.net/docs/ST_Distance.html), distance ASC/id ASC. Radius 300..10000, page1..100, limit1..50, q2..200 are revalidated inside the repository. Text parameters use escaped `%`, `_`, and backslash, with explicit LIKE ESCAPE. One materialized-match statement supplies page and count from the same snapshot, including empty pages. No KNN prelimit that could lose exact spheroidal nearest results. The exact sort is bounded by radius, timeouts and query limits; dense-city production performance still needs measurements. Current substring search has no trigram index; add it only after measured need. Do not log the user's coordinates or text search.

Local measurements on 2339 imported records are recorded in handoff05. The actual planner uses GiST at300m/1500m and chooses a sequential scan at10000m, covering nearly the entire pilot dataset. Forced-index fixture checks are separately labeled and are not production measurements.

## Local operation

Run from `C:/Users/tihoyo/Documents/ChatGPT/Рядом - PV`. Coordinator owns root npm install/lock, no install is performed by DB05. Use local ignored infra/.env.local, never copy credentials into commands/logs. The checked-in configuration contains no credentials.

```powershell
npm run build:shared
npm run build --workspace=@ryadom/db
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs packages/db/src/cli.ts migrate
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs packages/db/src/cli.ts seed
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs packages/db/src/cli.ts grant-runtime
npm run typecheck --workspace=@ryadom/db
npm run test --workspace=@ryadom/db
node --env-file=infra/.env.local node_modules/tsx/dist/cli.mjs --test packages/db/test/integration.test.ts
```

For CI/shells with variables already injected: `npm run migrate --workspace=@ryadom/db`, `npm run seed --workspace=@ryadom/db`, `npm run grant-runtime --workspace=@ryadom/db`, `npm run test:integration --workspace=@ryadom/db`. Migration/seed/grant require DATABASE_URL; API requires APP_DATABASE_URL; APP_DB_USER defaults to ryadom_app for grants. Runtime pool max10, connect3s, SQL3s, client5s, idle30s, lock2s, search_path public. Migration pool max2 and client35s; each migration temporarily allows SQL30s. TLS follows the connection URL; never disable certificate validation for remote deployment. Use infrastructure secret injection and a verified server CA in production.

Migrations are separate versioned SQL files. Session advisory lock permits one runner, competing runner fails promptly. Each file and its SHA256 journal insertion commit together; previously applied migrations must remain present and byte-identical. Out-of-order migrations fail. No destructive down/reset command. Review a new forward migration and take/verify a backup before production changes. `withTransaction` uses one acquired pg client for BEGIN/COMMIT/ROLLBACK and releases/discards it safely, following [node-postgres transaction guidance](https://node-postgres.com/features/transactions). Identifiers are never sourced from API input. Runtime role gets SELECT on public catalog data, column-limited INSERT on reports and receipt-only SELECT; no schema CREATE, catalog UPDATE, import journal SELECT or report description SELECT. Importer uses owner credentials locally; production needs a separate restricted ETL role, not the API role or superuser.

## Seed evidence

`packages/db/data/smolensk-source.json` records a bounded manual Nominatim request and OSM relation metadata verification on 2026-11-27 Moscow time. [OSM relation3339993](https://www.openstreetmap.org/relation/3339993), version24, timestamp2026-05-22T17:00:43Z: city center lon32.0471812/lat54.7789701; viewport `[31.7883262,54.7075603,32.2095639,54.8503780]` converted from Nominatim south,north,west,east. ODbL-1.0, © OpenStreetMap contributors. This is a city label and viewport extent, not a legal boundary polygon. Timestamp belongs to relation metadata, not all member geometry. Europe/Moscow is application configuration. Coordinates of ul. Lenina8 were not used as city center. Public Nominatim was used only for this manual verification, never configured as an unlimited application backend. Seed inserts one city/source and 14 categories; creates zero organizations/photos/ratings/reviews. City/source conflicts are preserved so repeats do not overwrite administrative changes or refresh dates. Category assets/names follow shared CATEGORIES. City importedAt is recorded at first seed; repeats preserve stored provenance.

## Later models, deliberately not created yet

| Area | Future schema and required acceptance |
| --- | --- |
| Accounts and roles | users, roles, permissions, user_roles, role_permissions, sessions; server RBAC, MFA admin, refresh rotation, expiry/revocation, Argon2id; privacy and deletion model before migration |
| Business ownership | businesses, branches referencing places, owner_claims, moderation, field-level verified overrides and audit_logs; ETL must update source snapshot without overwriting approved owner fields; authorization and claim verification before enabling edits |
| Rich place data | addresses/hours/contacts/photos with provenance and license per asset; verified hours parser/timezone/DST before known openingState; reviews with consent/moderation and aggregates from actual allowed rows |
| Saved content | favorites unique(user_id,place_id), deletion cascade rules, account data export/removal |
| Commerce | plans, subscriptions, payments, promotions; provider IDs/idempotency, signed webhooks, reconciliation and advertising disclosure; no money storage or billing facade in stage1 |
| CMS and measurement | cms_sections/site_settings, audit_logs and bounded analytics_events with consent/retention; do not record precise movement history by default or invent counters |

Reports retention/abuse controls belong to API and legal policy; this package stores no IP/user-agent/location history and implements no public moderation endpoint. Backup/restore, security upgrades to the infrastructure image, production grants/TLS and representative performance testing remain infrastructure/integration acceptance work. Exact checks/results are in `docs/HANDOFFS/05.md`; this package does not establish full product readiness.
