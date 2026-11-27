# Интеграции, источники и блокеры

Актуальная политика доступа: публичный каталог доступен анонимно; публичная регистрация закрыта и не является условием запуска. Доступ владельца бизнеса создаёт или сбрасывает уполномоченный оператор в защищённой CRM с актуальной MFA и аудитом. Релиз должен включать окончательно проверенный серверный provisioning/reset flow; пароль не хранится открытым текстом. Создание доступа не подтверждает от имени владельца согласие с условиями, email, права на бизнес или оплату. Правовые тексты, конфиденциальность и обязанности оператора сохраняются. Публичный signup/API регистрации не включать; наличие контактов VK/TG не разрешает автоматическую рассылку credentials или сообщений.

Актуальный порядок развёртывания — `DEPLOYMENT.md`, итоговые проверки — `RELEASE.md`. Таблица ниже сохраняет первоначальный архитектурный срез; последующие отчёты фиксируют реализованные аккаунты, CMS, локальные GIS и ручную ежемесячную оплату. Онлайн-провайдер оплаты для выбранной модели VK/TG не требуется. Production требует собственные домен/сервер, HTTPS, постоянное хранилище медиа, защищённые ключи, резервные копии и опубликованные правовые тексты. Секреты не включаются в пакет исходников.

Срез задачи 01 на 2026-11-27. Этот реестр описывает контракт и условия подключения, а не доказывает состояние развёрнутых соседними чатами сервисов. Последующую фактическую работоспособность фиксируют владельцы интеграций и coordinator00. Секретов и production-ключей в репозитории нет.

| Система | Состояние в контракте 01 | Требуется / владелец |
|---|---|---|
| PostgreSQL16/PostGIS3.4 | обязательное хранилище; в 01 не создаётся | DB05 миграции, GiST, provenance, runtime role; DevOps15 образ/volume/health/restore |
| Redis/BullMQ | Redis limiter и очереди; BullMQ устанавливается только при использовании | API04 distributed rate limits; import07 очереди; проверить лицензию выбранной Redis версии, persistence, private network |
| S3-compatible | параметры подготовлены, endpoint/keys отсутствуют | DevOps15 российский регион/credentials/private bucket; позднее secure uploads, retention, image licensing |
| OSM каталог | разрешённый кандидат, 01 не импортирует данные | import07 проверяет extract/source timestamp/ODbL/attribution, записывает provenance и журнал; полнота не гарантирована |
| Open data / бизнес | каждый dataset проходит отдельную проверку | документировать URL/лицензию/разрешённые операции/даты/право фото/контактов; заявки этапа2 |
| Векторная карта | MAP_STYLE_URL пуст; GET map/config → status unavailable | GIS06/06.1 собственные Martin/Planetiler или licensed provider, фактическая схема source-layers, styles/glyphs/sprites/CORS/CSP, attribution |
| Nominatim | GEOCODER_PROVIDER=disabled; NOMINATIM_URL пуст | GIS06 собственный instance/extract/coverage/UA + allowlist, /search mapping в GeocodeResult, output validation |
| Pelias | альтернативный geocoder; PELIAS_URL пуст | отдельное infra capacity/источники/лицензии, тот же GeocodeResult; не одновременно разные DTO |
| Valhalla | VALHALLA_URL пуст; POST routes →503 not_configured | GIS06 instance с действительным graph Смоленска, mode walking→pedestrian/driving→auto/cycling→bicycle, /route, polyline6→GeoJSON, km→meters |
| Яндекс/2ГИС | disabled; env false не разрешает включение без лицензии | письменная лицензия на импорт, хранение, отображение и коммерческое использование, approved adapter; scraping обходы запрещены |
| Платформа: статистика/отзывы | только измеренные/разрешённые записи; [] разрешён | API04 реальное хранилище/запросы; никаких fixture отзывов, значков verification или выдуманных counters |
| Reports | схема готова; 202 только после durable storage | API04+DB05 persistence/moderation/rate limits; Redis/DB down →503, не фиктивная квитанция |
| Аккаунты/CMS/business | этап2, endpoints не объявлены | server RBAC, consent, audit, admin MFA, claims verification, privacy deletion |
| Платежи/реклама | этап3, provider не выбран | российский провайдер, реквизиты, sandbox, подписи/idempotency/refunds/чеки/маркировка после юридической проверки |
| Российский hosting/TLS/domain | целевая схема, провайдер не выбран и не оплачен | Node web+API, private DB/Redis/S3, staging/prod, backups+restore drill, monitoring, договор/регион/юридическая проверка |
| Sites Workers | не выбран для полного fullstack | no raw TCP; не заменять Nest/PostGIS/Redis на Workers/D1. В задаче01 local-only, нет deploy |

## Публичные OSM сервисы и лицензии

OSM данные доступны под ODbL с требованиями атрибуции и условиями для производных баз. Права на данные не дают неограниченного доступа к публичным серверам тайлов/geocoder. Первичный источник: [OSM copyright/license](https://www.openstreetmap.org/copyright); перед запуском проверить [атрибуцию OSMF](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines). Сохранять original source ID, source URL, license, attribution, sourceUpdatedAt (nullable лишь если источник не даёт дату), importedAt. Техническая дата импорта не подменяет дату обновления источника.

**Публичный nominatim.openstreetmap.org не настроен и не используется как fallback.** Его [официальная usage policy](https://operations.osmfoundation.org/policies/nominatim/) устанавливает максимум 1 запрос/с суммарно на приложение, identifying User-Agent/Referer и attribution; запрещает autocomplete, systematic POI extraction и generic geocoding через no-code/vibe-coding платформы без осознанного ответственного решения разработчика. Для production проекта предусмотрен собственный instance либо договорной провайдер. Не передавать персональные/конфиденциальные данные публичным OSM сервисам.

Картографический renderer [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) не поставляет лицензию на тайлы, шрифты, sprites и фото. Декоративный map-demo.svg и hero-city.webp не география. [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html) для geography принимает метры и использует доступный spatial index; фактическую производительность проверяет DB/QA на реальных данных. [Valhalla reference](https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/) определяет upstream request/units; адаптер обязан вернуть единый RouteResult.

## Canonical environment и сетевые границы

`.env.example` — единые имена: server-only `API_URL` без /api/v1; Next rewrite `/api/v1/:path*` → `${API_URL}/api/v1/:path*`. Browser получает только same-origin `/api/v1`. `PUBLIC_SITE_URL` — canonical origin, не секрет. `WEB_PORT/API_PORT` читаются приложениями/Compose явно; Next CLI при необходимости получает `-p 3000`, Nest — API_PORT. Root env автоматически не подгружается всеми инструментами: owner app/infra задаёт dotenv/--env-file/Compose env_file, без печати секретов.

Geocoder: `GEOCODER_PROVIDER=disabled|nominatim|pelias`; URL означает base origin/path, adapter добавляет /search либо согласованный Pelias endpoint. `VALHALLA_URL` base для /route. `GIS_ALLOWED_ORIGINS` — exact comma-separated origins; `GIS_ALLOW_HTTP=false`, только explicit private local infra может разрешить HTTP; `GIS_USER_AGENT` identifying project UA, `GIS_TIMEOUT_MS=5000`. `MAP_STYLE_URL/MAP_ATTRIBUTION` определяют разрешённый публичный map configuration. Direct tiles/glyphs остаются в style.json. Приватные provider keys в client style URL не помещать; архитектура ключей обсуждается отдельно.

Пользователь не выбирает upstream URL; server fetch только allowlisted config endpoints с bounded response/timeout, проверкой redirect и выходной схемы. Reject SSRF к metadata/loopback/private сети, кроме заранее назначенных внутренних GIS сервисов (точный origin+DNS/network policy). HttpUrlSchema — лишь синтаксическая проверка безопасного отображения, не сетевой firewall. Не сохранять raw адресные queries, route endpoints, точную геолокацию или движение по умолчанию. Cache-Control no-store, service worker исключает API.

## Открытые вопросы до коммерческого запуска

- Подтверждённый hosting и российский регион хранения, договоры операторов/обработчиков, privacy/consent/retention/deletion и требования применимого законодательства проверяются юристом; в задаче01 юридическое заключение не даётся.
- Подтверждённые права на бренд и оригинальные Assets; локальная лицензированная кириллическая гарнитура (архив не содержит font files); лицензии/разрешения фото и отзывов.
- Реальный адрес acceptance (в MASTER-PROMPT точного адреса нет), verified geocode result и маршрут в зоне покрытия; сетевая/нагрузочная проверка и резервное восстановление.
- Metrics quality, catalog freshness, license register, import schedule, upstream timeout/cancellation, monitoring и инциденты. Пока нет измеренных доказательств, не называть систему production-ready.
