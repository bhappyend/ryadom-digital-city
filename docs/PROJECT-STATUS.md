# Рядом — реестр разработки

**Новое правило заказчика:** разработка объединена в главном чате; прежнее «одна задача — один чат» отменено. Новые project chats не создаются. Исторические исполнители на момент проверки не активны; основной чат принимает их файлы и незавершённые результаты, при необходимости использует ограниченных субагентов без дублирования проверок. Исторический реестр ниже сохраняется как журнал, а не требование запуска всех чатов.

Координатор: `00 | Рядом — Координатор проекта` (`01a21a20-bc57-7782-a055-f456a098632d`).
Дата начала: 2026-11-27, Europe/Moscow. Один проект, общий репозиторий, отдельный чат на направление. Статусы означают наблюдаемые результаты, а не обещание фоновой работы.

## Исходные материалы

- Архив `C:/Users/tihoyo/Downloads/ryadom-digital-city-assets-v2.zip` распакован в `ryadom-digital-city/`; оригиналы не меняются.
- SHA256 отдельного prompt и `docs/MASTER-PROMPT.md` в архиве совпадают: `B3E9876461825DE0676D2640342BEBB980166B42758AEBB14584EA55CC39E4D8`.
- Прочитаны полный MASTER-PROMPT, README, CSS/JSON токены и пример manifest. Главный координатор визуально изучил `digital-city-mockup.png`.
- Фото заведений, отзывы, статистика, реальные организации, шрифты и действующие GIS-сервисы в архиве отсутствуют. Данные макета — демонстрационные.
- Доступные runtime: Node 22.22.2, npm 10.9.7, Docker CLI 29.9.2, Git, ripgrep. Первичная проверка Docker: daemon pipe отсутствует; диагностирует задача 15.

## Организация и Skills/MCP

- Применяются Sites и его portable preview/design guidance; стек Next/Nest/PostGIS задан спецификацией и сохраняется.
- Для поиска профильных подключений прочитан Plugin Management, выполнен поиск GIS/geocoding/cybersecurity/browser testing. Подключённого профильного GIS/security MCP результат не выявил. Для основных проверок используются код, тесты, официальная документация и доступная браузерная автоматизация.
- Computer Use прочитан для дальнейшей браузерной проверки. Никакой Skill не объявляется использованным до фактического применения его workflow.
- Специализированных Skills Full-Stack/GIS/cybersecurity/anti-AI-slop в установленном каталоге нет. Применяются явные проверки из AGENTS.md и продуктового задания.
- Все рабочие чаты создаются инструментом `create_thread` в локальном проекте `e48f0207-686e-4181-bbaf-663da6871db9`. Новые worktrees не создаются: параллельная работа ограничена непересекающимися путями в общем checkout.
- По прямому указанию заказчика всем 17 существующим чатам проекта (включая00) передана настройка `thinking: medium` через поддерживаемый инструмент. Модели не менялись. Новые чаты также создаются на среднем уровне; уже выполнявшийся ход может закончиться с прежним уровнем.

## Реестр

Текущая новая задача11: `11 | Бизнес — проверка владельца и активация анкеты`, thread`01a21a91-43e7-7993-bc7b-b85d23d94cea`, medium. Пути: isolated components/lib admin/business-verification и docs; существующие API/db/contracts/panel остаются у04.1/05.1/01.1/10. Задача закрывает недостающий ручной переход independent ownership review→eligible paid listing publication→достоверный funded period, не создаёт фиктивные права/оплаты. Пока в работе.

Lookup100 DB/API реализованы и проверены владельцами: actualPostGIS13/13, finance HTTPselected1PASS(+3 intentionalfiltered), typecheck/build/compiled smoke PASS. UI10 реализует city/region/geocode/approvedphoto и browsable quote/agreement/receipt формы. Новый браузерный функционал100 ещё не принят; существующий98snapshot сMFA/CRM/businessCRUD/CMS/demos/6widths сохранён как проверенная база.

| ID | Чат / thread ID | Область и разрешённые изменения | Зависимости | Статус |
|---|---|---|---|---|
| 00 | Координатор / `01a21a20-bc57-7782-a055-f456a098632d` | AGENTS.md, реестр, координация и приёмка | все | выполняется |
| 01 | Архитектура / `01a21a23-17ec-7fd2-8842-e8cac50ae64d` | root workspace/config, packages/types, packages/config, архитектура/OpenAPI/интеграции | исходная спецификация | запущен |
| 01.1 | Архитектура — аккаунты и управление / `01a21a30-920f-76c3-bc89-89c757e7cc2c` | packages/accounts-types, расширение контрактов этапа 2 | архитектура 1.0, security gate | запущен; не заменяет приёмку этапа 1 |
| 02 | UI/UX и дизайн-система / `01a21a23-1cd5-7de2-becf-63c9b74af357` | packages/ui, public/assets, дизайн и аудит Assets | исходный референс/токены | самостоятельная часть готова; SSR/browser приёмка в 17/14 |
| 03 | Frontend / `01a21a26-e3ce-76f2-9e68-beb4708cf90d` | apps/web кроме public/assets и PWA-файлов | 01, 02, API | запущен |
| 04 | Backend / `01a21a27-33be-7a53-8caf-75e594dc474b` | apps/api | 01, 05, 06 | запущен |
| 05 | База данных / `01a21a26-de63-7470-b298-ed9476c687ef` | packages/db, SQL migrations | 01 | запущен |
| 06 | GIS и маршрутизация / `01a21a23-ca42-7a93-b848-d945b39777ef` | packages/gis, GIS.md | 01, GIS-инфраструктура | пакет готов: 62 tests/typecheck/build; live-приёмка в 06.1/14 |
| 06.1 | GIS — локальная инфраструктура Смоленска / `01a21a29-1de7-7333-a5c0-b95c38d93fe3` | compose.gis.yaml, infra/gis, GIS-LOCAL.md | Docker, региональный OSM extract, 06 | запущен |
| 07 | Импорт организаций / `01a21a28-58cc-7f42-9871-c9bc138831a0` | packages/importer, data/osm, provenance/ETL | 05, источники | запущен |
| 08 | Motion Design / `01a21a2c-d82b-7963-97dd-096da1d83dd1` | src/components/motion, progressive enhancement | 03 | запущен |
| 09 | PWA / `01a21a27-e6f4-76e0-a9ae-129ab76c2b9b` | manifest/SW/offline/install components | 03 | запущен |
| 10 | Админ-панель | этап 2 | auth, RBAC, API | запланирован |
| 11 | Кабинет бизнеса | этап 2 | auth, owner claims, API | запланирован |
| 12 | Монетизация | этап 3 | business, provider/requisites | запланирован |
| 13 | Кибербезопасность / `01a21a24-e713-7342-a167-be3b62001563` | threat model, аудит, исправления через владельцев | 01, реализованный код | запущен |
| 14 | QA и тестирование / `01a21a29-ba72-7142-960b-61aa91843a0c` | packages/qa, Playwright, QA-REPORT | рабочий вертикальный срез | запущен |
| 15 | DevOps / `01a21a23-c292-70d1-a6ce-6985a5efcd3f` | compose.yaml, infra, CI, DevOps docs | 01, Docker runtime | запущен |
| 16 | SEO и аналитика / `01a21a2d-456a-7463-80b2-cec73fcdb2f6` | lib/seo, robots/sitemap, интеграция через 03 | 03, достоверные данные | запущен |
| 17 | Финальная интеграция / `01a21a2a-867e-7bb1-a639-9466c56e05a2` | root dependency install/lock/scripts, сборка/сквозная приёмка | 01–16 по этапам | запущен, этап 1 |

Запланированный чат считается созданным только после появления реального thread ID. Каждая новая самостоятельная задача получает отдельный чат и handoff.

## Этапы и приёмка

### Текущий приоритет: админ-панель

Возобновление после сброса лимитов заказчиком: остановленные 01.1/17/03.1/13.1/14.1/10/04.1/05.1 получили продолжение на medium; готовые прежние участки выполняют только ограниченную проверку/handoff без пересечения новых владельцев. Общая Next-сборка admin/auth/publicCMS PASS по17, backend68tests/DB27tests/web125tests/contracts61tests — результаты отдельных владельцев, не замена сквозной приёмки.

Рассылка продолжения завершена для всех24 рабочих чатов проекта кроме координатора. Все send_message ответы успешны; medium сохранён, модели не менялись. Повторно остановившиеся по лимитам09/07.1/14.1/13.1/17 получили дополнительное продолжение после явного сообщения заказчика о сбросе лимитов. Готовые прежние участки не разрабатываются заново и не перезаписывают актуальных владельцев.

Исключение статуса13: после успешной отправки продолжения платформа остановила ход с сообщением о возможном cybersecurity risk (не usage limit). Это ограничение не обходится повторной отправкой; старый13 не объявляется реально запущенным. Текущий отдельный13.1 продолжает локальный defensive review в назначенных рамках.15 завершил bounded read-only handoff: production overlay/keys/media persistence, upload proxy limits и accounts CI требуют отдельного hardening до production; это не объявление готового развёртывания.

Первый isolated browser admin QA дошёл через proxy/bootstrap/password/MFA до SSR identity proof и остановился ДО CRM mutations.14.1 исправляет собственный predicate для Node/Undici mode=cors, proof не отключается; повтор02 назначен17 на той же сборке. Fixture закрыт/очищен. Перед рабочей003 создан pre-admin backup с проверкой восстановления(11tables/85cities/2753places);003 migration+least privilege grants PASS по17, реальные admin/users не создавались. Accounts остаётся выключенным на рабочем API до защищённой операторской настройки.

После сброса лимитов: API runtime реально возобновлён. Combined build PASS, QA02 подтвердил browserMFA/genuineSSR session/CRM durable write/phone masked+reveal reason audit/navigation clear. Прогон остановился на business category selector timeout,14.1 разбирает selector/form; это не полный PASS. Fixture закрыт,17 восстановил рабочие сервисы с GIS: ready/map/cities85/reviews/nearbycafes HTTP200. F13.1-06 исправлен узко05.1: current-editor selfapprove403/pending unchanged, different authorized moderator allowed; realDB11tests и targetedHTTP4tests PASS по владельцам, независимая13.1 проверка запрошена. Миграция003 от этой правки не менялась.

Новый проверенный98-operation checkpoint: catalog07 browser actualUI/MFA/SSR/create/edit/publish/publicnear-detail/archive/logout PASS без пауз/повышения квот. Prefetch исправление уменьшило ingress127→75, private102→56, site-settings64→10, denials0. CMS06 actualpublishedA/draftBprivacy/publishBhomepage/logout PASS. Public09 genuinebrowserCSRF/login401/закрытыеAPI/6widthsaxe10/10PASS; dialog03 Tab+ShiftTab/Escape/returnfocus1/1PASS, прежние16demo checks35owners/35business/sixwidths сохранены. Это приёмка перечисленных сценариев, не всехфункцийпродукта.17 восстановилAPI67419/web47937 localhost3001/3000 сGIS иaccountsdisabled.

Продолжение незавершённых форм10 разрешено после этого checkpoint: city/region selector, geocode/manual fallback, approved media attachments, operator monthly quote→actual agreement→receipt через browsable lookup.01.1 additive100operations/64tests/typecheck/OpenAPI PASS: GETadmin/listings/listingId сactualquote/agreement/fundedsummary безphone/fakepayment.05.1/04.1/10 получили реализации; новый runtime ещё не принят. Оригинальные98операций сохраняются.

Открытый новый release gate F13.1-06: редактор мог самостоятельно approve текущую правку отзыва;13.1 подтвердил isolated repro,05.1 получил требование deny current editor + different moderator test. Предыдущие draft/peer-admin/media-reference/phone-reason findings независимо проверены исправленными; ingress/rate audit amplification исправлен04.1 и перепроверен13.1. Browser/PII/CMS и полный admin функционал ещё не приняты.

Новое указание заказчика: реальное управление контентом/логотипом/изображениями/отзывами, бизнес CRUD, база владельцев и бизнесов, скрытые телефоны и учёт дней оплаченной месячной подписки. 35 вымышленных владельцев реализуются только как явно обозначенные demo fixtures с недозваниваемыми примерами телефонов и22–30дней; выдавать их за платящих клиентов или seed реальных аккаунтов нельзя. 35 реальных бизнесов уже выбраны из разрешённой БД, фото/ratings не выдумываются. Национальный import остановлен наcheckpoint82complete+2partial/414rows; существующие2753places и85cities сохраняются.

| Задача | Чат | Пути/зависимости | Статус |
|---|---|---|---|
|05.1 DB admin/auth/CRM/CMS|`01a21a53-46da-7433-89f9-f1ad00445e07`|packages/db, migration/repository/least privilege|запущен|
|04.1 API admin/auth/MFA/media|`01a21a54-38ca-77d3-8d0c-255a50e20b96`|apps/api, schemas01.1/db05.1|запущен|
|10 Admin UI|`01a21a55-906f-79d2-b89d-c9ee0db7147b`|admin/auth routes/components, isolated admin-demo|запущен|
|02.1 Category illustrations|`01a21a57-01b7-73c2-bd6c-a414e85df7b5`|public/admin-illustrations, ImageGen, no fake real-shop photos|запущен|
|14.1 Admin QA|`01a21a59-19dc-7e10-a3bf-390d95c24df8`|новые admin Playwright/axe tests и report|запущен|
|13.1 Admin security review|`01a21a5a-0915-7be0-ad39-53b1b809ef54`|read-only auth/RBAC/CRM/media/CSRF review|запущен|
|03.1 Public CMS consumer|`01a21a5b-b9d3-7762-a1a2-94ebb7dc5905`|public home/header/footer/layout, published content/logo/media|запущен|

Admin security13.1 обнаружил P1 draft-publication bypass в промежуточной DB реализации: update published place менял видимые контакты/поля до публикации, обходя отдельное catalog:publish. Исправление draft isolation/atomic publication с regression A→draftB→publish направлено05.1; независимое подтверждение исправления требуется. Подключение auth/service и media пока implementation gates, не утверждение о готовых защищённых endpoints.

02.1 принята как поставка медиа:12PNG1536×1024,25,203,511bytes, исходники builtinImageGen, hash/dimensions/source equality и35/35coverage PASS. Все prompts/mapping/alt/nature и обязательная метка в public/admin-illustrations/manifest.json; docs/ADMIN-ILLUSTRATIONS.md/handoff02.1. Координатор визуально проверил кафе/авто; все12 просмотрены владельцем. UI10 использует NextImage/sizes/lazy, а не raw25MB initial load; это не реальные фото организаций.

Контракты97ops с actual fundedSubscriptionSummary/accepted founder agreement:59tests/typecheck/OpenAPI independently PASS по17. Runtime auth/CRUD ещё проходят интеграцию.13.1 дополнительно проверяет equal-admin suspension/media published-reference archival; GETcsrf exactOrigin конфликт с браузерным отсутствием Origin передан01.1/04.1/10/14.1 для безопасного согласованного bootstrap transport.

01.1 расширяет существующие схемы typed CRUD/media/reveal/review corrections.17 остаётся единственным владельцем install/lock/build orchestration. Native argon2/sharp install и memory-only smoke PASS по17, реальные auth endpoints ещё не активированы. Readonlyshowcase35manifest `data/cities/showcase35.json`:35realrecords/34cities/11regions/12commercialcategories; OSMprovenance/license сохранены, no paid/owner/partner claim. Fake testimonials/owners не попадут в production.

Уточнение заказчика 2026-11-27: стартовое покрытие России — по 3–5 реальных бизнесов на город, без полного импорта всех организаций. Платная анкета владельца — будущая модель; сумма не задана. Ранее загруженный Смоленск сохраняется. Реестр городов, определения источника и фактические пробелы покрытия ведутся отдельно; наличие CLI не считается наполнением всех городов.

Ответ заказчика о способе оплаты: **ежемесячная подписка**. Цена пока не задана; новый контракт01.1 должен отражать monthly interval и отключённые до подключения провайдера автоматические платежи.

Последующее уточнение: **ручная оплата по согласованию с основателем через [ВКонтакте](https://vk.ru/desktopcoder) / [Telegram](https://t.me/desktopcoder)**. Написание VK desktopcoder явно подтверждено заказчиком. Контактный CTA доступен без онлайн-провайдера; факт перехода/заявления об оплате не активирует подписку. Реализация авторизованного подтверждения полученной суммы/оплаченного месяца и аудита — задача бизнес/админ/backend этапа2. Цена не назначена; автоматические списания не требуются. Изменение передано владельцам03 и01.1, проверки и пересборка через17 после их handoff.

Frontend03 реализовал manual-monthly текст и точные contact CTA на4businessroutes; SSR4variants/typecheck PASS поhandoff03. Пересборка/HTTP-проверка обновлённого production результата поручены17. Это не подтверждение готовности серверного учёта подписок.

Подтверждение17: новая единичная production-сборка с metrics-dl fix и manual-monthly business PASS. `/business` и `/business/pricing` HTTP200, точные VK/TG и фразы monthly/manual/no-autocharges/no-online-checkout проверены. Активный production web session85390 на127.0.0.1:3000, API90596 на127.0.0.1:3001; старый web92926 остановлен. QA14 повторяет axe/PWA на этой сборке. Контракты ручной модели:52tests/74OpenAPI PASS. Никакие реальные платежи/подписки этими проверками не активировались.

Handoff01.1 обновлён под monthly: month/RUB, nullable monthlyPriceRub, automaticBillingEnabled=false; pending/active/past-due/cancelled/expired, периоды/льгота/отмена. По отчёту владельца build/typecheck и51tests PASS, OpenAPI74operations parity PASS. Это результат контрактов; реализация кабинета, расчётов и платежей не объявляется готовой.

Создан чат `07.1 | Каталог — 3–5 бизнесов на город России`, thread `01a21a3e-a6d1-7402-963d-42362feef8a5`, thinking medium. Его пути: packages/city-catalog, data/cities, docs/CITY-COVERAGE.md и handoff07.1. Задача07 заканчивает текущую корректировку Смоленска; новый общероссийский импорт принадлежит07.1. Статус07.1: запущен, фактическое национальное покрытие ещё не подтверждено.

1. Рабочий вертикальный срез: схема/миграции, разрешённый импорт Смоленска, API геопоиска, Digital City главная, карта и карточка, геокодер и маршрут с обработкой отказов, PWA. Сквозная приёмка требует реально работающих PostGIS/тайлов/геокодера/маршрутизатора; интерфейс unavailable не заменяет успешный маршрут.
2. Аккаунты/сессии, отзывы, модерация/CMS/админка, бизнес-заявки и права владельца — отдельные задачи после базового среза.
3. Подписки/платежи/реклама, аналитика, региональное масштабирование — после базовых проверок и подключения требуемых доступов.

## Текущие блокеры и ограничения

- Docker Desktop удалось запустить, Linux engine/WSL2/Compose доступны по отчёту15. Подключение и GIS-запросы БД ещё проверяются. Производственные тайлы/Nominatim/Pelias/Valhalla ещё не подключены.
- GIS06 выполнил единичную ручную проверку контрольного адреса: ул. Ленина, 8, Смоленск; источник Nominatim/OSM, координаты lon32.0499850 lat54.7823535. Источник/время/лицензия будут в GIS.md. Это не приёмка каталога или маршрута.
- Никаких публичных неограниченных production-интеграций, вымышленных отзывов или счётчиков. Платежи без реквизитов/провайдера не включаются.
- Облачное развертывание Nest/PostGIS и коммерческий запуск требуют совместимой инфраструктуры; успешная статическая публикация не является приёмкой продукта.

## Проверки

По промежуточным handoff: первичный минимальный npm install (01) завершён, vulnerabilities0 на его начальном графе47 пакетов; это не финальный dependency audit. Интегратор17 один владеет дальнейшими install/lock.

По фактическому отчёту15: PostgreSQL16.4/PostGIS3.4.3 ST_DWithin, runtime TCP auth/no schema CREATE, Redis NOAUTH/PONG прошли; backup safety2/2, backup+restore-check в новую временную БД прошли. Прикладная схема ещё создаётся — восстановление нужно повторить после05. Образ PostGIS3.4 старый и требует security-upgrade решения перед production.

По промежуточному аудиту02: 72 исходных Assets скопированы с совпадающими SHA256, 63SVG разобраны без scripts/external refs, Manrope локально с OFL. Полная UI/browser-приёмка ещё впереди.

Обновление приёмки: интегратор17 сообщил PASS clean npm ci (253 установлено/264 audited/0 vulnerabilities), shared/API/Next production build, общих typecheck/tests/OpenAPI. Production preview: web127.0.0.1:3000/API127.0.0.1:3001. Это локальный запуск, не публикация.

Каталог Смоленска: 2339 реальных OSM-карточек; исправлены19 импортированных chemist-записей (20 источников,1 без имени отклонён). Normalizer revision2 сохранил все durableID/slug/source timestamps; повторный импорт2339 unchanged. Unit10 и реальный PostGIS integration8 у импортера PASS. DB05 сообщает unit2/integration16/typecheck/build PASS, безопасная регистрация городов добавлена для07.1.

Security13: F-13-01 reports URL bypass независимо перепроверен и закрыт для записанных hashes; весь security release gate не считается автоматически закрытым. Backup/restore прикладной схемы11tables/city1/places2339 и safety4 PASS по15. Старый pinPG16.4/PostGIS3.4.3 требует security-upgrade решения передproduction.

BrowserQA: предыдущий UI-прогон7PASS/6FAIL (axe dl-структура, HMR); исправления направлены03, повтор на production ожидается. MapLibre worker и hero contrast исправлены03, browser-верификация обязательна. API route smoke3режимов PASS по17; адресная live-приёмка ожидает geocoder configuration. GIS06.1 встретил usage-limit среды; Nominatim8088/status уже HTTP200 по проверке17, состояние не подменяется утверждением о завершённом provisioning.

Национальный каталог3–5/город ещё не принят:07.1 проверяет официальный реестр и легальные источники. Полный продукт этапов2/3 не завершён.

Контроль источников07.1: CSV ОКТМО, загруженный с отключённой проверкой сертификата, помещён в карантин и не принят как доверенный источник/официальный denominator. Требуется независимая проверка происхождения и целостности через защищённый источник; дальнейший TLS bypass запрещён координатором. GeoNames получен с обычной TLS-проверкой и может использоваться как явно предварительный географический источник с собственной лицензией, без выдачи всех поселений за официальные города. Ответы Overpass502 означают ограничение доступности, не разрешение на бесконечные запросы.

Промежуточный отчёт07.1: первый реальный apply Котельники5/Дзержинский5, DBcities3 вместе со Смоленском; каталог Смоленска2339 сохранён. Источник реестра HFLabs CC BY-SA4:1117 предварительных городов,1099 GeoNames matches, официальный denominator=null. Используется offline polygon containment/max5 из файлов BBBike/Geofabrik с TLS/hash/cache. Следующие выгрузки North Caucasus124MB (65candidatecities) и Kaliningrad28MB обрабатываются; это не утверждение о количестве уже наполненных городов. Typecheck PASS по владельцу, meaningful тесты/повторный apply/итоговый coverage ожидаются. На момент проверки координатором docs/CITY-COVERAGE.md и handoff07.1 ещё не созданы — результат не принят как завершённый.

Независимый smoke17: APIcities/categories HTTP200,14categories; actual-center nearby10km Kotelniki5/Dzerzhinsky5 с совпадающими ID/OSMprovenance PASS. Smolensknear10km2327 — число ограниченного геозапроса, не весь каталог2339. Обнаружен frontend default-city regression: home/QuickSearch cities[0] выбирает первый город сортировки (Котельники). Исправление explicitSmolenskdefault/respectuserquery передано03; закрытие требует reordered-city regression test и проверки после пересборки.

Default-city follow-up:03 shared selectCity дляhome/QuickSearch/baremap, enabledSmolensk default и explicitavailable choice priority. 4targetedtests/typecheck PASS,17 независимо проверил4tests и production rebuild. GET главной HTTP200, QuickSearch selectedSmolensk при APIorderKotelniki-first PASS. Явный выбор на карте передан14 для отдельной проверки.

Следующий промежуточный checkpoint07.1:23complete города (>=3 selected businesses),1partial(2),117 starter rows по сообщению владельца; не вся Россия. Детерминированный max5, действительные polygon/hole containment, duplicates, replaystableIDs, cancellation/rollback в отдельной PostGIS БД PASS по владельцу.17 независимо подтвердил city-catalog typecheck и6unit tests. На момент чтения docs07.1 ещё показываютпервыйbatch2cities — запрошена синхронизация отчёта с actual coverage JSON; это остаётся промежуточным результатом.

QA14 по предыдущей production85390: final axe6/6widths, pricing/PWA/privacy PASS по сводке17; компактный ввод адреса без пробелов остаётся отдельным QA14-02 gap. Эти результаты не означают полную готовность аккаунтов/админки/ручного платёжного учёта или общероссийского каталога.
