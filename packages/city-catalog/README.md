# City catalog and real business showcase

Operator-only offline ETL composition. Local Next/Nest/PostGIS architecture retained; no public writes, application runtime network adapter, owner/payment claims or deployment. `data/cities/showcase35.json` is the current requested deliverable:35 actual businesses from34 cities/11 source regions/12 commercial categories. Every record has a durable DB UUID, source identity/license/date, safe contacts when present and actual API/web path. Hours are descriptive; openingState remains unknown. Photos empty, ratings null. Do not label these organizations paying customers, owners, advertisers or partners.

The earlier national starter expansion was stopped by coordinator00's direct updated instruction after84 cities/414 selected records;82 complete and2 partial. Those rows are preserved. The existing2339 Smolensk places remain intact. Full national coverage is not claimed;1117 is a provisional HFLabs historical denominator, official denominator null. See `docs/CITY-COVERAGE.md` and exact `data/cities/coverage.json` missing list.

## Reproduce without new downloads

Run from repository root. Dependencies/lock are owned by17. Local ignored `infra/.env.local` supplies migration `DATABASE_URL` and read-only `APP_DATABASE_URL`; never print them.

```powershell
npm run typecheck --workspace=@ryadom/city-catalog
npm test --workspace=@ryadom/city-catalog
node --env-file=infra/.env.local --import tsx --test packages/city-catalog/test/integration.test.ts
```

The integration test creates and drops only a randomly named, validated isolated test database. It does not inject fixtures into the working catalog. Tests exercise true source data, max5, geometry/holes/thin polygons, cross-city identities, same-name city distinction, stable replay, cancellation and per-record rollback.

`state/plan.json` is immutable selection input. `extend` preserves old city choices and adds new cities only; archived old plans are retained by hash. `apply` validates hashes and selection before calling owned05 `ImportRepository.registerCity` and owned07 `applyPlaces`. No mutation SQL exists in this package. Each source-record upsert commits separately; a failed region is not an all-or-nothing transaction. Restart reuses the same source identities, keeping successful prior records. SIGINT/SIGTERM cancels between records and owned07 journals failure; a hard kill can leave running import jobs for operator review.

`coverage` summarizes the last actual DB measurement from journal, then atomically refreshes JSON and documentation. It does not create coverage from source download counts. `verify.ts` independently uses the runtime read-only role and checks current DB IDs/counts/distances/categories/provenance, exact35 showcase fields, City response schema limit2000, and Smolensk2339. Existing `verification.json`/`showcase35.json` are exclusive-write evidence; do not overwrite these snapshots casually.

```powershell
# Already executed and snapshots saved; these refuse existing evidence paths:
node --env-file=infra/.env.local --import tsx packages/city-catalog/src/showcase.ts
node --env-file=infra/.env.local --import tsx packages/city-catalog/src/verify.ts
# Summarize current saved journal (no network/DB writes):
node --import tsx packages/city-catalog/src/cli.ts coverage
```

## Acquisition and offline extraction for a future authorized continuation

Expansion is currently stopped. The following commands describe the resumable tool, not a request to resume acquisition now.

```powershell
node --import tsx packages/city-catalog/src/cli.ts acquire <allowlisted-source>
$env:CITY_CATALOG_OSMIUM_IMAGE='sha256:168c30e20fbba0c2e8199fca7a8aa2640e8cc1a62f8b05b1958897796fdb38f1'
node --import tsx packages/city-catalog/src/cli.ts extract <allowlisted-source>
# Only for a new plan: dry-run; existing plan: extend, then reviewed apply.
node --import tsx packages/city-catalog/src/cli.ts extend
node --env-file=infra/.env.local --import tsx packages/city-catalog/src/cli.ts apply
```

The reviewed local image above already exists for GIS and bundles pyosmium. Extract runs a separate network-disabled container capped at768MiB/1CPU with read-only source mounts and a temporary disk index; it never changes GIS runtime files. If the reviewed image is absent, provision an equivalent tool image separately and pass its full sha256; no auto-pull/install is performed. Missing PBF header bbox stays null; matching still requires actual polygon containment and a valid source center. Cache hits skip downloads/CPU; PBF SHA256 is checked before extraction. Raw files are ignored; minimized derived polygons/candidates/manifests are retained.

Per-file download cap150MiB, aggregate640MiB; fixed allowlisted HTTPS sources, manual same-origin/path-checked Geofabrik dated-file redirects, finite timeout, no TLS bypass, no automatic retries. HTTP429/5xx stops with Retry-After information. `.part` is never accepted as complete; rerun restarts that file and completed files are cache hits. Public Overpass is not part of this tool.

Registry construction is `prepare-registry.py`: read-only extraction of licensed HFLabs city CSV plus GeoNames TSV, JSON outputs. It does not read quarantined Rosstat. Rebuilding a registry changes generatedAt/hash and invalidates an old plan; preserve the current registry for resume. Raw source revision/metadata changes require a reviewed new snapshot, not silent cache replacement.

Known limits: provisional historic city list;18 unmatched centers/timezones; node-only business candidates, central8km; no offline way-POI fallback; incomplete city polygons in small BBBike extents;2 partial cities (Приморск2 and Южно-Сухокумск2). Source active tags do not prove current operation. Map/geocoder/router coverage outside Smolensk has not been enabled. HTTP/browser selector checks belong to17; this package verifies DB/DTO behavior only.
