# Рядом — NestJS API этапа 1

Владелец: 04. Стек: NestJS 12.6.3, Express 5.3.0, Node 22.22.2, strict TypeScript. Skills: Sites прочитан полностью, local-only workflow с заданным Next/Nest/PostGIS. Категории: backend/API/GIS/database, architecture, security, performance, testing, documentation. Профильных Nest/GIS/security skills нет; проверки описаны ниже. Никаких commits/push/deploy. Исходные `ryadom-digital-city/` не менялись.

## Контракт и endpoints

Авторитетны `packages/types/src/index.ts` и generated `docs/openapi.yaml`, версия 1.0.0. API не генерирует второй набор DTO и не публикует отдельный Swagger UI. Все данные перед отправкой проходят общий response schema. Успех: `{data,meta:{requestId,generatedAt}}`; ошибка: `{error:{code,message,provider?},meta}`. requestId всегда новый серверный UUID, не значение клиентского заголовка. HTTP ответы no-store.

| Метод | Путь | Поведение |
| --- | --- | --- |
| GET | `/api/v1/cities` | Реальные включённые города из DB, пустой список допустим |
| GET | `/api/v1/categories` | Ровно 14 категорий из общего CATEGORIES: taxonomy, не выдуманные организации |
| GET | `/api/v1/places/near` | city/lon/lat обязательны; bounded radius/category/q/openNow/accessibility/rating/page/limit из DTO; DB возвращает точное расстояние и total с теми же фильтрами |
| GET | `/api/v1/places/:slug` | Существующее публичное место с provenance либо404 |
| GET | `/api/v1/stats` | city?; измеренные DB метрики, отсутствующие факты не заполняются |
| GET | `/api/v1/platform-reviews` | page/limit; только опубликованные DB записи с согласием, пустой список допустим |
| GET | `/api/v1/geocode` | city+q, включённый DB город → фиксированный Nominatim adapter; disabled/pending coverage явно503 |
| POST | `/api/v1/routes` | Строгие две точки и walking/driving/cycling, span≤100км; реальный Valhalla либо503; подтверждённый no_route→404 |
| GET | `/api/v1/map/config` | 200 discriminated available/unavailable; URL только из deployment env и exact allowlist |
| POST | `/api/v1/reports` | Existing public placeId, enum reason, description10..2000, consent=true;202 после durable INSERT, unknown place404, DB/Redis unavailable503 |
| GET | `/health`, `/health/live` |200 liveness без секретов |
| GET | `/health/ready` |200 только при доступных DB/Redis, иначе503 provider state; GIS configured не означает проверенный working provider |

Все object DTO строгие. Query читается как scalar URLSearchParams: duplicate keys, массивы/объекты, неизвестные поля, control chars, пустые/неполные числовые строки отвергаются400. `openNow=false` остаётсяfalse, не преобразуется через Boolean(string). Неизвестный slug404, invalid slug400. DB query-фильтры передаются без SQL-интерполяции в `CatalogRepository` из `@ryadom/db/compiled`. В API SQL поиска и вставки отсутствует. Открытость/рейтинги/фото не придумываются; текущая DB реализация возвращает unknown/null и исключает неизвестные данные при соответствующем фильтре.

Согласованные ошибки:400 VALIDATION_ERROR,404 NOT_FOUND,413 PAYLOAD_TOO_LARGE,415 UNSUPPORTED_MEDIA_TYPE,429 RATE_LIMITED + Retry-After,503 PROVIDER_UNAVAILABLE,500 INTERNAL_ERROR. Ошибки не содержат stack/SQL/DSN/upstream body/точные координаты/исходный q. Неизвестный endpoint также получает безопасный404 envelope. Origin policy отклоняет запрос400 в рамках согласованных кодов, не вводит незадекларированный403.

## Запуск и env

Из корня checkout, после координированного install/`npm ci` и DB migrations/seed/grants:

```powershell
npm run build:shared
npm run typecheck --workspace=@ryadom/api
npm test --workspace=@ryadom/api
npm run build --workspace=@ryadom/api
npm run dev:api
```

`npm run start:api` запускает `node apps/api/dist/main.js` через корневой runtime wrapper с правильным cwd. Скомпилированные `types`, `gis`, `db/compiled` обязательны до API. API dev использует tsx watch, production запускается обычным Node без загрузчика TS. Первичную установку делал01, дальнейшие изменения lock/установок — только17; 04 не запускал npm install и не менял lock/root scripts.

Корневой `scripts/runtime.mjs` читает `.env` и передаёт только APP_DATABASE_URL/REDIS_URL из ignored `infra/.env.local`. Bootstrap/migration credentials API не нужны. При прямом workspace start/dev env передаются оператором. Параметры не печатаются в логах.

| Env | Эффект |
| --- | --- |
| `API_PORT`, `API_HOST` | default3001/127.0.0.1; контейнеру API_HOST=0.0.0.0 |
| `APP_DATABASE_URL` | Только runtime role; отсутствие →catalog/reports503, никакого memory fallback |
| `REDIS_URL` | Authenticated shared Redis; отсутствие/отказ →reports503, локальные bounded read/geo limits |
| `CORS_ORIGINS` | Exact comma-separated frontend origins без trailing slash; без wildcard/credentials; нужен reports Origin |
| `API_TRUSTED_PROXIES` | Только точные адреса/CIDR принадлежащего deployment proxy; defaultfalse, wildcard/0-hop/all-network запрещены |
| `API_READ_LIMIT`, `API_GEO_LIMIT`, `API_REPORT_LIMIT` | Defaults60/min,10/min отдельно для geocode и routes,5/hour reports; bounded configurable ranges |
| `GEOCODER_PROVIDER` | Явный nominatim включает доступный adapter; disabled/неподдерживаемый pelias→disabled503; Pelias не реализован |
| `NOMINATIM_URL`, `VALHALLA_URL` | Фиксированные deployment-owned base URLs, не HTTP input |
| `GIS_ALLOWED_ORIGINS`, `GIS_ALLOW_HTTP`, `GIS_USER_AGENT` | Exact server upstream origins, HTTP только явно для собственных сервисов, валидный identifying UA |
| `MAP_STYLE_URL`, `MAP_ALLOWED_ORIGINS`, `MAP_ALLOW_HTTP` | Опубликованный style JSON без credentials/query/hash; exact origin, HTTP только explicitly allowed |
| `MAP_ATTRIBUTION`, `MAP_MIN_ZOOM`, `MAP_MAX_ZOOM` | Непустая атрибуция обязательна для available, zoom0..24 min≤max |

Совместимые aliases API_CORS_ORIGINS и `*_BASE_URL`, per-provider `*_ALLOWED_ORIGINS`/`*_ALLOW_HTTP` читаются только если canonical env не задан. В текущем API таймаут GIS жёстко5000мс, лимит streamed upstream4MiB; `GIS_TIMEOUT_MS`/`GIS_MAX_RESPONSE_BYTES` не меняют эти бюджеты. Принят authoritative архитектурный максимум5с; объявленный env не следует считать активным управлением без реализации. Не публиковать приватные ключи в map config. Выдача available означает валидную операторскую конфигурацию, реальную загрузку style/tiles проверяет map/integration workflow.

## Защита, лимиты и приватность

Express default parsers отключены; добавлен только JSON parser с пределом16384 decoded bytes, compression запрещена. Content-Type только application/json с optional charset=utf-8. URL≤4096bytes, HTTP request/header timeout10с, keepalive5с. DB pool/SQL limits задаёт05 (10connections, statement3с); API ожидание DB≤3.5с, GIS≤5.5с, output JSON≤5MiB. SQL может завершаться по собственному timeout после client disconnect; API не хранит историю движения и не обещает мгновенную отмену pg query. GIS получает AbortSignal клиента и собственный total timeout, без retries.

Rate budgets — fixed windows; shared Redis INCR+expiry атомарны. Redis key содержит HMAC IP, не raw IP; ключ HMAC производный от одного RedisURL для одинаковой идентичности replicas, TTL равен окну. Адреса/credentials/q/body не логируются. Разные replicas обязаны иметь одинаковый RedisURL и namespace. Per-process fallback для read/geo bounded10000ключей, reports всегда fail closed. Redis connect/reconnect отказ требует восстановления сервиса и перезапуска клиента/API; глобальная доступность при outage не обещается. Максимум одновременно4geocode/2route на API process, очереди ожидания нет, превышение429. Limiter срабатывает до controller/repository/GIS, после bounded JSON parser; edge должен ограничивать parsing/connections и общий fleet budget.

Origin/CORS + report bucket привязаны к выбранному Nest handler в global guard. Trailing slash/uppercase не обходят write policy. Reports требуют exact Origin и запрещают Sec-Fetch-Site:cross-site, принимают только JSON; cookies/auth/session отсутствуют. Origin не аутентификация; от ботов защищают rate bounds и moderation pending. Предложенный security13 custom header/daily quota/dedup не входят в authoritative DTO/architecture01 и пока не реализованы. Требуются решение координатора и rollout с frontend до изменения поведения.

Helmet задаёт CSP/default-src none, nosniff, запрет framing, no-referrer и другие security headers; CORS не отражает чужой origin, credentials не разрешены. Server-side GIS URLs проходят allowlist/redirect/size/schema проверки GIS06; DNS/egress firewall остаётся инфраструктурным gate, allowlist не заменяет его. API не скачивает произвольные website/photo/provenance URLs.

## Проверки

```powershell
npm run typecheck --workspace=@ryadom/api
npm run build --workspace=@ryadom/api
npm test --workspace=@ryadom/api
npm run smoke --workspace=@ryadom/api
$env:API_DATABASE_TEST='1'
npm test --workspace=@ryadom/api
Remove-Item Env:API_DATABASE_TEST
```

Unit/HTTP suite использует настоящий Nest listener на ephemeral127.0.0.1 + Supertest, dependency fixtures только внутри tests. Runtime никогда не использует эти fixtures. Покрыты strict/duplicate query, radius/lat/boolean, route mode/span, literal injection filter transfer, empty lists, unavailable/malformed upstream/DB, report receipt/validation/origin, MIME/size/JSON, no-store/headers, XFF spoofing, rate limits и F-13-01 paths. Optional database integration создаёт только новую validated `ryadom_apitest_<uuid>` БД, миграции/seed/import fixture/grant-runtime через05, реальный runtime repository+Redis+Nest; проверяет поиск/карточку/SQL-injection literal, durable pending report, shared Redis two-client counter, Redis failure/report fail-closed и SQL failure mapping; удаляет БД finally. Не запускается по умолчанию и не должен выполняться против production.

Smoke читает actual runtime DB/Redis через HTTP без вставок, проверяет health/cities/categories/near/stats/reviews/unknown place/unknown-report/map config. Он не заменяет полноценный адрес→кафе→маршрут scenario. Exact результаты и ограничения — `docs/HANDOFFS/04.md`. Работающие GIS/tiles, browser/edge HTTPS, нагрузка на репрезентативной базе и полная security gate требуют отдельной приёмки; успешная сборка не production readiness.
