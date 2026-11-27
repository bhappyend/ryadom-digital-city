# Рядом — архитектура и стабильный контракт этапа 1

Версия контракта **1.0.0**, 2026-11-27. Владелец контрактов: чат 01; изменения через координатора 00. `packages/types/src/index.ts` — источник DTO и runtime Zod-валидации, `docs/openapi.yaml` генерируется из него. Пока это основа, не готовое приложение. Исходный `ryadom-digital-city/` неизменяем.

## Область и категории задачи

Архитектура, backend/API/database/GIS, security, performance, testing, документация. Прочитан Sites SKILL полностью; выбран режим local-only и заданный Next/Nest стек. UI, accessibility и SEO должны пройти собственные проверки в зависимых задачах; в этой задаче UI не создаётся. Специализированных UI/GIS/security Skills в доступном наборе нет.

## Стек и совместимость

Фактическая проверка npm registry 2026-11-27 и первичная документация:

| Компонент | Зафиксированная версия / решение | Ответственный |
|---|---|---|
| Node/npm | локально Node 22.22.2, npm 10.9.7; Node >=22.12 на 22.x, либо 24/26 | 01 / DevOps |
| TypeScript | **6.0.3**, strict, exactOptionalPropertyTypes, noUncheckedIndexedAccess | 01 |
| Zod / Vitest | **4.6.7 / 5.1.2** | 01 |
| Next / React / React DOM | **16.4.6 / 19.3.1 / 19.3.1**, App Router, web:3000 | frontend |
| React types | **@types/react 19.3.3 / @types/react-dom 19.3.0** | frontend |
| Nest common/core/platform-express | **12.6.3** для всех трёх; API:3001 | backend |
| Nest Swagger / RxJS / reflect-metadata | **12.1.3 / 7.8.2 / 0.2.2** | backend |
| MapLibre GL JS | **6.19.0**, динамическая загрузка на клиенте | GIS |
| PostgreSQL/PostGIS | **16.x + 3.4.x**, версии образов/digests принимает DevOps после проверки доступности и security updates | database / DevOps |
| pg / BullMQ | **8.23.1 / 6.7.10**, только когда реально используются | backend / import |
| Redis / S3 | Redis совместимый с выбранным BullMQ; S3-compatible storage; версии/лицензия инфраструктуры отдельным ADR DevOps | DevOps |
| Geocoder / router | собственный Nominatim либо Pelias; Valhalla, отключены до настройки | GIS |

TypeScript latest в registry — 7.0.2, но Swagger 12.1.3 объявляет peer `^5.5 || ^6`; потому выбран совместимый **6.0.3**, не latest. Nest 12 core ESM потребляется из CommonJS через Node require(esm), доступный на локальном Node. Генераторы Nest CLI **не используем**: актуальный schematics требует Node >=22.22.3, а локально 22.22.2. Минимальные приложения создаются вручную. Не добавлять class-validator/class-transformer для дублирования Zod. Swagger публикует зафиксированную OpenAPI, а не второй набор DTO.

Источники: [Next installation](https://nextjs.org/docs/app/getting-started/installation), [Nest compatibility](https://docs.nestjs.com/faq/versions), [Nest 12 migration](https://docs.nestjs.com/migration-guide), [Nest OpenAPI](https://docs.nestjs.com/openapi/introduction), [Zod requirements](https://zod.dev/), [Vitest migration](https://vitest.dev/guide/migration/). Точные версии и peer ranges дополнительно проверены `npm view <package> version engines peerDependencies --json`. Ссылки не означают, что приложение с этими библиотеками уже собрано.

## Workspaces, сборка и владение зависимостями

`apps/web` (@ryadom/web) → `packages/ui` (@ryadom/ui), `packages/types` (@ryadom/types), `packages/config` (@ryadom/config). `apps/api` (@ryadom/api) → types/config. UI не импортирует API-код; types не зависит от React/Nest/БД. Внутренние зависимости задавать `"@ryadom/types": "0.1.0"` (npm links workspaces), не `workspace:*`. `@ryadom/types` скомпилирован в CommonJS + declarations, одинаковые exports для import/require; Next читает обычный JS, Nest не запускает TS из node_modules. Сначала `npm run build:shared`.

Только чат 01 меняет корневой package.json/package-lock.json и запускает npm install на начальном этапе. Другие исполнители создают свои package.json с точными версиями и сообщают координатору, затем 01 обновляет lock один раз без параллельных установок. Никаких npx create-next-app/nest new в корне. Общий TS/Vitest/@types/node — root devDependencies; runtime зависимости — у использующего workspace. `packages/config` содержит только TS конфигурации, без env/секретов. Workspaces `packages/*` + `apps/*` регистрируют в том числе db/gis/importer. Корневой `build` сначала явно собирает types, затем workspace builds (packages до apps); дальнейшую топологию при новых межпакетных зависимостях принимает интегратор. Отсутствующее приложение не означает пройденный application build.

Команды из корня (после появления и регистрации соответствующего workspace):

```text
npm install
npm run build:shared
npm run typecheck
npm test
npm run contracts:check
npm run dev:web
npm run dev:api
npm run build
```

Frontend: package name @ryadom/web, scripts `dev: next dev -p 3000`, `build: next build`, `start: next start -p 3000`, `typecheck: tsc --noEmit`. tsconfig extends `@ryadom/config/tsconfig/web`; local include next-env.d.ts, .next/types/**/*.ts, исходники; exclude node_modules. Указать rootDir только локально при необходимости, `transpilePackages: ['@ryadom/ui']` для TS UI. Backend: name @ryadom/api, scripts `dev: tsc --watch` + отдельный запуск Node либо согласованный watcher, `build: tsc -p tsconfig.build.json`, `start: node dist/main.js`, `typecheck: tsc --noEmit`; tsconfig extends `@ryadom/config/tsconfig/api`, локальные rootDir/outDir. Nest `setGlobalPrefix('api/v1')`; Zod pipe парсит raw query через InputSchemas. Оба процесса стартуют независимо. Не добавлять shell-specific background commands в npm scripts.

## Транспорт и данные

JSON, `/api/v1`; успех `{data,meta:{requestId:<uuid>,generatedAt:<ISO UTC/offset>}}`. Ошибка `{error:{code,message,details?,provider?},meta}`. Все объекты strict: неизвестные поля отклоняются. Ответы валидируются теми же схемами. Контакты/URL отображать безопасно, тексты как текст, никогда raw HTML. `HttpUrlSchema` допускает только http(s) без credentials; это **не** разрешение серверу скачивать URL. Любые серверные fetch — только фиксированные allowlist endpoints, redirect запрет/повторная проверка, таймаут и лимиты ответа.

Координаты всегда WGS84: объект `{lon,lat}`, GeoJSON `[lon,lat]`, bbox `[west,south,east,north]` без пересечения антимеридиана. Объекты широта/долгота не меняются местами на слоях DB, API и UI. `ST_SetSRID(ST_MakePoint(lon,lat),4326)::geography`. Расстояния в метрах, время в секундах; Valhalla km/shape polyline6 преобразуются адаптером. Каталог сортируется по точному distance ASC, id ASC. Время города IANA timezone; открытость вычисляет сервер. Неизвестные часы → `unknown`; openNow=true возвращает только известное open. `rating=null` означает отсутствие разрешённого рейтинга; фильтр rating исключает null. Accessibility yes/limited/no/unknown; фильтр требует точного значения. q — literal поиск, без wildcards пользовательского SQL. category — одна категория из 14. Рекламное ранжирование этапа 1 отсутствует.

City.id — slug (например smolensk), Place.id — UUID, Place.slug — стабильный латинский slug, значение near зарезервировано. 14 категорий CATEGORIES в types точно соответствуют tile/marker Assets: cafe, shopping, pharmacy, medicine, beauty, auto, sport, hotel, entertainment, bank, education, government, services, fuel. Это taxonomy, не фиктивные организации. Города и координаты наполняет DB/GIS по проверенному источнику; в types нет seed координат.

Place включает address, coordinates, categoryIds, nullable description/phone/website/openingHours/hoursVerifiedAt/rating, openingState, accessibility, photos[], provenance[], updatedAt. Неизвестные факты не заменять выдуманными. Каждый source содержит sourceId, sourceRecordId, sourceUrl|null, license, attribution, sourceUpdatedAt|null, importedAt. Фотографии отдельно требуют attribution/license/sourceUrl. Отзывы о местах и филиалы расширяются через согласованный контракт этапа 2, не через локальные несовместимые поля.

## Endpoints этапа 1

| Метод и путь | Параметры / data / поведение |
|---|---|
| GET /cities | City[]; пусто при отсутствии проверенных городов |
| GET /categories | Category[] ровно 14 |
| GET /places/near | city,lon,lat обязательны; radius int 300..10000 default1500, category?, q? 2..200, openNow true/false defaultfalse, accessibility? yes/limited/no, rating? 0..5, page1..100 default1, limit1..50 default20. data `{items:NearbyPlace[],pagination:{page,limit,total,hasMore}}` |
| GET /places/{slug} | data Place, 404 при неизвестном slug |
| GET /stats | city?; data `{cityId:null|slug,measuredAt,metrics:[{key,value,source}]}`; только проверенные метрики, неизвестные отсутствуют, metrics=[] разрешён |
| GET /platform-reviews | page/limit как выше; `{items:PlatformReview[],pagination}`; публикации только с согласием, пустая выдача разрешена |
| GET /geocode | q3..200 и city обязательны; GeocodeResult `{items:[{id,label,coordinates,bounds,provenance}],provider:nominatim|pelias,attribution}` max10, no matches → items=[] |
| POST /routes | `{origin:{lon,lat},destination:{lon,lat},mode:walking|driving|cycling}`; endpoints <=100km по прямой; data RouteResult `{provider:valhalla,mode,geometry:GeoJSON LineString,maneuvers,distanceMeters,durationSeconds,attribution}`; no route → 404 |
| GET /map/config | data `{status:available,provider:map,styleUrl,attribution,minZoom,maxZoom}` или `{status:unavailable,provider:map,reason,message}`; без ключей, только разрешённый style URL |
| POST /reports | `{placeId:uuid,reason:incorrect_address|closed|incorrect_hours|duplicate|other,description:10..2000,consent:true}`; **202 только после durable записи**, data `{id,status:pending,receivedAt}`; unknown place →404; недоступно хранилище →503 |

QueryInputSchemas принимают только scalar строки Express URL query; не использовать `z.coerce.boolean()` (`false` превратится в true) и не преобразовывать пустые строки в нули. Повторные параметры/arrays/objects/неизвестные поля →400. page имеет предел для bounded offset. total — реальное число совпадений с теми же фильтрами; пустой page сохраняет total. Нет принудительного fallback на центр при отсутствии lon/lat. UI запрашивает геолокацию только по согласию; без неё адрес/выбранная точка.

HTTP errors: 400 VALIDATION_ERROR; 404 NOT_FOUND; 413 PAYLOAD_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE; 429 RATE_LIMITED (+Retry-After); 503 PROVIDER_UNAVAILABLE; 500 INTERNAL_ERROR. Provider error всегда включает `provider:{status:unavailable,provider:catalog|map|geocoder|router|reports,reason:not_configured|disabled|timeout|upstream_error|coverage_missing,message}`. Сбой зависимости никогда не превращается в пустой success. GET map/config сохраняет 200 с discriminated state для доступного API с ненастроенной картой; если сам API упал, транспортная ошибка.

## Примеры (не сведения об организациях)

```http
GET /api/v1/places/near?city=smolensk&lon=32&lat=54&radius=1500&category=cafe&openNow=false&page=1&limit=20
GET /api/v1/geocode?q=<URL-encoded verified address>&city=smolensk
POST /api/v1/routes
Content-Type: application/json

{"origin":{"lon":32,"lat":54},"destination":{"lon":32.001,"lat":54.001},"mode":"walking"}
```

Числа выше — только тест транспорта, не подтверждённый адрес/маршрут Смоленска. Acceptance использует фактически геокодированный существующий адрес; исходный MASTER-PROMPT не содержит точного адреса, координаты не выдумывать.

```json
{"error":{"code":"PROVIDER_UNAVAILABLE","message":"Маршрутизатор не настроен","provider":{"status":"unavailable","provider":"router","reason":"not_configured","message":"Valhalla не настроен"}},"meta":{"requestId":"00000000-0000-4000-8000-000000000001","generatedAt":"2026-11-27T00:00:00Z"}}
```

## Слои и безопасность реализации

Nest controllers → Zod boundary → services → repository/adapters. SQL только параметризованный. DB owner определяет миграции, GiST на geography(Point,4326), индексы category/city, transactional provenance, unique(sourceId,sourceRecordId). Сначала ST_DWithin с radius <=10000, затем точный ST_Distance и детерминированный pagination; измерить EXPLAIN ANALYZE на реальном объёме. FTS/trigram при необходимости после измерения, bounded q, escape LIKE. DB failures →503 catalog. Publication/moderation всегда server-side; никаких публичных mutation endpoints кроме reports.

API: body JSON <=16KiB, query URL <=4KiB, timeout SQL <=3s, upstream <=5s, response <=5MiB, route geometry <=20k points/2k maneuvers. Валидировать upstream output, отменять fetch по AbortSignal клиента, не ретраить бесконечно. Сетевой reverse proxy ограничивает request rate до Node. Начальная политика для проверки backend/DevOps: reads60/min/IP, geocode10/min/IP, routes10/min/IP, reports5/hour/IP; распределённый Redis, конфигурируемые лимиты, trusted proxy только известные адреса. При отказе Redis публичные reports fail closed. POST reports без URL/файлов/контактов; текст не просить с персональными данными, moderation очередь, retention/удаление согласовать с юристом.

CORS allowlist, security headers, безопасные URL и CSP, server secrets не NEXT_PUBLIC. Не логировать точные координаты, raw q/body и IP без обоснованной retention; requestId для диагностики. PWA никогда не кэширует /api/**, приватные/geolocation ответы; API no-store. Будущие auth: HttpOnly/Secure/SameSite cookies, CSRF, server RBAC, MFA admins; отдельная задача с threat model. Не реализовывать самодельную auth на этапе каталога.

## Хостинг и интеграции

Целевая схема — российский регион размещения: reverse proxy/TLS → Next Node + Nest Node → private PostgreSQL16/PostGIS3.4, Redis, S3; отдельные jobs/geocoder/router/tiles. Провайдер, договор, домен, лицензии, бюджет, резервирование и юридическая оценка пока не выбраны. `docs/INTEGRATIONS.md` фиксирует блокеры. Это архитектурная цель, не утверждение юридического соответствия. Sites Cloudflare Workers не даёт raw TCP и не является заменой Nest/PostGIS; в этой задаче нет регистрации Site, deploy или инфраструктуры.

## Поэтапная приёмка и передачи

1. **Основа (01):** npm workspaces, reproducible lock, compiled types + strict config, отрицательные schema tests, OpenAPI parity. Не требует наличия apps.
2. **Вертикальный срез (DB/API/import/GIS/frontend):** проверенный город, лицензированный импорт с source timestamps, реальный nearby SQL+indexes; веб пустые/error/loading/cancel states, карточка, настоящая карта, geocode+route либо явные unavailable; 202 report только durable. API integration tests на PostGIS и downstream failure tests; никаких фиктивных fixtures в публичном каталоге.
3. **Этап 1 продукта:** существующий адрес → кафе → nearest → настоящий маршрут; работы без геолокации, нулевая выдача, offline/PWA; responsive 360/390/768/1024/1440/1920, keyboard/focus/WCAG2.2AA, reduced motion; LCP/INP/CLS измерены; security/dependency checks, backup restore, license verification. Сборка сама по себе недостаточна.
4. **Этап 2:** auth/accounts, saved places, place reviews, CMS/admin/moderation, business/claims/заявки — новые согласованные contracts/RBAC/audit/privacy. `/business` может содержать честную информацию без фиктивного отправленного заявления; бизнес API пока не объявлен.
5. **Этап 3:** платежи/webhooks/idempotency, реклама с маркировкой, аналитика/регионы — отдельные лицензии, реквизиты и юридические решения. Нет платёжных production endpoints в v1.0.

Ownership: 01 root manifests/types/config/OpenAPI/architecture/integrations; UI02 packages/ui+assets; frontend03 apps/web кроме выделенных областей GIS/PWA; backend04 apps/api application; DB05 migrations/repositories по распределению координатора; GIS06 adapter modules и map integration в назначенных путях; import07 provenance/ETL; DevOps15 infra/compose/CI; coordinator00 принимает breaking decisions и обновляет PROJECT-STATUS. Любое пересечение сначала маршрутизируется 00. Исполнители не редактируют root scripts/contracts/lock самостоятельно.
