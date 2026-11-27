import assert from 'node:assert/strict';
import { appUser, compose, database, sql } from './runtime.mjs';

// appUser is validated as a restricted identifier in runtime.mjs; no user/query input is accepted here.
const report = sql(`SELECT current_setting('server_version_num')::int >= 160000 AND current_setting('server_version_num')::int < 170000; SELECT postgis_lib_version(); SELECT ST_DWithin(ST_SetSRID(ST_Point(32.05,54.78),4326)::geography,ST_SetSRID(ST_Point(32.05,54.78),4326)::geography,1); SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname='${appUser}';`);
const lines = report.split(/\r?\n/);
assert.equal(lines[0], 't', 'PostgreSQL 16 required');
assert.match(lines[1], /^3\.4\./, 'PostGIS 3.4 required');
assert.equal(lines[2], 't', 'geography ST_DWithin must work');
assert.equal(lines[3], 't', 'application role must be unprivileged');
const app = compose(['exec', '-T', 'db', 'sh', '-c', 'PGPASSWORD="$APP_DB_PASSWORD" psql -X -h 127.0.0.1 -U "$APP_DB_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At'], {
  input: 'SELECT postgis_lib_version(); SELECT has_schema_privilege(current_user,\'public\',\'CREATE\');',
});
assert.match(app, /^3\.4\.[^\n]+\nf$/);
const unauthenticated = compose(['exec', '-T', 'redis', 'redis-cli', 'ping']);
assert.match(unauthenticated, /NOAUTH/, 'Redis must reject unauthenticated clients');
const authenticated = compose(['exec', '-T', 'redis', 'sh', '-c', 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping']);
assert.equal(authenticated, 'PONG');
console.log(`PASS: ${database}, PostgreSQL 16, PostGIS ${lines[1]}, GIS, application-role TCP authentication/permissions, Redis authentication.`);
