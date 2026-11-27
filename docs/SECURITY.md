# Безопасность «Рядом»: threat model и gate этапа 1

Дата: 2026-11-27 (Europe/Moscow). Владелец документа: задача 13; приёмка и маршрутизация исправлений — координатор 00. Получатели требований: 01/03/04/05/06/07/09/14/15.

Статус: **план контролей, не заключение о безопасности релиза**. F-13-01 **FIXED / targeted verification PASS** на snapshot 2026-11-27; общий gate остаётся открытым. Остальные тесты ниже — задания к приёмке, без общей отметки PASS. Подтверждённые результаты и ограничения находятся в разделе «Наблюдения». Абсолютная безопасность не обещается.

## Границы этапа

Этап 1: публичный поиск без регистрации, карточки организаций, геокодирование, маршрут, карта, разрешённый импорт, PWA; при включении — анонимные сообщения об ошибках. Next.js → NestJS → PostgreSQL/PostGIS; GIS-адаптеры и Redis/очереди по архитектуре. Аккаунты, изменение карточек бизнесом, CMS/админка, отзывы пользователей, платежи и реклама не получают публичные write endpoints до отдельных gates следующих этапов.

Исходные требования: `AGENTS.md`, полный `ryadom-digital-city/docs/MASTER-PROMPT.md`. Прочитаны появившиеся `docs/ARCHITECTURE.md`, `docs/INTEGRATIONS.md`, `docs/DATABASE.md` и `packages/types/src/index.ts` (`CONTRACT_VERSION = '1.0.0'`). Контракты принадлежат 01: данный документ их не меняет. Приняты strictObject, radius 300–10000 м, limit ≤50, page ≤100, route span ≤100 км и архитектурные budgets URL 4 KiB/body 16 KiB/SQL 3 с/provider 5 с/API response 5 MiB. Дополнительные budgets ниже — предложения для закрепления владельцами; финальную реализацию 01/04/14 сверяют с OpenAPI.

Основа требований — [OWASP ASVS 5.0.0](https://asvs.owasp.org/) (официальная страница указывает stable release от 30.05.2025). Это профиль рисков проекта; полного соответствия ASVS L1/L2 или сертификации здесь не заявлено. Gate использует собственные стабильные IDs, а не выдуманные номера ASVS.

## Активы и ущерб

| Актив | Что защищаем | Последствие нарушения |
| --- | --- | --- |
| Координаты, адресные запросы, сообщения об ошибках | Конфиденциальность, минимизация, срок хранения | Выявление мест проживания/маршрутов, публикация личного текста |
| Каталог, источники, часы, контакты, атрибуция | Целостность и происхождение | Подмена телефона/сайта, опасная маршрутизация, нарушение лицензий |
| PostGIS, очередь, GIS и бюджеты провайдеров | Доступность и ограниченная стоимость | Исчерпание CPU/пула соединений/квоты, отказ для обычных посетителей |
| Репозиторий, сборки, зависимости, конфигурация | Целостность поставки и секреты | Выполнение чужого кода, доступ к БД и облачным сервисам |
| Логи, резервные копии, audit trail | Ограниченный доступ, восстановимость | Утечка, невозможность расследовать подмену или восстановить каталог |
| Репутация Patchvale и права на контент | Честная публикация | Фальшивые организации/отзывы/метрики, нелицензионные фото |

## Акторы и доверие

Гость, пользователь с разрешённой геолокацией и бот имеют одинаково недоверенный клиент. Скрытая кнопка, TypeScript и CORS не предоставляют права доступа. Злоумышленник может посылать запросы напрямую, менять query/body/заголовки, приносить вредоносный текст через импорт/жалобы, занимать очередь и пытаться истощить провайдера. Источник OSM/открытых данных и ответ GIS тоже недоверенные данные. Оператор импорта, разработчик, CI и администратор инфраструктуры имеют разные привилегии; их компрометация и случайная ошибка включены в модель.

| Граница | Поток | Обязательная проверка |
| --- | --- | --- |
| Браузер ↔ edge/reverse proxy | HTTPS, API, HTML, статические файлы | Лимиты до parsing, TLS, cache policy, заголовки, доверенные proxy |
| Next.js ↔ NestJS | SSR/BFF или прямой API | Та же серверная валидация; SSR не обходит rate/privacy controls |
| NestJS ↔ PostGIS/Redis | Параметры поиска, очередь жалоб | Least privilege, bounded queries/queues, таймауты, без публичного DB/Redis |
| NestJS ↔ GIS | Адрес/две точки → фиксированный provider endpoint | Точная конфигурация назначения, egress, таймаут, лимит тела, проверка ответа |
| Импортер ↔ источник/БД | Файлы, строки, URL, обновления | Проверка лицензии, provenance, карантин, транзакция, отдельная роль |
| Браузер ↔ tiles/style/images | Сторонний провайдер видит IP/viewport | Разрешённые origins, атрибуция, privacy disclosure, CSP |
| CI/operator ↔ runtime/backup | Артефакт, секрет, restore | Review и lockfile, разделение окружений, redaction, проверенное восстановление |

Точный origin геолокации не должен попадать в URL истории браузера или share link автоматически. Публичная ссылка на выбранное место не равна согласию передать текущее положение.

## План атак и защит

| Угроза | Сценарий | Контроль и доказательство |
| --- | --- | --- |
| Spoofing | Подделанный X-Forwarded-For сбрасывает лимит; client передаёт роль | SEC-07/08, доверие только известному proxy; публичный endpoint не принимает роли |
| Tampering | SQL/unknown fields; отравленный импорт меняет контакт | SEC-01/03/11; строгий DTO и изоляция публикации |
| Repudiation | Невозможно связать импорт с набором, оператором и откатом | SEC-11/13; run ID, hash, источник, решение публикации |
| Information disclosure | Геолокация в access log/SW; error раскрывает DSN | SEC-09/10/12; проверка по синтетическому маркеру |
| Denial of service | Максимальный радиус, много страниц, медленный upstream, длинная polyline | SEC-02/04/07; стоимость ограничивается на всех уровнях |
| Elevation of privilege | Публичный report меняет опубликованную карточку; runtime выполняет миграции | SEC-03/06/11; отдельные привилегии и pending state |

## Gate: обязательные controls и acceptance tests

Все тесты выполняются только на локальном/staging окружении с синтетическими данными и mock upstream. Никаких внешних активных сканов, чужих адресов/персональных данных и нагрузки на production. Для каждого ID задача 14 фиксирует revision, среду, команду, fixture, ожидаемое и наблюдаемое, ссылку на отчёт. `NOT RUN` и `BLOCKED` не равны PASS. Unit/mock тест не доказывает работу PostGIS, proxy или браузера.

### SEC-01 — вход и ошибки (01/04; unit + HTTP integration)

- Сервер применяет Zod `.strict()`/`z.strictObject()` ко всем object DTO, включая вложенные; query/params/body проверяются до БД/провайдера. Неизвестные ключи отклоняются, а не silently stripped. Не переносить body/query в ORM через spread. HTTP parser не объединяет дублирующиеся ключи незаметно.
- Проверить unknown `role`, `providerUrl`, `origin.extra`, `__proto__`; repeated `lat=1&lat=2`, массив вместо scalar, malformed JSON, null, NaN/Infinity (и их строковые варианты), пустую строку, `openNow=false`, `openNow=0`, строку с NUL/CRLF, слишком длинный ввод. Ожидание: невалидное → 400, нет вызова БД/GIS; `false` остаётся false. Не интерпретировать `Number('')` как координату 0.
- Невалидные enum/UUID/slug/path traversal и неизвестный city → согласованный 4xx. Ошибка без stack, SQL, upstream body, URL, ключей, точных координат и повторения вредоносного значения; requestId создаётся/валидируется сервером. Не возвращать текст Zod с исходным body без redaction.

### SEC-02 — стоимость GIS/DB (01/04/05/06; real PostGIS integration)

- Следовать contract v1: lon [-180,180], lat [-90,90], все числа конечны; radius integer 300–10000 м; limit integer 1–50; page 1–100; q ≤200 символов; route только walking/driving/cycling, две точки, расстояние между ними ≤100 км. Проверить ровно границы и ±1, дробные page/radius, 51/101, обратный bbox, мировой bbox. Координаты с корректным диапазоном дополнительно проверяются на доступный город/coverage согласно 01/06; отсутствие покрытия не запускает бесконечный поиск.
- Runtime budgets по архитектуре: search DB `statement_timeout` ≤3 с, provider total timeout ≤5 с. Pool по появившемуся DB package: acquisition ≤3 с, API ≤10 соединений на экземпляр (суммарно ниже max_connections с резервом). Count/pagination под тем же бюджетом. Не рассчитывать неограниченный total перед LIMIT.
- `geography(Point,4326)`, GiST, `ST_DWithin` до сортировки/ограничения; параметры метры, порядок lon/lat доказать fixture. `EXPLAIN (ANALYZE, BUFFERS)` на репрезентативном каталоге при max radius: оценить план/стоимость, не требовать index scan на крошечном seed. Зафиксировать размер набора и фактическое время, без обещания SLO по пустой БД.
- Тест таймаута БД/исчерпанного pool: ограниченная ошибка, клиентская отмена освобождает работу либо DB timeout обрывает её; последующий нормальный запрос проходит. Максимальные route geometry/maneuvers ограничены контрактом (сейчас 20000/2000), decoded polyline и response bytes ограничены до накопления чрезмерной памяти.

### SEC-03 — SQL injection и полномочия БД (04/05/07; integration)

Разделять SQL и значения, bind parameters для строк, координат, radius, LIMIT/OFFSET. Динамические identifier/sort — только фиксированный allowlist; не raw SQL interpolation. Основа: [OWASP SQL Injection Prevention](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html).

Тесты: q `x' OR 1=1--`, `%`, `_`, `'; SELECT pg_sleep(2)--`, та же строка в сохранённом импорте. Результат соответствует буквальному поиску/документированной wildcard-политике, не меняет запрос, не задерживается из-за injected sleep, каталог цел. Отдельно code review всех raw SQL и SQL из импортера. Runtime role не superuser/owner, без CREATE/ALTER/DROP/FILE/role management; API не получает migration DSN. Попытка DDL runtime role в тестовой схеме отклоняется, нормальный поиск работает. Импортер пишет только назначенные сущности, а не grants/roles.

### SEC-04 — SSRF и недоверенный GIS (04/06/15; mock transport + egress staging)

Base URL и точные origins задаёт deployment, HTTP input не выбирает URL/host/port/path. Фиксированные endpoint paths, URL builder; запрет userinfo, неожиданных schemes, fragments, redirects; TLS validation не отключается. Для внешних origins проверять A/AAAA и соединение, исключать private/loopback/link-local/metadata/IPv4-mapped IPv6 и DNS rebinding; egress firewall блокирует остальную сеть. Явно разрешённый self-hosted GIS внутри сети — исключение по конкретному service:port, не разрешение на всю private subnet. Основа: [OWASP SSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).

В unit mocks проверить: request `providerUrl` отклонён; config без allowlist, `user:pass@host`, `file:`, `https://allowed.invalid@127.0.0.1`, разрешённый suffix-поддомен, protocol-relative URL, redirect на `169.254.169.254`, `[::1]`, mapped IPv6, DNS public→private. Запрещённый target не получает сетевого вызова. Metadata/IP probes — только mock, не реальная инфраструктура. Подмена DNS тестируется через управляемый локальный resolver/transport, не изменением production DNS.

Response: проверять JSON MIME, schema, finite coordinates, индексы манёвров, coverage, attribution. Предложение: максимум 1 MiB по фактически прочитанному decoded body даже без Content-Length; timeout покрывает чтение body, client abort отменяет fetch, retry отсутствует либо bounded и без amplification. Mock endless/chunked body, oversized/lying Content-Length, compressed oversized body, invalid UTF-8/JSON, HTTP error, 30x, зависший body, неверная geometry → ограниченная unavailable/error, без fabricated route и без сырого upstream в ответе/логах. Провайдер без ключей/лицензии выключен.

### SEC-05 — XSS, SVG и URL (03/06/07; browser + ingestion tests)

Названия, описания, адреса, часы, provenance, жалобы и манёвры отображаются текстом; MapLibre popup через безопасные DOM/textContent, не `setHTML` с данными. JSON-LD сериализуется с безопасным escaping `<`/закрытия script; CSP не заменяет encoding. HTML от пользователей в этапе 1 не требуется. Основа: [OWASP XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

Fixtures: `<img src=x onerror=...>`, `</script><script>...</script>`, кавычки и bidi/control chars в карточке/атрибуции/маршруте/SSR metadata. Ожидание: текст, нет выполнения, DOM event handler, неожиданной навигации или запроса к test collector. Это проверяется в браузере, а не только snapshot HTML.

Website ссылки: parse URL, только HTTP(S), без credentials/control chars; `javascript:`, `data:`, `vbscript:`, `//evil.invalid` не становятся action. `tel:` строить из проверенного phone, target blank — `rel=noopener noreferrer`. Images/avatar/style/tiles/glyphs/sprites имеют отдельные approved origins и HTTPS; общий HttpUrlSchema сам по себе не разрешает серверный fetch. Next image optimizer/remotePatterns не становится произвольным proxy. Внешние изображения не грузить автоматически до решения по источнику/приватности.

Локальные SVG из поставки проверять на script/on* /foreignObject/external href/CSS URL/DTD/entity, затем публиковать как ревьюируемые assets. Не inline чужой SVG из API/импорта. Upload SVG/HTML этапа 1 выключен. Проверить malicious SVG в импортном photo URL и в upload запросе — rejected/quarantined, не same-origin активный документ. Для будущих uploads: отдельный origin, MIME+magic, декодирование/перекодирование raster, лимит bytes/pixels, EXIF stripping, quarantine и права доступа; архивы — bounded extraction без traversal/symlink.

### SEC-06 — reports, CSRF и poisoning (04/07/14)

Пока reports provider unavailable — POST возвращает явный unavailable и ничего не пишет. Включённый report принимает только strict JSON, валидный существующий public placeId, reason enum, description 10–2000 и consent=true по текущему контракту. Receipt только pending, никогда автоматическое исправление карточки. Жалобы не публичны; нет public list/read-by-ID и нет возможности менять произвольные поля каталога.

Анонимный report не имеет классических session privileges, но остаётся целью cross-site spam. Текущий профиль этапа 1 без cookies: требовать точный разрешённый Origin; missing/null/foreign Origin отклонять, cross-site Fetch Metadata отклонять, принимать только application/json. Preflight для чужого origin не разрешён; form-urlencoded/multipart/text/plain →415; GET не меняет состояние. Дополнительный custom header был предложением: в текущий контракт 01 он не входит и для этой комбинации exact Origin + strict JSON + no cookies не является отдельным release blocker. При изменении auth/transport профиль пересматривается. Origin не аутентификация и подделывается ботом — нужны SEC-07 и модерация. Основа выбора: [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Тест из второго test origin: form POST, fetch simple request, hostile/null Origin, cookies без CSRF (когда auth появится) не создают report. Same-origin JSON с допустимым Origin → один pending report; повторение ограничивается; неизвестный/закрытый placeId не меняет данные. С добавлением cookie auth — server-validated synchronizer token или signed double-submit, session binding, rotation; SameSite/CORS не заменяют CSRF token. Webhook отдельный signed server channel, не исключение для произвольного браузерного write.

### SEC-07 — body/rate/abuse limits (04/15; bounded local integration)

Предлагаемый стартовый бюджет для этапа 1, который 04/15 должны закрепить в конфигурации и 14 — тестах:

| Ресурс | Лимит | При превышении |
| --- | --- | --- |
| HTTP request target / JSON body / headers | 4 KiB / 16 KiB / 16 KiB; enforced до JSON parse | Для oversized URL текущий API contract использует 413; edge может дать 414/431 для URL/headers с документированным форматом |
| Search / geocode / route на доверенный client IP | reads 60/мин, geocode 10/мин и routes 10/мин, отдельные buckets по текущей архитектуре 01/API | 429 + Retry-After, без обращения к дорогому backend |
| Report | 5/час и 20/сутки на IP; повторный place+reason+normalized text за 10 мин дедуплицировать | 429 или существующий receipt без второй публикации |
| Provider in-flight на API instance | geocode ≤4, route ≤2; очередь ожидания ≤10 | bounded unavailable/429/503, без unbounded backlog |
| Общий upstream budget | конфиг ниже договорной квоты, сумма по всем replicas | admission control/circuit breaker, не квота на один process |

Учитывать shared NAT и IPv6 abuse; параметры могут корректироваться по измерениям с записью решения, не отключением лимитов. Trust proxy только для фиксированного reverse proxy; внешние X-Forwarded-For/Forwarded не меняют client identity. Shared limiter для нескольких replicas; отказ Redis не открывает дорогие операции без лимита (bounded local fallback либо отказ). Honeypot/CAPTCHA — дополнение при подтверждённом abuse, не основание отправлять геолокацию третьей стороне.

Тесты малыми конфигурируемыми значениями (например 2 запроса/окно): третий →429, соседний bucket работает, после окна восстановление; spoofed XFF не сбрасывает счётчик; два API replicas разделяют budget; Redis down, slow body, client disconnect и queue full не дают неограниченную работу. Проверить path variants: trailing slash, case, percent encoding и двойной slash либо отклоняются, либо получают те же endpoint-specific controls; особенно reports не переходит в read bucket. Проверить compressed request: либо запрет, либо decoded limit. Не проводить нагрузку по дефолтным production квотам.

### SEC-08 — HTTPS, headers, CORS/cookies (03/04/15; deployed staging)

- Только HTTPS с HTTP redirect. HSTS после проверки TLS и всех затронутых hosts: предложено max-age=31536000; includeSubDomains/preload только после инвентаризации, не автоматически. DB/Redis только внутренняя сеть; loopback публикация в local Compose не равна production isolation.
- CORS: preferably same-origin; при отдельном API exact approved frontend origins, без reflection/`*`, без wildcard subdomains; Vary: Origin где зависит ответ. В этапе 1 credentials не нужны. Тест чужого/null origin, OPTIONS, localhost в production, trusted origin, ошибок 4xx/5xx. Прямые non-browser запросы всё равно проходят серверные controls.
- CSP production enforcing: `default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`; script-src nonce/hash для Next без unsafe-eval/unsafe-inline. connect/img/font/style/worker sources минимальны для фактической Next/MapLibre версии и approved providers. Blob worker/inline style допускаются адресно только после проверки необходимости; предпочтителен CSP-compatible worker. Не копировать dev CSP в production. Проверить SSR/hydration/tiles/route/PWA и тестовый injected script; Report-Only не закрывает gate. Основа: [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` (особенно карты с запросами), `Permissions-Policy: geolocation=(self), camera=(), microphone=()`. Правильный MIME; framing запрещён. Заголовки проверять и на ошибках/redirect/SSR, а не только API 200. CSP reports также могут содержать URL/данные — redaction и лимиты.
- Пока auth нет, не заводить session cookies без необходимости. Позднее opaque session cookie `__Host-…`, Secure/HttpOnly, Path=/, без Domain, SameSite=Lax/Strict по реальному flow; никакого session token в localStorage/URL. Cookie policy проверяется браузером под HTTPS, не одним unit тестом.

### SEC-09 — геолокация, PWA и cache (03/09/15; browser + edge)

Точное положение запрашивается по действию пользователя с понятным объяснением; отказ/timeout оставляет ручной ввод работоспособным. Не включать watchPosition/background tracking по умолчанию. Текущая точка/маршрут живут в памяти на время задачи; не добавлять их автоматически в persistent store, analytics, crash dumps, share link, query history. Поставщик tiles всё равно может видеть viewport/IP — перечислить реально используемых получателей в privacy inventory.

API, геокодирование, route POST, reports, private pages — `Cache-Control: no-store` и bypass CDN/server data cache/Next fetch cache. Service Worker — allowlist статических versioned assets + offline shell, без API/geo/private/dynamic navigations, без Background Sync report/route payload. Не сохранять маршрут в offline fallback. Offline UI честно сообщает недоступность; старое пользовательское содержимое не показывается другому посетителю.

Тест синтетическими точками: поиск/маршрут/отказ разрешения → close/reload/offline → инспекция Cache Storage, IndexedDB, local/sessionStorage, history/share, service worker и network cache; там нет координат/ответов/жалоб. Проверить также Next SSR/RSC responses, CDN и браузерный back/forward cache поведением страницы. SW update удаляет старые запрещённые caches; чувствительное состояние очищается при смене/завершении сессии в будущем. Публичные static map tiles можно кэшировать лишь после отдельной оценки лицензии/приватности; этот gate такого исключения не включает.

### SEC-10 — логи, retention и инцидент (04/09/15)

Inventory всех слоёв: browser telemetry, reverse proxy, Nest/Next, provider, SQL, Redis, APM, object store, backup. Не писать точные координаты/адресные q, route body, report text, Cookie/Authorization/DSN/provider key в обычные логи; masking после передачи в APM недостаточен. SQL statement/bind logging и access querystring отключить/redact. У IP/rate-limit identifiers есть privacy implications; hash IP не объявлять анонимизацией.

Предложение retention на согласование с юристом/оператором: rate buckets истекают по окну (daily report bucket ≤24 ч), обезличенные operational/security events ≤30 дней, pending reports ≤90 дней с закрытием/удалением; точные geo не сохраняются. Это engineering defaults, не сроки закона. Для legal hold/обязательных данных отдельное решение. Контакт ответственного, триаж, отключение provider/import, ротация секрета, сохранение минимальных доказательств и legal notification workflow должны быть назначены до публичного запуска.

Проверка: уникальные синтетические canary значения в q/body/header → success/error/timeout → поиск маркера во всех контролируемых логах, traces, queues и backups. Текст не найден вне явно разрешённого report storage; access/TTL/delete работает. Error response не выдаёт canary. Crash path проверяется отдельно. Провайдерские логи и сроки фиксируются договором/настройкой, не предположением.

### SEC-11 — импорт и данные (05/07/14)

Источник допускается оператором до запуска; provenance на набор и запись: source ID/record ID, URL, license/status, attribution, source timestamp (unknown честно null), fetched/imported time, hash/run ID. Яндекс/2ГИС adapters disabled без прав на конкретные операции. OSM не даёт прав на чужие фото/отзывы; демонстрационные записи не попадают в production.

Данные проходят schema validation/URL checks/координаты/города, bounded batch и source size, дедупликацию и карантин; внешние ссылки из записей не fetch автоматически. Публикация и изменение чувствительных контактов — контролируемое решение, жалоба не становится источником истины. Не выдавать разрешённость обработки personal contacts за наличие открытого URL.

Тест: dataset без лицензии/attribution, вымышленный timestamp, malicious link/markup, out-of-city point, duplicate sourceRecordId, oversized record/archive и массовая смена телефонов → reject/quarantine с безопасным отчётом; частичный сбой не публикует половину batch, повторный job идемпотентен; rollback по run ID возвращает прежние поля. У опубликованной карточки и карты видны source/update/attribution. Применимость ODbL к объединённой базе решается отдельно в `LEGAL-QUESTIONS.md`.

### SEC-12 — supply chain и secrets (01/04/15)

Lockfile, pinned toolchain и воспроизводимый install в CI; dependency audit после установки, SBOM/список runtime packages+container digests, SAST/secret scan исходников и build artifacts. Review install scripts/новых зависимостей, CI permissions минимальны, untrusted PR не получает secrets/deploy права. Образы проверяются отдельно от npm. Уязвимость оценивается по advisory, версии и достижимости; число audit findings не подменяет triage.

Секреты только server runtime, отдельные для dev/staging/prod; `.env.example` без значений, `.env.local` игнорируется. Проверить frontend bundle/source maps, Docker layers/build args, CI output/artifacts, git tracked files. Secrets redacted; при находке отозвать/заменить, затем убрать из поставки. Основа: [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html).

Задача 14/15 запускает реальный lockfile-aware audit (`npm audit --json` для npm workspace), secret/SAST scan после готовности dependencies, сохраняет exit status и triage без секретных значений. В задаче 13 `npm install` не выполняется; `npx` с автоматическим download не используется. Неразобранные reachable Critical/High и известная утечка секрета блокируют release. Принятие иных рисков документируется координатором с owner/expiry/mitigation.

### SEC-13 — backup, restore и операционный доступ (05/15)

Назначить RPO/RTO, частоту и retention с оператором (стартовое предложение каталога: RPO ≤24 ч, RTO ≤4 ч). Шифровать backup и канал, ограничить роли/ключи отдельно от runtime; проверить места хранения по legal inventory. Не включать ненужные geo/log dumps. Запрет публичных buckets и портов БД/Redis/metrics/queue admin; health не раскрывает конфигурацию. У migration и restore отдельные privileges.

Перед production восстановить последний backup в изолированную чистую БД, проверить PostGIS extension/индексы, counts/выборочные provenance/hashes, поиск и rollback импорта; измерить время и указать фактическую потерю данных. Проверить доступ runtime к backup запрещён и удаление по retention. Volume snapshot/успешный `pg_dump` без restore не закрывает gate. Поддерживаемая версия PostgreSQL/PostGIS/Redis/Node и актуальные security patches проверяются по официальным advisories; compatibility pin сам по себе не security approval.

## Следующие этапы: отдельные gates до включения функций

| Область | Обязательный контроль | Минимальный негативный тест |
| --- | --- | --- |
| Auth/session | Argon2id с измеренными параметрами; TLS; generic auth errors; bounded attempts; одноразовые expiring reset tokens, hash at rest; session rotation/revocation; CSRF | Перебор rate-limited, reset replay/expired отклонён; old session после logout/password reset не работает; fixation исключена |
| MFA/admin | MFA обязательно всем административным ролям; WebAuthn/TOTP по выбранной схеме, recovery отдельно, step-up для grants/экспорта/платежей | Пароль без MFA не даёт админ API; отключение MFA/role grant требует свежей проверки и audit; recovery не обходит контроль |
| RBAC/BOLA/IDOR | deny-by-default на сервере, permission+object ownership, field allowlist, tenant isolation, ограничения bulk/export | User/Owner A меняет ID на B в path/body/nested/bulk →403/404 без read/write; Moderator не выдаёт себе Super Admin |
| Ownership бизнеса | Проверка полномочий через независимое доказательство; заявка pending, срок, reviewer, dispute/revoke/audit | Заявитель меняет телефон карточки и пытается подтвердить на него — прав не получает; stale/replayed proof не работает; чужой филиал нельзя присвоить |
| CMS/отзывы/uploads | Moderation states, safe output, quarantine, metadata/размер/содержимое; audit версии и отката | Stored XSS в preview/admin/письме не выполняется; непубликованный материал недоступен гостю; файл по чужому ID недоступен |
| Payments | Hosted licensed provider, карточные реквизиты не проходят через приложение; raw-body signature, timestamp/replay checks, server-side amount/currency/order state; transactional idempotency; refund permissions | Поддельный/повторный/out-of-order webhook, подмена суммы/валюты, параллельные callbacks не дают двойную активацию/возврат; success redirect не подтверждает оплату |
| Ads/analytics | Юридическая квалификация/маркировка и согласованные данные; paid placement отдельно от distance ranking; consent/retention | Без обязательных атрибутов реклама не публикуется; отказ от необязательной аналитики не блокирует поиск |

До появления этих функций строка имеет статус «не реализовано / gate перед включением», а не дефект публичного поиска. Будущая auth не отменяет rate/GIS/CSRF/privacy требования этапа 1.

## Наблюдения и подтверждённость

Первичный read-only snapshot 2026-11-27: git HEAD не содержит проектного кода, новые файлы untracked и ещё меняются другими чатами. Просмотрены полностью доступные на тот момент четыре `packages/gis/src/{http,validation,polyline,errors}.ts`, UI components (`badge`, `brand`, `button`, `category-tile`, `field`, `icon`, `index`, `notices`), package metadata и `packages/types/src/index.ts`. Проверены patterns активного HTML/URL в доступных UI/SVG. Это не полный diff завершённого продукта.

Первичный GIS/UI snapshot не дал подтверждённых security findings. Наблюдаемые защитные меры: exact origin allowlist и redirect:error в GIS helper; bounded body reading и cancellation; диапазоны polyline; strict DTO в types; текстовый React rendering в UI. Проверка DNS/egress, CSP и PWA требует integration tests. Не выдавать deployment-config-only URL за пользовательскую SSRF без доказанного call path.

После первичного snapshot появились API/DB/importer и зависимости. Дополнительно прочитаны `apps/api/src/*.ts`, DB pool/catalog/imports/privileges и migration 001, importer normalize/fetch-initial, все GIS исходники и тесты. Это ограниченный review незавершённых пакетов, не всего checkout. Найден **F-13-01**, ниже. Исходники других владельцев не менялись.

Фактические проверки: `node node_modules/vitest/vitest.mjs run packages/gis/src packages/types/src` — **3 файла / 93 теста PASS**; `python packages/ui/scripts/audit-assets.py` — PASS, 72 byte-identical assets/63 SVG и проверка fonts/tokens/manifest; `python packages/ui/scripts/generate-icons.py --check` — PASS 29 icons. `npm audit --json` — exit 0, total findings 0, metadata total dependencies 76; SHA256 lockfile `A62EEB53203D81E6CCD5C99CDE5F3E6B7C19250ECE41042C031CB07C7446151D`. Audit покрывает только этот lockfile snapshot, а не все появляющиеся manifest/контейнеры. Полный build/SAST/DAST/PostGIS/HTTPS/browser/PWA задачей 13 не выполнялся. Полный SEC gate не пройден.

### F-13-01 — FIXED: первоначальный P1 обхода report guards

Текущий статус: **FIXED, независимо перепроверено 2026-11-27**. Ниже сохранён исходный сценарий; он относится к старому hash, не к текущему коду.

Исходное место: `apps/api/src/app.ts:44`, `:53–54`; SHA256 файла на первом воспроизведении `8A6A21D370F38201FD36B56F5031DA7354239F55E45F8CBF4783F3737287E77D`. Middleware сравнивал `req.path` с точной lowercase строкой без завершающего slash, тогда как Nest/Express принимал варианты. Это позволяло анонимному клиенту обойти обязательность Origin и попасть в read limiter вместо report limiter. По исходнику `RedisRateLimiter` read fallback разрешён при недоступном Redis, report должен fail closed — неверная классификация обходила этот intended gate. В первом проходе отдельный runtime тест реального limiter не завершился.

Воспроизведено локально через настоящее `createApp`, Supertest, in-memory TS transpilation, mock limiter с записью group и mock report repository; сеть только loopback, БД и реальные записи не использованы. Одинаковый валидный синтетический JSON report, **Origin отсутствует**:

| POST target | Наблюдаемый HTTP | Наблюдаемый bucket / repository |
| --- | --- | --- |
| `/api/v1/reports` | 400 VALIDATION_ERROR | limiter/repository не вызваны |
| `/api/v1/reports/` | 202 pending | `read`, report repository вызван |
| `/API/V1/REPORTS` | 202 pending | `read`, report repository вызван |

Ожидание: каждый реально маршрутизируемый reports POST получает одинаковый Origin guard и report limiter, либо вариант отвергается до controller. Исправление 04 через 00: bind guards к handler metadata либо единая безопасная canonicalization/reject policy до middleware; не ограничиваться одним trailing slash fix, оставив case bypass. QA14 повторяет матрицу Origin present/absent × normal/slash/case × Redis up/down и asserts **нет repository write** при отказе. Повторная попытка с реальным limiter прервалась до запуска app с `ERR_MODULE_NOT_FOUND: rxjs/operators` в меняющемся dependency tree; это не отдельная security finding и не успешный тест Redis.

#### Независимая targeted перепроверка исправления

04 заменил path-string classification на global guard по `context.getHandler()` и `context.getClass()`. Report handler получает Origin/Fetch Metadata guard и `report` bucket для всех реально совпавших paths; geocode/route классифицируются отдельно. Проверены исходники app/config/controller/rate-limit и server-only provider setup; новая подтверждённая finding в этих границах не выявлена. `node` imports Nest/rxjs/operators/Supertest теперь PASS — прежний dependency blocker снят для этого snapshot.

Запущены **имеющиеся compiled `apps/api/dist/*.js`** без запуска main.js/порта 3001, с новым изолированным `createApp` и mock repository. Реальные жалобы/каталог не читались и не менялись. Все test network requests — Supertest loopback; Redis failure fixture — закрытый ephemeral loopback port, не рабочий Redis. 46 HTTP requests / **153 assertions PASS**, exit0:

| Проверка | Наблюдаемый результат |
| --- | --- |
| `/api/v1/reports`, `/api/v1/reports/`, `/API/V1/REPORTS`, `/ApI/v1/RePoRtS/` × absent/null/foreign Origin либо allowed Origin + `Sec-Fetch-Site: cross-site` | Все 400; limiter/repository не вызваны |
| Те же 4 paths × allowed Origin + same-origin metadata, spy limiter | Все 202 pending, каждый bucket `report`; 4 receipts только в памяти mock repository |
| `%72eports`, `repor%74s`, `%52EPORTS`, double slash в prefix/segment/start/end, encoded final `%2f` × absent/allowed Origin (8 paths) | Все 404, guard bucket/repository не вызваны |
| Те же 4 matched paths × allowed Origin, **actual RedisRateLimiter**, Redis не настроен | Все 503 reports/not_configured; каждый bucket `report`; repository calls 0 |
| Те же 4 matched paths × allowed Origin, **actual RedisRateLimiter**, Redis настроен на закрытый local test port после connect failure | Все 503 reports/upstream_error; каждый bucket `report`; repository calls 0 |
| Actual local route limiter, limit=1; normal path затем mixedcase+slash | 503 invalid mock response, затем 429; оба bucket `route` |

Команда `node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts`: exit0, **49 PASS / 1 SKIP**; skipped `database.integration.test.ts` требует `API_DATABASE_TEST=1` и не запускался. Config/provider probe (`node -`, synthetic env only): **20 assertions PASS**, canonical env precedence, strict origins, dangerous proxy settings, disabled provider selection, map origin checks, unallowlisted provider → invalid_configuration с 0 external fetches. Это не проверка egress/DNS firewall или реального Redis-up/межрепличного распределения. Отдельное чтение config не означает secret scan всей поставки; env credentials не читались/не выводились.

Snapshot hashes до/после совпали; полная таблица в handoff13. Source app.ts `B2A3B897D4E55156C37681E7DB315E8A2F7D961FE384B502862C686DAD878C4C`, compiled app.js `681A9BA5B7CD8DF26E4B366157089EA7F1915F7CCCD0AA1134895B8D182AB472`. Новый build/install задачей 13 не выполнялся. RB-00 закрыт только для проверенного snapshot; RB-01–06 не принимаются автоматически по этой регрессии.

## Релизные блокеры и передача

| Блокер | Что закрывает | Получатель |
| --- | --- | --- |
| RB-00: CLOSED — F-13-01 исправлен и targeted regression PASS | Независимые проверки matched/encoded/double-slash paths, actual limiter buckets и Redis fail-closed; hashes выше | 13 → 00/04/14 |
| RB-01: нет доказанного HTTP/DB/GIS enforcement | SEC-01–04/07 на реализованном API и real PostGIS; финальное согласование 01 | 04/05/06/14 |
| RB-02: нет browser/edge privacy доказательств | SEC-05/08/09/10 на staging HTTPS и SW | 03/09/14/15 |
| RB-03: не подтверждены источники/лицензии/публикация | SEC-11 и ответы legal по реально включённым источникам | 07/00 |
| RB-04: нет результатов supply-chain/secrets/patch triage | SEC-12 + контейнеры и серверный runtime | 01/14/15 |
| RB-05: нет проверенного восстановления и operational owners | SEC-13 + incident/retention/access inventory | 05/15/00 |
| RB-06: нет юридического решения для production data flow | Закрытые launch-вопросы из LEGAL-QUESTIONS; отключённые будущие функции остаются disabled | 00 + юрист |

RB-00 закрыт в рамках targeted проверки. RB-01–06 остаются открытыми в этом отчёте до отдельной приёмки их доказательств; результаты соседних задач координатор может принять отдельно. При release каждый применимый SEC-ID должен иметь PASS и артефакт; N/A допускается только для действительно выключенной функции с проверкой её недоступности. Общий успешный build и закрытие одной finding сами по себе gate не закрывают.
