# QA этапа 1 — Рядом

Latest national selector checkpoint: `national-selector-85-03` **1PASS**,5.9s +typecheckPASS, web39752/API90596. city-order attachment confirms **85 real API cities**. Home/pilot default, bare/mapSmolensk, actual combobox selection→Котельники, explicitcityquery+category preservation allasserted. Same targeted command as city-default below; no other suite repeated. This confirms selector behavior, **does not confirm GIS coverage outside Smolensk**. Artifacts under `packages/qa/artifacts/national-selector-85-03/`. No active QA run.

## National city default regression — latest web39752

`national-city-default-02`, production `http://127.0.0.1:3000`/API90596: **1PASS**,4.7s. Команда `npm run test:e2e --workspace=@ryadom/qa -- --project=live-ui --grep 'national catalog order'`. Реальный `/cities` имеет national entries перед Smolensk; `/` QuickSearch selected city=smolensk, bare`/map` selected=smolensk. Explicit Котельники query использует реальный API ID `city-67488a01-ccb7-4638-bcad-117db0fbe9a3`, сохраняет этот город и category=cafe. Fixture/mocks отсутствуют. Артефакты city-order JSON и fullpage explicit-kotelniki.png в `packages/qa/artifacts/national-city-default-02/results/`. Первый run01 FAIL из-за ошибочного предположения QA о slug=kotelniki; после чтения фактического API ID исправлен test, не приложение. Последний typecheckPASS. QA browser idle, процессы17 не остановлены.

## Финальный targeted checkpoint — web85390/API90596

2026-11-27. После sole production rebuild17 (metrics fix + manual monthly business copy) выполнены только запрошенные regressions:

| Run ID | Команда после `npm run test:e2e --workspace=@ryadom/qa --` | Наблюдение |
|---|---|---|
| final-axe-pwa-02 | `--project=live-ui --project=pwa --grep 'home .*px:|service worker never|manifest and production'` | 7PASS/1FAIL: home360/390/768/1024/1440/1920 axe/overflow/browsererrors всеPASS, manifest+productionoffline/recoveryPASS; privacyFAIL на429 |
| privacy-isolated-03 | `--project=pwa --grep 'service worker never'` | 1PASS после окна rate limit: реальный categories200/no-store, cache URLs только offline.html/разрешённые immutable assets; API/private/query/geolocation не сохранены |
| pricing-final-01 | `--project=live-ui --grep 'business pricing'` | 1PASS:390/1440 axe/overflow, monthly/manual wording, VK/TG founder links visible; screenshots |

Environment: `BASE_URL=http://127.0.0.1:3000`, API proxy→`http://127.0.0.1:3001`; каждый QA_RUN_ID соответствует таблице. Chromium1255, свежие context без пользовательского профиля, PWA context serviceWorkers allow; другие тесты block. Typecheck после последнего изменения PASS. Зависимости не менялись, npm install/build/process teardown QA не выполнял.

QA14-01 invalid metrics dl **CLOSED** фактическим axe6/6 на финальной сборке. Fullpage screenshots сохранены для всех6 widths в `packages/qa/artifacts/final-axe-pwa-02/results/`; pricing390/1440 — `pricing-final-01/results/`. Визуально прочитан mobile390 screenshot: секции без обрезки, live stats2339/1 с source labels, hero illustration/mapdemo явно подписаны; оценка композиции/контраста00 остаётся отдельной ручной CUA-проверкой. Artifacts JSON/HTML/axe/trace игнорируются локальным gitignore.

Оставшиеся gaps: compact address normalization (QA14-02), полный браузерный address→route (API structured address scenario прошёл), controlled SW update/multitab/nativeOS install и field INP. Эти пункты не закрываются успешными целевыми regressions. Полная product/release readiness не заявляется. Предыдущие FAIL сохранены ниже как история, актуальный статус targeted gates — эта таблица.

## Последние фактические результаты (приоритет над ранними checkpoint ниже)

На production web92926/API90596: `production-01` **13 PASS /12 FAIL /0 skip**. Шесть screenshots/overflow прошли до axe assertion, но axe на всех360/390/768/1024/1440/1920 обнаружил invalid stats `dl > div > span` (QA14-01/P2,03). Исправление03 требует rebuild и повторного axe. QuickSearch/SSR detail/privacy probe затронуты общим read rate limit429; это не считается cache leak или доказанным функциональным defect. Часть mock failures была из-за test selectors/Next route-announcer; исправлены.

`map-production-01`: **1 PASS**, настоящий vector tile загружен, canvas виден, нет worker/CSP/pageerror/map-status. `production-01` PWA registration/manifest/offline503/online recovery **PASS**; cache privacy case FAIL на API429, требуется targeted rerun. Native-install unavailable instructions/focus PASS. Isolated catalog empty vs failure/retry, router503 retry/no fake result, literal XSS, reports503 и invalid202/no success — PASS.

`mock-geocode-03`: **3 PASS**: no matches отличается от provider unavailable, только выбранный адрес передаёт nearby coordinates. Тесты scope main и rolecombobox исправляют ложные ошибки селекторов, не приложения.

`live-router-01`: **1 PASS** — реальные DB place→place Valhalla walking/cycling/driving. `live-acceptance-02`: **2 FAIL**, исходная слитная строка «Смоленск ул.Ленина8» HTTP200/items0 после подключения собственного Nominatim. `live-structured-03`: address→nearby→detail **PASS** при `QA_ADDRESS='Смоленск, улица Ленина, 8'`; route initially failed ошибочным QA assertion >2 geometry points. `live-structured-04` distant destination>300 отсутствует в первых20 cafes, fixture choice failed. `live-structured-05`: real geocoder→nearby cafe→Valhalla walking **1 PASS** после исправления: реальная короткая street geometry законно может иметь2points; проверяются schema/maneuvers, meters/seconds и endpoints<200m. Координаты получены от provider, не подставлены.

Все команды: `npm run test:e2e --workspace=@ryadom/qa -- --project=<project> --grep <test-title>` с `BASE_URL=http://127.0.0.1:3000`, `API_URL=http://127.0.0.1:3001`, `QA_RUN_ID=<указанный run>`. Structured spelling задаётся отдельно `QA_ADDRESS`; compact default сохранён и не скрыт. Артефакты каждого прогона сохранены отдельно. Полный live browser address acceptance, final axe rebuild, privacy429 rerun, SW update/multitab и field INP пока не закрыты.

Dev observation `ui-dev-01`: LCP600ms, sum CLS0.2542; это одиночная unthrottled dev observation, не production CWV PASS. Screenshot composition/hero contrast ручная проверка00; UI integration active revisions не фиксированы commit. Полная готовность не заявлена.

Статус 2026-11-27, 02:31 MSK: **реальный API smoke пройден, address/route acceptance блокируется отсутствующим geocoder; UI ожидает web preview17**. Нет подтверждения production readiness.

Использован Sites SKILL (local-only, заданный Next/Nest/PostGIS), прочитан portable preview reference. Специализированный QA skill отсутствует. Работа ограничена `packages/qa/**` и этим отчётом/handoff14. Исходный архив и приложения не изменялись.

## Запуск после интеграции

Интегратор17 владеет установкой и запущенными сервисами. QA не делает npm install и не запускает параллельную сборку Next.

```powershell
$env:BASE_URL = 'http://127.0.0.1:3000'
$env:API_URL = 'http://127.0.0.1:3001'
npm run test:e2e:list --workspace=@ryadom/qa
npm run test:e2e --workspace=@ryadom/qa -- --project=live-api
npm run test:e2e --workspace=@ryadom/qa -- --project=live-ui
npm run test:e2e --workspace=@ryadom/qa -- --project=mocked-ui
npm run test:e2e --workspace=@ryadom/qa -- --project=pwa
```

URL выше — пример команды, не свидетельство доступности. При необходимости `QA_BROWSER_CHANNEL=msedge`/`chrome` использует отдельный Playwright context без доступа к пользовательскому профилю. Chromium install разрешён только после установки dependencies. Для PWA нужен production preview: dev намеренно не регистрирует service worker.

## Доказательства и критерии

Артефакты исключены собственным `packages/qa/.gitignore`: JSON results, HTML report, traces, screenshots, API responses в `packages/qa/artifacts/<QA_RUN_ID>/`. Реальные сервисы и mocked failure cases разделены проектами; mocked pass никогда не означает real acceptance.

Наблюдаемые проверки подготовки: `npm run typecheck --workspace=@ryadom/qa` PASS; `npm run test:e2e:list --workspace=@ryadom/qa` PASS (27 тестов до добавления XSS smoke). Installed Chromium1255 найден по `require('playwright').chromium.executablePath()` + `fs.existsSync`: true, браузер пока не запускался. `npm run test:e2e --workspace=@ryadom/qa -- --project=live-api` exit1 на global preflight: `QA BLOCKED: BASE_URL is required`; выполнено **0 E2E**. Это корректный blocker, не PASS или ignored/skip.

| Проверка | Текущий результат |
|---|---|
| Live categories14, no-store, HTTP negative unknown/repeated/oversized radius, no reflection/nosniff | PASS 2/2, `live-api-01` |
| Live city-center catalog from actual `/cities`, cafe filtering/distances/provenance/detail | PASS 1/1 targeted `live-catalog-01` |
| Home screenshots/overflow/axe: 360,390,768,1024,1440,1920 | Не запускалось |
| Keyboard menu/Tab/Escape/focus, labels, reduced motion | Не запускалось |
| QuickSearch/category → map preserves query; denied geolocation | Не запускалось |
| Live geocode «Смоленск ул.Ленина8» → real cafe catalog/provenance/detail | FAIL: geocode503 `PROVIDER_UNAVAILABLE/geocoder/not_configured`, `live-api-01` |
| Live route from provider result to genuine DB destination | BLOCKED до route POST: тот же geocode503, отдельный тест FAIL, `live-api-01` |
| Failure vs empty, no fake map, router/report failure; literal catalog XSS | Подготовлены изолированные tests; не запускались |
| PWA/offline/privacy | Подготовлены production browser tests; не запускались |
| PWA native install/update/multitab | Не проверено; нужен production revision/session, VM09 не заменяет browser QA |
| Lab LCP/CLS | Не измерены; подготовлен observer artifact; INP не заявляется |

Реальная durable запись report требует проверки storage со стороны04/05; UI receipt проверяется отдельно. Ручной visual review CUA остаётся у координатора. Axe не является полной WCAG-приёмкой. Локальное единичное наблюдение performance не заменяет field CWV.

Traceability: `docs/ACCEPTANCE.md` — матрица координатора. Browser cases покрывают соответствующие UI/GIS/PWA/reduced-motion пункты, security smoke относится к SEC-01/05/09/10. Полное закрытие SEC-01..13 требует evidence владельцев04/05/06/07/13/15/17, не заявлено этой suite.

## Реальные API прогоны

Среда17: Nest production Node на `http://127.0.0.1:3001`, реальные PostGIS/Redis. QA не владеет teardown.

```powershell
$env:API_URL = 'http://127.0.0.1:3001'
$env:QA_RUN_ID = 'live-api-01'
npm run test:e2e --workspace=@ryadom/qa -- --project=live-api
# exit1: 2 passed, 2 failed, 0 skipped; 2.4s
$env:QA_RUN_ID = 'live-catalog-01'
npm run test:e2e --workspace=@ryadom/qa -- --project=live-api --grep 'live city catalog'
# exit0: 1 passed; 9.3s
```

Ошибки live-api-01 — не доказанная ошибка приложения: ненастроенный provider06.1. Отсутствующий geocoder не заменялся reference coordinates. Catalog smoke получает центр из настоящего `/cities` и проверяет БД независимо; он не считается address acceptance. Browser/UI не запущены, пока17 сообщил web500 (globals.css03 в разработке). Preflight теперь вызывается per-file beforeAll: API suite требует только API_URL, поэтому недоступный web не мешает независимой HTTP проверке. Исторический global preflight выше изменён после обнаруженного ограничения конфигурации.
