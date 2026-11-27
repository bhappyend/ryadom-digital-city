# Production deployment package — 2026-11-27

This runbook preserves the Next/Nest/PostGIS stack. It prepares a self-hosted Linux deployment; no server, domain, certificate, registry publication or real operator account has been created. Sites skill was applied in local-only mode. Infrastructure/security/testing/documentation checks are explicit because no dedicated DevOps skill is available.

Latest access policy: anonymous visitors browse the public catalog without an account. **Public registration is closed and must remain closed.** Business owners sign in using access created or reset through the protected admin CRM by an authorized operator with fresh MFA. Do not expose signup UI/API or turn on registration as a deployment prerequisite. Final provisioning/reset implementation and browser verification must be included in the frozen release before enabling account operations.

## Required operator inputs

Use a Linux server with Docker Engine, Compose >=2.24.4, a reviewed supported Debian Node22/24 image **digest**, DNS hostname and responsible ACME email. Open inbound80/443 only; keep DB/Redis/API private. Size the server from measured workload and GIS requirements; the local development memory allocation is not a production capacity claim.

Copy `.env.production.example` to a private path outside the checkout; restrict it to the service operator. It intentionally has no passwords, domain, price or working image references. Root `.gitignore` ignores that example by its broad `.env.*` rule; when recording this deliverable in Git, explicitly add only the blank example with `git add -f .env.production.example`, never a populated file.

- Independently generate POSTGRES_PASSWORD, APP_DB_PASSWORD and REDIS_PASSWORD (at least32 random characters). Redis uses hex/base64url-safe characters. URL-encode passwords in URLs. DATABASE_URL is the migration administrator at `db:5432`; APP_DATABASE_URL uses `ryadom_app` at the same host/database. REDIS_URL uses authenticated `redis:6379`.
- ACCOUNT_MFA_KEY and ACCOUNT_RATE_KEY are independent canonical base64 encodings of32 random bytes. Keep ACCOUNT_MFA_KEY_ID stable. The MFA key also encrypts CRM phones: losing/changing it destroys access to existing ciphertext. Preserve old keys and define a reviewed re-encryption procedure before rotation; this package does not implement key migration.
- Set ACCOUNTS_ENABLED=true only after migration/grants, legal consent documents, secure operator bootstrap and HTTPS/browser validation. false keeps public catalog available while account operations remain unavailable. No HTTP cookie bypass is included.
- WEB_IMAGE, API_IMAGE and TOOLS_IMAGE must point at actual scanned registry digests from the same source revision. NODE_IMAGE is the reviewed Debian Node image digest used for builds. Existing PostGIS16.4/PostGIS3.4.3 compatibility pin still needs a measured supported patch upgrade and vulnerability review before launch; do not silently replace live DB major versions.
- Configure actual licensed/owned GIS endpoints and exact allowlists or retain honest unavailable state. MAP_STYLE_URL must be public HTTPS, including reachable referenced tiles/fonts/sprites. WEB_MAP_CONNECT_ORIGINS is baked into web CSP at build time. No public OSM/demo fallback is enabled. Production GIS hosting is separately provisioned; the development loopback GIS stack is not exposed by this overlay.

## Build images in an isolated release checkout

Production requires explicit POSTGIS_IMAGE by reviewed immutable digest; the old development compatibility pin is not a production default. On a fresh DB select a supported tested PostgreSQL16/PostGIS-compatible image. For an existing volume first identify its PG/PostGIS versions, rehearse backup+restore and extension upgrade in a separate volume, scan the candidate and schedule maintenance. Never point a newer PostgreSQL major image directly at existing PGDATA; use a reviewed pg_upgrade or logical dump/restore procedure. A digest-format validator cannot prove patch safety or compatibility. This task has not tested a replacement DB image and does not approve the old16.4 pin for commercial launch.

No secrets are build arguments. The Dockerfile-specific ignore excludes local credentials, dumps, databases, media, node_modules and generated builds. It includes only the licensed35-record showcase from the data tree. Do not use arbitrary alternate Dockerfiles without equivalent context exclusions.

The following Bash commands assume NODE_IMAGE, SITE_HOST and WEB_MAP_CONNECT_ORIGINS contain reviewed **non-secret** build values; image tags are examples for a real operator-owned registry. Coordinate one build process; local source work must be frozen first.

```bash
docker build -f infra/docker/Dockerfile --target api --build-arg NODE_IMAGE="$NODE_IMAGE" --build-arg PUBLIC_SITE_URL="https://$SITE_HOST" --build-arg WEB_MAP_CONNECT_ORIGINS="$WEB_MAP_CONNECT_ORIGINS" -t registry.your-domain/ryadom-api:release .
docker build -f infra/docker/Dockerfile --target web --build-arg NODE_IMAGE="$NODE_IMAGE" --build-arg PUBLIC_SITE_URL="https://$SITE_HOST" --build-arg WEB_MAP_CONNECT_ORIGINS="$WEB_MAP_CONNECT_ORIGINS" -t registry.your-domain/ryadom-web:release .
docker build -f infra/docker/Dockerfile --target tools --build-arg NODE_IMAGE="$NODE_IMAGE" --build-arg PUBLIC_SITE_URL="https://$SITE_HOST" --build-arg WEB_MAP_CONNECT_ORIGINS="$WEB_MAP_CONNECT_ORIGINS" -t registry.your-domain/ryadom-tools:release .
```

Docker caches the common build. All targets run npm ci from the lock and build shared packages/API; only the web target additionally builds Next, with API_URL=http://api:3001 baked into rewrites. Runtime retains production dependencies plus the Next TypeScript-config loader, UID/GID10001, no compiler process or dev server. Tools intentionally retain tsx/source for audited migration/bootstrap commands and are never a public service. Scan images/SBOMs, publish them to the selected registry, record real digests, then fill private env image references. Scanning and publication were not executed in this task.

## Validate and start

Commands below are Linux Bash. Define a private path and a Compose function; do not print resolved config because it contains credentials. Keep the same COMPOSE_PROJECT_NAME and existing volumes during upgrades. For a fresh independent installation choose a distinct project name; never run `down -v` against existing data.

```bash
export INFRA_ENV_FILE=/secure/ryadom.production.env
node infra/scripts/validate-production.mjs "$INFRA_ENV_FILE"
dc() { docker compose --env-file "$INFRA_ENV_FILE" -f compose.yaml -f infra/compose.production.yaml "$@"; }
dc config --quiet
dc up -d --wait db redis
dc --profile maintenance run --rm tools migrate
dc --profile maintenance run --rm tools grant-runtime
dc --profile maintenance run --rm tools grant-admin-runtime
# Only on an empty installation, seed taxonomy/pilot city deliberately; this is not a POI import.
# dc --profile maintenance run --rm tools seed
dc up -d --wait api web proxy
```

The overlay clears DB/Redis host ports; only Caddy80/443 is published. Caddy obtains/renews certificates into persistent volumes. API trusts the fixed Caddy address /32 only; adjust PROXY_IPV4 and PROXY_SUBNET together if a network conflict exists. Web SSR uses its internal API URL; browser API/media go directly through Caddy to the API. Health endpoints remain internal. Confirm external HTTPS health, certificates, cookies, Origin/CSRF, actual login/MFA, publication, a real raster upload and all GIS modes after startup. SEO_INDEXING_ENABLED remains false until public content/legal/canonical checks pass.

Persistent `media_data` mounts at `/var/lib/ryadom/media`, initialized from the image-owned10001 directory; only API has write access. Do not mount it into the proxy or serve its files statically: API checks current publication rights before reads. API runs read-only elsewhere with bounded tmpfs. Next gets a separate writable cache volume. Caddy permits exactly2097152 bytes for the UUID raw PUT media content route; JSON/API and other request bodies remain16KiB. Application MIME/hash/ticket/decoder/RBAC/CSRF limits still apply. Route variants that miss this narrow exception fail closed at the smaller limit.

For actual first-operator bootstrap read `docs/ADMIN-API.md` and `apps/api/src/bootstrap-admin.ts`. Run its existing interactive CLI using the tools image (override entrypoint to `node node_modules/tsx/dist/cli.mjs apps/api/src/bootstrap-admin.ts`). Supply secrets only through its hidden interactive prompts; complete real identity/consent and MFA enrollment. Never seed demo owners into auth tables, print setup secrets into CI, use a default password or make bootstrap an automatic startup hook. Existing CRM rows without a real account association are not silently rebound.

### Explicit first-operator bootstrap

After independent real mailbox/identity and personal consent verification, authorize one15-minute bootstrap window on the private operator terminal. Supply ACCOUNT_BOOTSTRAP_SECRET_SHA256 (hash of an independently generated one-time secret) and ACCOUNT_BOOTSTRAP_EXPIRES_AT in the terminal environment without shell-history literals or logs. The secret itself is entered in the hidden interactive prompt, as is the real operator password. The tools profile passes the administrator DB URL only to this non-public maintenance container.

```bash
dc --profile maintenance run --rm --entrypoint node \
  -e ACCOUNT_BOOTSTRAP_SECRET_SHA256 -e ACCOUNT_BOOTSTRAP_EXPIRES_AT \
  tools apps/api/dist/bootstrap-admin.js
unset ACCOUNT_BOOTSTRAP_SECRET_SHA256 ACCOUNT_BOOTSTRAP_EXPIRES_AT
```

The CLI checks expiry, identity attestation, actual terms/privacy versions and consent. It creates no session; immediately complete real MFA through HTTPS. Remove one-time authorization and audit the operator action. Do not use this command for unverified third-party mailboxes: the bootstrap records the explicitly attested mailbox as verified. This first-staff bootstrap is separate from business-owner access. Owner credentials are created/reset only through protected admin CRM with server-side permission, fresh MFA and audit. Plaintext owner passwords must never persist in DB, logs or backups; use the final supported provisioning/reset flow and approved direct credential handoff. Creating credentials does not fabricate owner consent, mailbox verification, ownership, an accepted founder agreement or funded entitlement. Published legal texts and operator duties remain necessary even with signup closed; do not record consent on another person's behalf.

## Licensed catalog on a fresh installation

Migrations and taxonomy seed create **zero business records**. The showcase35 is a read-only presentation of existing durable IDs; it is not a supported national importer. A fresh pilot-only DB does not contain all35 nationwide durable IDs: those showcase public links may return404 until the corresponding catalog is transferred. To preserve the current measured85 cities/2753 places, use a separate **private** SQL backup/restore of the actual catalog installation as described below, then verify snapshot counts and all35 IDs. Counts describe a measured checkpoint, not future imports or total Russian coverage. A full private SQL dump contains account/customer/audit data and must not be put in the source archive or redistributed as a public starter pack.

For the supported Smolensk pilot replay, transfer these three public licensed files together from the same source revision: `data/osm/smolensk-replay.json`, `data/osm/source-manifest.json`, `data/osm/smolensk-initial.overpassql`. The replay removes contributor uid/user/changeset metadata. The importer validates input/query hashes, timestamps, ODbL attribution and city bounds before apply; do not download raw imports at container startup. Files are deliberately excluded from application images and mounted read-only into the tools image only for this explicit import.

**New tools release required:** the original importer compatibility guard accepted only migrations001/002. Backend final101 freeze now pins exact001..004 or001..005 schemas, including `005_owner_access.sql` SHA256 `B3E737DA71F2DD945B835838A93C044033D0182F839138488448B4FC9BCDF1DC`; missing, unknown or altered migrations are rejected. Backend-reported command `node --env-file=infra/.env.local --import tsx --test packages/importer/test/integration.test.ts` passed9/9, zero skips,3.12s on disposable005 DB: actual import, admin-published override, blocked upstream change and unchanged public/source data. This is backend fixture evidence, not a working/production import. Build a new tools release from that final source before apply; the previously built tools image is obsolete for this path. The old tools-image dry-run below proves parsing/hashes only and does not prove apply compatibility. No image rebuild or actual import was performed for this documentation follow-up.

Once that release gate is satisfied, after migrating and deliberately seeding taxonomy/city on a fresh installation, create `/secure/import-reports` writable only by UID10001. Example Bash wrapper from the release checkout:

```bash
pilot() {
  dc --profile maintenance run --rm --no-deps --entrypoint node \
    --volume "$PWD/data/osm/smolensk-replay.json:/import/smolensk-replay.json:ro" \
    --volume "$PWD/data/osm/source-manifest.json:/import/source-manifest.json:ro" \
    --volume "$PWD/data/osm/smolensk-initial.overpassql:/import/smolensk-initial.overpassql:ro" \
    --volume /secure/import-reports:/reports \
    tools node_modules/tsx/dist/cli.mjs packages/importer/src/cli.ts \
    --input /import/smolensk-replay.json --manifest /import/source-manifest.json "$@"
}
pilot --report /reports/pilot-dry-run.json
# Review accepted/rejected rows, source/license and counts before the explicit write.
# The current verified replay has rejected records; use this only after reviewing that queue.
pilot --report /reports/pilot-apply.json --apply --allow-rejections
```

Reports are exclusively created; use a fresh filename per execution. Without explicit `--allow-rejections`, apply fails closed when rejected records exist. Observed tools-image dry-run with these three read-only mounts and no network/DB:2734 input,2339 accepted,390 rejected,1955 warnings,4 skipped,56 match candidates; ODbL-1.0. Review the full report rather than treating rejected rows as imported. The dry-run does not write the DB. The apply command has not been executed on a new production server here and does not claim35 nationwide records on a fresh install. Keep OSM attribution and provenance visible and preserve existing Smolensk/catalog records on upgrades. Never import demo owners into production accounts/CRM.

### Private transfer of the existing full catalog

Do not combine a pilot replay with an unreviewed broad data deletion. For a full-installation transfer, stop all source writers, use its private INFRA_ENV_FILE and create/verify a new backup:

```bash
node infra/scripts/db.mjs backup private-catalog-transfer.dump
node infra/scripts/db.mjs restore-check private-catalog-transfer.dump
```

Encrypt and privately transfer `infra/backups/private-catalog-transfer.dump` and its SHA256 sidecar outside the source package. Preserve the matching keys, private media checkpoint and runtime configuration separately as described below. This transfer carries any actual private application rows too; restrict access to authorized operators and do not call it a public-data export.

On a distinct new target server/project, start DB/Redis only. The target must have an empty application database (PostGIS extension initialization is allowed); **do not migrate or seed before restoring an existing full dump**. Verify the transferred SHA256, select the reviewed compatible database image, then use the target `dc` function:

```bash
transfer_expected="$(cat /secure/transfer/private-catalog-transfer.dump.sha256)"
transfer_actual="$(sha256sum /secure/transfer/private-catalog-transfer.dump)"
test "${transfer_actual%% *}" = "$transfer_expected" || exit 1
dc up -d --wait db redis
dc exec -T db sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --no-privileges' < /secure/transfer/private-catalog-transfer.dump
dc --profile maintenance run --rm tools migrate
dc --profile maintenance run --rm tools grant-runtime
dc --profile maintenance run --rm tools grant-admin-runtime
```

The existing backup helper writes a hash-only sidecar; the Bash comparison above supports that exact format and exits before restore on mismatch. Never add `--clean`, restore over a live application DB or delete the source volume. After the restore, independently check cities/places and35 durable IDs through the repository/API, migration/grants, published/draft isolation, decryption and media rights. Restore media/keys before traffic cutover. This documentation does not claim a new target has been restored; the prior local scratch SQL-restore evidence remains separate from a full media/key recovery drill.

## Consistent backup, encrypted key escrow and restore drill

`infra/scripts/db.mjs` uses INFRA_ENV_FILE and the same project name; it execs DB through base Compose without requiring public DB ports. Existing exclusive files/SHA checks and disposable scratch-DB restore stay in effect. It backs up SQL only. A usable account/media recovery set additionally requires the exact key ID/key, media bytes, source revision/image digests and private runtime configuration.

Quiesce **all** writers (API and import jobs) before the recovery checkpoint. In Bash, create a new restricted backup directory outside public/web/source trees. Never redirect binary tar/dump streams in older Windows PowerShell; use Bash or a binary-safe file-descriptor helper.

```bash
umask 077
dc stop api web
node infra/scripts/db.mjs backup release-checkpoint.dump
node infra/scripts/db.mjs restore-check release-checkpoint.dump
# API container below does not start the server. Archive is private media, not a public directory.
dc run --rm --no-deps --entrypoint tar api -C /var/lib/ryadom/media -cf - . > /secure/backups/media-checkpoint.tar
sha256sum /secure/backups/media-checkpoint.tar > /secure/backups/media-checkpoint.tar.sha256
dc up -d --wait api web
```

Use a unique archive filename for each checkpoint; shell redirection above must not target an existing backup. Encrypt database dump, media archive and their checksums before off-host transfer, with a separately controlled recipient/key. Escrow the corresponding **populated private env/key material** separately encrypted with restricted operator access; never copy it into a Git archive, Docker image or unencrypted shared backup. Back up Caddy ACME state with the server recovery set if certificate continuity is needed; Redis can be restored for rate/session continuity or deliberately reset with full user session revocation. Record chosen policy and measured RPO/RTO.

Restore first into a new isolated project/server with no public DNS and a new empty DB/media volume. Verify hashes before reading archives; inspect media tar names (no absolute paths, `..`, links or unexpected device files). Restore SQL into the **new target only**, apply runtime/admin grants with the tools image, restore validated media via `dc run --rm --no-deps --entrypoint tar api -C /var/lib/ryadom/media -xf - < validated-media.tar` (UID10001), install matching escrowed keys/config and start applications. Do not restore over live production volumes. Prove decryption/MFA recovery with a dedicated consenting test account, hidden-phone reveal plus audit, published/draft media access, review history and real manual-funded period state. A SQL-only restore or fresh empty media directory is insufficient. Only after those checks plan traffic cutover and rollback; schema downgrades are not automatic.

## Observed validation and outstanding release gates

Implemented files: `infra/docker/Dockerfile`, its specific ignore, production overlay, Caddyfile, production validator, config checker, infrastructure tests, CI accounts contract/admin grant gates, blank env example and this runbook. Original brand/source assets, working volumes and application code are unchanged.

Observed: local/production/storage Compose config invariants PASS;7 infrastructure tests PASS; pinned Caddy offline config validation PASS; actionlint CI/security workflows PASS. Linux Node22.22.2 web/API Docker builds PASS. Actual non-root read-only/network-none web startup served manifest200; API native Argon2/Sharp and compiled DB imports PASS, actual API startup live200/readiness503 with dependencies intentionally absent PASS. Smoke containers were removed. Web local image manifest is `sha256:39b853b3c9481fdb24f72a2ba9f9b3a67fa5619578c9708f2dc255e093168c5e`; API local image manifest is `sha256:816bf557e9f3b249804e0ac2b2fa56b3183f40c0b94d4410df8704125f086888`. These are local packaging evidence, not published registry references; the web snapshot predates final frontend changes and is not the release artifact. Initial broad data-directory context attempt was cancelled; corrected context admits only showcase35 and runs a fail-closed secret/data/artifact exclusion check before npm ci. No shared host node_modules/.next was changed by Docker builds.

Registry push/scans, replacement DB image upgrade, server provisioning, real DNS/TLS, production bootstrap, capacity tests and full DB+media+key recovery drill were not run. Root integration owns current-source application/Next acceptance; the operator must rebuild all release images from a single final frozen revision. Existing local/browser results do not assert these production gates. No outbound contact messages, automatic payment debits or invented pricing are introduced.

Tools packaging proof: local image manifest sha256:dba9e456531f19f2cc94fe69dada5edebf3f0488708ee097a48bc068fd1c636c built successfully; UID10001/read-only/network-none migration/bootstrap asset smoke PASS and mounted pilot dry-run PASS. Reproduce with node infra/docker/smoke-images.mjs tools ryadom-tools:deployment-check and node infra/docker/smoke-pilot.mjs ryadom-tools:deployment-check. No production migration/import/bootstrap was performed by this infrastructure task.
