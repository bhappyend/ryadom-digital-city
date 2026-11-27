# @ryadom/db

PostgreSQL16/PostGIS3.4 catalog, transactional migrations, taxonomy/city-only seed and ETL upsert journal. No memory fallback or fabricated organizations.

Full API/setup/provenance/limitations: [docs/DATABASE.md](../../docs/DATABASE.md). Results: [handoff05](../../docs/HANDOFFS/05.md).

Default export is source TS for tsx/bundlers. Production Node uses `@ryadom/db/compiled`; run shared types build then this package build. Both export CatalogRepository, ImportRepository, createDatabasePool, withTransaction, migrate, seed and grantRuntime. DB credentials are server-only.

Integration tests require owner DATABASE_URL and runtime APP_DATABASE_URL, create a uniquely named `ryadom_dbtest_<uuid>` database and drop only that database afterward. No fixtures are written to the working city catalog. Default `npm test` executes configuration/literal-search unit checks without needing a database.
