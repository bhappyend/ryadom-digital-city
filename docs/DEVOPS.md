# Локальная инфраструктура и CI «Рядом»

Задача 15, 2026-11-27. Прочитаны AGENTS.md, полный MASTER-PROMPT и ARCHITECTURE 1.0.0. Активирован Sites: local-only, Next/Nest/PostGIS сохранены. Категории: архитектура, backend/database/GIS, security, performance, testing и документация. Специализированных DevOps/GIS/security Skills нет; ниже перечислены реальные инженерные проверки. Никаких commit/push/deploy/облачных аккаунтов эта задача не создаёт.

## Наблюдаемое состояние

- Установленный Docker Desktop запущен через `Start-Process -WindowStyle Hidden`. Docker Engine 29.9.2 Linux/amd64, Compose 5.6.1, WSL2, HypervisorPresent=True; engine имеет около 3.8 GiB RAM. OS/WSL/BIOS features не менялись. Существующие `bhappy-*` сервисы и тома не изменялись.
- `ryadom-db-1` и `ryadom-redis-1` действительно запущены и healthy. Хостовые порты только `127.0.0.1:5432` и `127.0.0.1:6379`. Имена проекта/томов изолированы префиксом `ryadom`. Контейнеры оставлены работающими для текущих задач04/05/07/17.
- PostgreSQL **16.4**, PostGIS **3.4.3** проверены запросом, приложение подключается отдельной непривилегированной ролью; Redis проверен с паролем и без него. Выполнено реальное восстановление custom-format backup в новую временную БД. Повторный снимок после появления схемы/импорта восстановил11 public tables,1 city,2339 places; это фактическое содержимое backup, не оценка полноты каталога.
- Caddy проверен офлайн через `caddy validate` в одноразовом контейнере с `--network none`. Production reverse proxy и приложения не запускались; публичных портов/DNS/сертификатов не создавали.
- MinIO — отдельный опциональный профиль, выключен. GIS-провижининг принадлежит задаче 06.1 (`compose.gis.yaml`, `infra/gis/**`, `docs/GIS-LOCAL.md`), здесь GIS не запускается.

## Закреплённые образы

| Назначение | Тег / digest | Подтверждение и предел |
|---|---|---|
| БД | `postgis/postgis:16-3.4@sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5` | Docker Hub API + registry config + работающий контейнер: PG16.4, PostGIS3.4.3. Tag обновлён 2024-10-14; это compatibility pin для заданного 3.4, production upgrade/security review остаётся обязательным |
| Redis | `redis:7.4.7-alpine@sha256:02f2cc4882f8bf87c79a220ac958f58c700bdec0dfb9b9ea61b62fb0e8f1bfcf` | Registry digest проверен; контейнер healthy. Лицензионную приемлемость Redis 7.4 для выбранной коммерческой модели подтверждает владелец интеграции |
| TLS proxy | `caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` | Digest проверен, config validate выполнен; это не TLS/нагрузочный тест production |

У upstream нет отдельного актуального тега вида `16.x-3.4.x`, принятого здесь вместо проверенного image config. `16-3.4` содержит старые patch-версии. Нельзя автоматически считать его безопасным из-за digest pin или молча перейти на другую PostGIS major/minor. Нужны согласованное обновление, scanner report, restore drill и миграционные проверки. Первичные источники: [официальные теги PostGIS](https://hub.docker.com/r/postgis/postgis/tags?name=16-3.4), [upstream docker-postgis](https://github.com/postgis/docker-postgis), [Redis 7.4.7](https://github.com/redis/redis/releases/tag/7.4.7).

## Воспроизводимый старт DB + Redis

Все команды выполняются из корня репозитория. Требуются Docker Desktop с Linux engine, Compose >=2.24.4 (production использует `!reset`), Node 22.22.2/npm10.9.7 и свободные локальные порты 5432/6379. При конфликте портов измените `POSTGRES_PORT`/`REDIS_PORT` **и URL** в локальном env перед первым стартом. Не останавливайте чужие контейнеры.

```powershell
node infra/scripts/init-env.mjs
docker compose --env-file infra/.env.local config --quiet
docker compose --env-file infra/.env.local up -d --wait --wait-timeout 180 db redis
node infra/scripts/smoke.mjs
docker compose --env-file infra/.env.local ps
```

`init-env.mjs` создаёт только `infra/.env.local`: random 256-bit secrets, флаг exclusive create, без вывода значений. Повторный вызов завершится EEXIST, чтобы не сменить пароли поверх существующего тома. Если файл уже создан этой задачей, первый шаг пропускается. `infra/.gitignore` исключает env, backups, data и reports. На Windows `mode=0600` не заменяет NTFS ACL: рабочий каталог и резервные копии должны оставаться доступны только разрешённой учётной записи.

Не используйте `docker compose config` без `--quiet` в общих логах: resolved output содержит секреты. `check-config.mjs` читает JSON в память и выводит только результат инвариантов. Secrets находятся в env контейнеров и доступны администраторам Docker; production secret store и доступ к Docker должны управляться отдельно.

Ресурсы: DB 768 MiB / 1 CPU / 40 connections, `shared_buffers=128MB`, shm128MiB; Redis192MiB / 0.5CPU / maxmemory128MiB, noeviction для будущих очередей, AOF everysec. Логи ограничены 3×10MiB на сервис. Дисковые квоты томов этими параметрами не задаются: следить за свободным диском и AOF/WAL отдельно. Healthchecks имеют timeout/retry/start-period. Отсутствующие пароли блокируют Compose config; production default passwords отсутствуют.

Остановить только эти сервисы, сохраняя данные:

```powershell
docker compose --env-file infra/.env.local stop db redis
```

`down` без `--volumes` удалит только контейнеры/сеть проекта, сохранит named volumes. Не применять `down -v`, `docker system prune` или удаление томов к общей среде.

## Миграции, роли и приложения

В файле `infra/.env.local`:

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | bootstrap/migration admin `ryadom_admin`, только CLI миграций/тестов/импорта |
| `APP_DATABASE_URL` | runtime `ryadom_app`, API читает эту переменную напрямую |
| `REDIS_URL` | авторизованное локальное соединение |
| `APP_DB_USER` | имя runtime role для `grant-runtime` |

Init script создаёт PostGIS и роль, отзывает CREATE public у PUBLIC. Прикладной схемой владеет **05**, этот init не содержит таблиц приложения. Миграции выполняет привилегированный CLI, затем `grant-runtime` выдаёт только необходимые права. Init выполняется лишь на пустом томе; смена env не меняет существующий пароль. Не пересоздавайте том ради изменения роли: согласуйте отдельную миграцию/ротацию с DB05.

После согласованного `npm ci` (не запускать параллельно с владельцем root lock) в PowerShell можно загрузить env без печати секретов:

```powershell
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; import {spawnSync} from "node:child_process"; const env={...process.env,...parseEnv(readFileSync("infra/.env.local","utf8"))}; const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","packages/db/src/cli.ts","migrate"],{env,stdio:"inherit"}); process.exit(result.status ?? 1);'
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; import {spawnSync} from "node:child_process"; const env={...process.env,...parseEnv(readFileSync("infra/.env.local","utf8"))}; const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","packages/db/src/cli.ts","grant-runtime"],{env,stdio:"inherit"}); process.exit(result.status ?? 1);'
```

Linux/CI эквивалент:

```bash
set -a
source infra/.env.local
set +a
npm run migrate --workspace=@ryadom/db
npm run grant-runtime --workspace=@ryadom/db
```

Frontend остаётся отдельным процессом на3000, API на3001. Root `.env.example`, README и scripts — собственность01; ссылки на local env и `APP_DATABASE_URL` переданы ему через handoff. Автоматически root env не загружается всеми инструментами. Не выводите URL в командные аргументы/логи. Не используйте bootstrap admin в приложении.

## Backup и безопасная проверка восстановления

```powershell
node infra/scripts/db.mjs backup pilot.dump
node infra/scripts/db.mjs restore-check pilot.dump
```

Backup — `pg_dump --format=custom --no-owner --no-privileges`, stdout пишется бинарно через файловый дескриптор. Разрешены только `.dump` непосредственно в каноническом `infra/backups`. Traversal/внешние каталоги/symlink/перезапись запрещены; создание `wx`, права0600. Backup command ограничен120s для пилота, при ошибке удаляет только свой новый неполный файл. Файлы вне проекта и существующие backup не удаляются. После успешного dump создаётся обязательный `<name>.dump.sha256` sidecar; checksum вычисляется по1MiB блокам. При недостающем/неверном SHA256 restore отклоняется **до** создания БД. Hash проверяет целостность, доверенное происхождение backup всё равно проверяется отдельно.

`restore-check` не принимает имя целевой БД. Он создаёт уникальную `ryadom_restore_<timestamp>_<random>` через template0, восстанавливает с `--exit-on-error`, проверяет PostGIS3.4 и реальную geography read/write операцию, выводит только число таблиц/городов/мест при наличии схемы и удаляет **только собственную** scratch-БД в finally. Эти counts не сравниваются с live DB, где параллельно может идти импорт. Нет `--clean` для application database, overwrite production или автоматического drop пользовательской БД. При прерывании процесса возможна оставшаяся scratch-БД: проверить её имя/владельца/использование вручную перед удалением; массового cleanup скрипта нет.

Проверка не доказывает полную целостность прикладных строк и не заменяет API acceptance. Для аварийного восстановления: создать изолированную свежую DB-инфраструктуру с нужными patch/extension versions, проверить checksum и доверенное происхождение backup, восстановить без owner/ACL, выполнить05 `grant-runtime`, проверить количество/контрольные суммы важных таблиц и API, только затем переключать приложение. Никогда не исполнять недоверенный SQL dump от постороннего источника. Для production: отдельное шифрование и хранилище в согласованном регионе, доступ/retention, off-host copies, мониторинг давности и восстановление на отдельном хосте. Эти внешние компоненты не созданы; RPO/RTO пока не измерены. Redis AOF не заменяет backup PostgreSQL.

Скрипты используют `INFRA_ENV_FILE` для выбранного приватного env и `COMPOSE_PROJECT_NAME` для проекта; по умолчанию `infra/.env.local` и `ryadom`. Они выполняют только exec против существующего контейнера db, не запускают сервисы. Production rehearsal следует проводить на staging/scratch без реального трафика.

## Опциональный MinIO

`infra/compose.storage.yaml` содержит профиль `storage`; базовый DB/Redis compose его не загружает и не требует S3 credentials. В этой задаче `minio/minio` Docker Hub API вернул404, два проверенных legacy Quay tag — no such manifest. Upstream community репозиторий архивирован, дистрибуция source-only; нельзя выдавать legacy image за поддерживаемую production поставку. Первичный источник: [MinIO upstream](https://github.com/minio/minio), [security release](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z).

Подготовлен local-only `infra/minio/Dockerfile`: Go builder и Alpine по digest, source release2025-10-15 закреплён commit9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a, непривилегированный user10001, healthcheck. Нет COPY root context/секретов. Рецепт **не собирался и MinIO не запускался**; optional profile не нужен для текущего каталога. Before enabling: build, scanner/license review, проверка S3 API/health/bucket policies. AGPL/source-distribution obligations оценивает владелец коммерческого использования. Для production нужен поддерживаемый S3-compatible сервис/поставка и отдельное решение по региону и лицензии.

```powershell
docker build --network default -f infra/minio/Dockerfile -t ryadom-minio:local-source .
```

После успешной сборки получить immutable local image ID (`docker image inspect ... --format '{{.Id}}'`), записать его как `MINIO_IMAGE=sha256:<actual-id>` только в private env. Для registry-поставки использовать `registry/image@sha256:<actual-digest>`. Пароли MINIO_ROOT_* созданы local генератором; bucket/service accounts не создаются автоматически. Healthcheck ожидает BusyBox wget из этого Dockerfile.

```powershell
docker compose --env-file infra/.env.local -f compose.yaml -f infra/compose.storage.yaml --profile storage config --quiet
docker compose --env-file infra/.env.local -f compose.yaml -f infra/compose.storage.yaml --profile storage up -d --wait minio
```

Оба порта9000/9001 только loopback. Не передавать root credentials приложению: отдельно создать private bucket и минимальный service account. Не выдавать публичные anonymous policies для пользовательских загрузок. Проверка profile config с validation-only image выполнена, image pull/S3 lifecycle не проверены.

## GIS: ограниченный пилот, отдельная задача06.1

Согласованный кандидат06: [OSM France Smolensk extract](https://download.openstreetmap.fr/extracts/russia/central_federal_district/), `smolensk_oblast-latest.osm.pbf` порядка42MiB с sidecars `smolensk_oblast.osm.pbf.md5`/`smolensk_oblast.state.txt`. Размер/дата latest меняются; перед скачиванием фиксировать source URL, source timestamp, license ODbL, attribution, полученный размер и SHA256. MD5 upstream — проверка передачи, не аутентичность. Не подменять timestamp датой импорта. Команды/actual checks/version pins принадлежат `docs/GIS-LOCAL.md` и `docs/GIS.md`.

Границы provisioning: только Смоленская область, ограничение входного PBF64MiB и явная отмена при превышении; preflight RAM/диск, concurrency1–2, ограниченный Docker memory/CPU, импорт и построение графов foreground с timeout/логом. Не скачивать Russia/planet и не использовать автоматический download fallback. Generated graph/index/tiles имеют собственные checksums, coverage bounds, builder versions и provenance. На текущем engine3.8GiB запуск всех builders вместе с DB/Redis не согласован и должен предваряться измерением ресурсов владельцем06.1.

- **Nominatim:** отдельная БД/volume, single bounded import, production public geocoder не fallback; готовность после import/check/address `/search` в подтверждённой области. Не давать ему доступ к application DB superuser. Данные updates не включать без нового плана и retention.
- **Valhalla:** тот же лицензированный PBF, graph config/traffic/elevation/timezone inputs закрепить отдельно. Проверить пеший/авто/велосипедный route и coverage; graph наличие файла не означает готовый маршрут. Не публиковать выдуманную линию при отказе.
- **Tiles:** Planetiler/другой согласованный builder → actual OpenMapTiles-compatible archive → Martin/согласованный server; стили проверять по фактическим source layers. Отдельные лицензированные glyph/sprite/font assets и attribution. Демонстрационный SVG не карта.

Public-facing provider URLs остаются выключенными до реальных acceptance probes. API получает exact allowlisted internal origins, таймауты и response limits; GIS не публикуется напрямую в интернет. Первый-party reference: [Nominatim administration](https://nominatim.org/release-docs/latest/admin/Import/), [Valhalla](https://github.com/valhalla/valhalla), [Planetiler](https://github.com/onthegomap/planetiler). Этот раздел — контракт ограничений, не claim выполненного GIS provisioning.

## Production reverse proxy: подготовлен, не развёрнут

`infra/compose.production.yaml` объединяется с base compose: удаляет **все** DB/Redis host ports через `!reset`; web/api expose только docker network; Caddy публикует80/443. Только proxy получает фиксированный адрес `PROXY_IPV4` default172.29.15.2 в отдельной `PROXY_SUBNET` default172.29.15.0/28; API доверяет ровно этому /32. Если subnet пересекается с существующим Docker/VPN, согласованно поменять обе переменные. Нельзя доверять всему private CIDR или произвольным X-Forwarded-For. Caddy по умолчанию не доверяет заголовкам клиента при формировании forwarded headers.

Требуются реально собранные/проверенные `WEB_IMAGE` и `API_IMAGE` с registry SHA256 digests. В задаче15 application images не создаются и не подменяются фиктивными. Контракт image: Node runtime на3000/3001, пользователь10001:10001, `/app/apps/web/.next/cache` writable для Next cache, остальная FS read-only, корректное завершение SIGTERM, без секретов внутри слоёв. Next server-side rewrite `API_URL=http://api:3001` должен быть встроен/поддержан **при сборке** выбранного image; один runtime env не меняет уже запечённые Next rewrites. Проверить image healthchecks против реального app build. Dockerfiles приложения/публикация image — следующий интеграционный шаг, не скрытая готовая поставка.

В отдельном приватном production env явно задать:

```text
POSTGRES_DB=ryadom
POSTGRES_USER=ryadom_admin
POSTGRES_PASSWORD=<independent random admin secret>
APP_DB_USER=ryadom_app
APP_DB_PASSWORD=<different random runtime secret>
REDIS_PASSWORD=<random alphanumeric/underscore/hyphen, minimum32>
APP_DATABASE_URL=postgresql://ryadom_app:<URL-encoded-runtime-secret>@db:5432/ryadom
REDIS_URL=redis://:<URL-encoded-redis-secret>@redis:6379
WEB_IMAGE=<reviewed-registry/image@sha256:actual-digest>
API_IMAGE=<reviewed-registry/image@sha256:actual-digest>
SITE_HOST=<actual DNS hostname only>
ACME_EMAIL=<actual responsible address>
```

Пример содержит placeholders, с ними запуск не пройдёт. `validate-production.mjs` запрещает reuse generated local file, короткие/типовые secrets, admin runtime URL, public DB/Redis hosts и mutable app tags; ничего из credential values не печатает. Для окружения, заданного orchestrator env, предварительно проверить эквивалентную приватную env конфигурацию. Пароли POSTGRES/APP могут требовать percent-encoding в URL. Redis пароль ограничен алфавитом конфигурации; generator использует hex.

```powershell
node infra/scripts/validate-production.mjs C:/private/ryadom.production.env
docker compose --env-file C:/private/ryadom.production.env -f compose.yaml -f infra/compose.production.yaml config --quiet
```

Публикация не выполняется этими командами. До фактического развёртывания нужны выбранный hosting/регион/договоры, DNS, открытые80/443 на нужном сервере, независимые secrets, schema migrations/grants, image vulnerability review, TLS/restore/load tests и согласованные maintenance/rollback. Caddy сохраняет ACME state в named volumes; HSTS год без preload, security headers, request body/timeouts, no-store дляAPI. Access logs выключены, чтобы не хранить raw IP/адрес/координаты. CSP и Redis distributed rate limits реализуются API/web владельцами; Caddy stock не содержит фиктивного rate_limit module. Отказ API limiter должен fail closed для мутаций. API healthcheck использует реализованный04 `/health/ready` вне `/api/v1`, проверяющий DB/Redis; GIS coverage требует отдельных probes. Rollback app images безопасен только при совместимых миграциях; destructive down-migrations здесь отсутствуют.

## CI и проверка изменений

`.github/workflows/ci.yml`:

1. Node22.22.2, `npm ci`, `npm run typecheck`, `npm run contracts:check`, `npm test`, `npm run build`.
2. Отдельный job: random local secrets, проверка трёх Compose variants, safety tests, offline Caddy validate, реальный DB/Redis startup и smoke, `npm ci`, migrations/grant-runtime/DB integration, backup/restore после схемы; always cleanup **без удаления томов**.

`.github/workflows/security.yml`: `npm audit --audit-level=high` по всем зависимостям; CodeQL JS/TS build-mode none; Trivy secret/misconfiguration scan с HIGH/CRITICAL fail. Нет `continue-on-error`, deploy token, `pull_request_target` или запуска privileged кода из PR. Permissions contents:read; security-events:write только CodeQL job; checkout persist-credentials=false; сторонние Actions закреплены commit SHA. Dependabot настроен для npm и Actions, обновления не auto-merge. Actions refs/digests подтверждены GitHub/Docker APIs на2026-11-27.

CodeQL upload зависит от GitHub code-scanning availability/настроек репозитория (для части private репозиториев нужна соответствующая лицензия). Trivy/npm требуют доступа к vulnerability registries. Hosted CI ещё не запускался: нет основания заявлять успешный GitHub scan. Локальный read-only `npm audit --audit-level=high` выполнился с exit0, `found 0 vulnerabilities` для lock на момент проверки; это не scan контейнеров или полный security audit продукта. `actionlint1.7.12` скачан из официального release, SHA256 сверён, оба workflows прошли локальную проверку синтаксиса. Бинарник хранится только в ignored `infra/data/tools`, не системная установка.

Локальные команды, реально применимые без cloud accounts:

```powershell
node infra/scripts/check-config.mjs
node --test infra/tests/backup-safety.test.mjs infra/tests/production-env.test.mjs
node infra/scripts/smoke.mjs
node infra/scripts/db.mjs backup pilot.dump
node infra/scripts/db.mjs restore-check pilot.dump
```

`check-config.mjs` проверяет configs с validation-only app/storage image references; он ничего не pulls/starts и не проверяет существование этих image. Перед production обязательны отдельно `validate-production`, scan/подтверждение **реальных** image и end-to-end tests. Синтаксис Caddy можно проверить одноразовым offline контейнером по команде в CI. Наблюдаемые команды/результаты и ещё незапущенные проверки перечислены в `docs/HANDOFFS/15.md`. Production readiness не заявляется.

## Наблюдение и оставшиеся зависимости

Для локальной диагностики: Compose `ps`, `docker stats --no-stream ryadom-db-1 ryadom-redis-1`, health output; логи не публиковать без проверки на секреты. Production needs external health probes, alerts по backup age/disk/RAM/DB connections/Redis evictions и worker failures, owner/on-call и проверенные retention/регион размещения. В этой задаче нет зарегистрированного monitoring endpoint/account или фиктивных uptime показателей.

Получатели: 00 — статус/приёмка; 01 — root docs/env/lock и интеграции; 05 — schema/grants/integration; 04 — runtime role/API_HOST/proxy/rate limit; 06/06.1 — ограниченный GIS; 13/14 — security/E2E/нагрузка и product acceptance. Работающая БД и успешный backup не доказывают завершённость всего «Рядом».
