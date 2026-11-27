# 07 — импорт реальных организаций OSM Смоленска

Дата проверки: 2026-11-27 Europe/Moscow. Владелец `packages/importer/**`, `data/osm/**`, этого документа и `HANDOFFS/07.md`. Активирован полностью прочитанный Sites Skill, local-only; Next/Nest/PostGIS сохранены. Категории задачи: architecture, backend/API/database/GIS, security, performance, testing, documentation. Специализированных GIS/security Skills нет; проверки реализованы явно. Исходный `ryadom-digital-city/` не изменён. Ни commits, ни push, ни deploy не выполнялись.

## Фактический результат и текущая граница

В локальный настоящий PostgreSQL16/PostGIS3.4 импортировано **2339 реальных POI**, по2339 source_records, duplicate source identities=0. Первая загрузка inserted2339; повторная unchanged2339, inserted0/updated0/stale0. Работает поиск из `CatalogRepository` через ограниченную runtime роль. Контрольный адрес GIS06 «Смоленск, улица Ленина, 8», lon32.049985 lat54.7823535, radius1500/category=cafe: total109, первые результаты ниже.

**Taxonomy исправлена и согласована с БД.** Первоначальное правило ошибочно относило `shop=chemist` к pharmacy. Официальная документация OSM описывает этот тег как товары гигиены/косметику/бытовую химию. Итоговый нормализатор revision2: pharmacy только `amenity=pharmacy`, shop=chemist→shopping. Из20 исходных chemist-элементов один без названия отклонён; **19 импортированных записей исправлены** через новый API DB05 `startImport('osm',{normalizerRevision:2})`. Migration002 владельца БД разрешает новое преобразование при той же дате OSM только при более высокой версии нормализатора. Не подделывались source timestamp, не удалялись записи, не применялся SQL bypass. Read-only queue `data/osm/taxonomy-corrections.json` сохраняет исходные19 ID/старые hashes; `revision2-validation.json` содержит новые hashes и подтверждение correction. Все2339 durable UUID, slug, source identities и source timestamps сохранены.

`validation-summary.json` — история первого импорта/повтора: pharmacy83/shopping1116. Актуальная evidence — `revision2-validation.json`: pharmacy64/shopping1135; correction updated19/unchanged2320/inserted0/stale0, repeat unchanged2339/inserted0/updated0/stale0. Старые artifacts сохранены.

## Первичные источники и условия

Изучены [OSM copyright](https://www.openstreetmap.org/copyright), [полный ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/), [OSMF attribution guidelines](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines), [официальные Overpass Commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [Overpass QL reference](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL), [shop=chemist](https://wiki.openstreetmap.org/wiki/Tag:shop=chemist), [amenity=pharmacy](https://wiki.openstreetmap.org/wiki/Tag:amenity=pharmacy). Правила проверялись browsing в этой задаче.

OSM разрешает работу с открытой базой при соблюдении ODbL/атрибуции; коммерческая эксплуатация не отменяет эти обязанности. Условия базы не дают права копировать произвольные фото/отзывы. Публичная карта и результаты должны явно показывать © OpenStreetMap contributors и ссылку на лицензию. Отслеживаемый производный replay предоставляется вместе с manifest и запросом. Юридическую оценку объединения OSM с будущей бизнес-базой оператор проводит до запуска.

Public Overpass ограничен общими ресурсами; использовать его постоянным backend пользовательского приложения нельзя. Здесь только один успешный bounded экспорт city area; initial ошибочный административный запрос вернул empty и не попал в БД. Query timeout60s/maxsize33554432, клиент timeout90s, concurrency1, response max16MiB, redirects запрещены, идентифицирующий User-Agent с контактом Patchvale. Автоповторов нет. При429/5xx не переключать IP/серверы для обхода; учитывать Retry-After и нагрузку. Если нужна регулярная актуализация — согласованный региональный file extract либо собственный Overpass/diff pipeline, собственная инфраструктура, лимиты/обратная экспоненциальная задержка с jitter и конечным числом попыток. Планировщик и BullMQ не подключены; публичные API по расписанию не вызываются.

Яндекс/2GIS, scraping, чужие фото/отзывы, CAPTCHA bypass и произвольные remote URL adapters отсутствуют. CLI вообще не выполняет сетевых загрузок.

## Данные и контроль происхождения

Точный запрос `data/osm/smolensk-initial.overpassql`, источник `https://overpass-api.de/api/interpreter`, граница [OSM relation/3339993](https://www.openstreetmap.org/relation/3339993), boundary=place/place=city. Административный тег первоначального предположения не использован. POI отобраны Overpass area relation, source bbox `[31.7883262,54.7075603,32.2095639,54.850378]` служит дополнительной валидацией координат. Для произвольных новых файлов этот bbox сам по себе не доказывает попадание в полигон: нужен новый проверенный source manifest и spatial selection.

- base timestamp: **2026-11-26T23:23:05Z**;
- получение: **2026-11-26T23:24:48.987Z / 2026-11-27 02:24:48.987 MSK**;
- original1304942 bytes, SHA256 `44c370dcfb908341d485eee48b9b3cafd69b00d8d1833f536a733de3e15a2e56`;
- tracked replay775615 bytes, SHA256 `2e16c1efea174f522e47244d6a5f3bf70816f309065279c8bd7d0fbda6e331e4`;
- query SHA256 `246cf781e344616748cc8468f9b8b5da9ee4478232887a01d96e068f851c59bb`.

Raw в ignored `data/osm/raw`, отчёты в ignored `data/osm/reports`; trackable manifest/replay/лицензия/инструкция/evidence. Replay удаляет contributor user/uid, versions, changesets и members/nodes, сохраняя timestamp объекта, tags и действительные coordinates/center. Raw hash и transform явно сохранены; hash replay проверяется отдельно. Никаких новых сетевых запросов для воспроизведения не нужно. Manifest — проверяемый checksum/lineage локально доверенного набора, не криптографическая подпись внешнего издателя.

Каждая запись имеет sourceId=osm, sourceRecordId=`node/ID|way/ID|relation/ID`, sourceUrl на оригинальный объект, ODbL-1.0, attribution, фактический element.timestamp как sourceUpdatedAt, importedAt. Base timestamp набора отдельно, не подменяет дату редактирования объекта. DB source_records хранит content hash, sourceUpdatedAt/importedAt/jobId; исходный hash файла привязан к job в локальном отчёте/evidence (в БД отдельного поля dataset hash пока нет). Копировать отчёты вместе с backup и ограничивать права доступа к raw данным.

## Правила нормализации

Вход≤16MiB,≤20000 элементов, tags≤500 на объект; bounded строки/даты/числа через общие Zod DTO и дополнительные проверки. Идентификаторы safe positive integers, координаты finite WGS84 `{lon,lat}`, городская bounds проверка. node берёт lon/lat, way/relation — фактический Overpass center; не выдумывает координаты/вход/геокодированные адреса. Отклоняются неполные upstream ответы с remark, неверная граница/metadata/count/hash/license. Без valid source timestamp запись отклоняется.

Имена только `name:ru`/name≤200, нет имён по category/operator или выдуманных организаций. Address только addr:full либо реальные addr:postcode/city/street/place/housenumber/unit; если ничего нет, явное «Адрес не указан в OSM». Поиск addr/contact по сторонним сервисам не выполняется. `openingHours` сохраняется описательным текстом; `openingState=unknown`, `hoursVerifiedAt=null` даже при24/7. Rating=null, photos=[], отзывов нет; `stars`, rating/image/review tags не превращаются в опубликованные рейтинги/контент. Description=null. Wheelchair yes/limited/no иначе unknown.

Контактные websites только явные HTTP(S), без credentials, пробелов/control/backslash и локальных/IP hosts; malformed discarded с bounded code и row/source ID. Сервер их не fetch-ит. Телефоны только допустимые +digits/space/()- и5..15 digits, длина≤30; malformed/multiple contacts discarded. Сырые contact values/SQL errors/секреты не логируются. UI обязан выводить данные как текст и безопасные ссылки.

Основные mappings (полный код в normalize.ts):

| Category | OSM tags |
|---|---|
| cafe | amenity cafe/restaurant/fast_food/food_court/bar/pub |
| shopping | остальные действующие shop, включая chemist |
| pharmacy | amenity pharmacy |
| medicine | hospital/clinic/doctors/dentist/veterinary |
| beauty | shop beauty/hairdresser/cosmetics/massage |
| auto | car/car_repair/car_parts/tyres/motorcycle, car_wash/car_rental |
| sport | leisure fitness_centre/sports_centre/stadium/swimming_pool |
| hotel | tourism hotel/motel/hostel/guest_house |
| entertainment | museum/attraction/gallery, cinema/theatre/arts_centre/amusement_arcade |
| bank | bank/atm |
| education | school/kindergarten/university/college/library |
| government | townhall/police/post_office/courthouse, office government |
| services | craft, office insurance/travel_agent/lawyer/accountant, laundry/dry_cleaning/copyshop/travel_agency/funeral_directors |
| fuel | amenity fuel |

Private/no-access, explicit disused/abandoned/demolished/razed/construction и vacant/closed shop не публикуются этим импортом. Это консервативный фильтр, не проверка фактической работы. Unsupported категории пропускаются с code. Полнота каталога не гарантируется.

## Дедупликация, запись и будущие владельцы

Источник identity уникален (osm,type/id); slug `place-osm-node-ID` и аналоги. Промежуточный DTO UUID детерминирован от identity; DB05 создаёт durable UUID при первом insert и возвращает его. Стабильность DB UUID/slug на повторе проверена. Нормализация повторного файла не создаёт duplicate IDs. Same name≤50m только manual queue, без blind merge; очередь содержит source ID и расстояния. Spatial bins,≤100000 comparisons и≤20000 candidate pairs; truncated flag явно в отчёте. Текущий набор не truncated.

Все изменения через `ImportRepository` DB05: source registration/enabled/license проверены; job обязан быть running; advisory source-record lock; параметризованные SQL; upsert places/categories/provenance/job counters в транзакции **одной записи**. Более старый/противоречивый timestamp не затирает свежие сведения. Исчезнувшие объекты не удаляются автоматически. Фатальная ошибка завершает job failed; ранее успешно записанные объекты остаются committed. Это не all-or-nothing rollback всего файла. Ошибка после place/categories и до source_records действительно откатывает все изменения одной записи — доказано injected trigger integration test.

CLI поддерживает только точный проверенный журнал миграций 001_catalog.sql, 002_normalization.sql, 003_accounts_admin.sql, 004_ownership_claims.sql с SHA256 из reviewedMigrations в apply.ts. Неполный журнал, неизвестная миграция или изменённый checksum останавливают ETL до пересмотра политики. ImportRepository запрещает обновление любой существующей записи с place_field_overrides: job завершается failed/IMPORT_WRITE_FAILED, опубликованные редакторские поля и source_records сохраняются. Это намеренная остановка, не автоматическая reconciliation. Изолированная проверка на004 с настоящим admin save/publish и последующим новым upstream обновлением прошла: исходная публичная проекция и provenance полностью неизменны. Публичная runtime роль не имеет import writes; CLI использует операторский DATABASE_URL вне frontend. Выделенная importer least-privilege роль остаётся инфраструктурной задачей; сейчас это вручную запускаемый административный инструмент.

Отмена SIGINT/SIGTERM прекращает цикл между транзакциями, помечает job failed/IMPORT_CANCELLED и сохраняет локальный отчёт; in-flight запрос ограничен pool timeout. Concurrency1, никаких фоновых сетевых loops. Hard kill/DB outage может оставить running job: оператор сверяет отчёт/журнал и закрывает его отдельной административной процедурой, не заявляем автоматический recovery. Нельзя считать успехом отсутствие источника или ошибку DB.

## Запуск из корня репозитория

Установкой зависимостей/lock владеет17; importer сам install не запускает. Нужно `@ryadom/types` build, schema/seed DB05, здоровый локальный PostGIS и `infra/.env.local` с DATABASE_URL/APP_DATABASE_URL (не коммитить). Npm workspace scripts работают с cwd пакета; команды ниже явно запускаются из корня.

```powershell
# Чтение tracked replay, без сети и без БД
node --import tsx packages/importer/src/cli.ts --input data/osm/smolensk-replay.json --manifest data/osm/source-manifest.json --report data/osm/reports/my-dry-run.json

# После изучения rejects/warnings; новый report path обязателен
node --env-file=infra/.env.local --import tsx packages/importer/src/cli.ts --input data/osm/smolensk-replay.json --manifest data/osm/source-manifest.json --report data/osm/reports/my-apply.json --apply --allow-rejections

npm run typecheck --workspace=@ryadom/importer
npm run test --workspace=@ryadom/importer
node --env-file=infra/.env.local --import tsx --test packages/importer/test/integration.test.ts
```

Без --apply всегда dry-run. Apply с rejects без --allow-rejections прекращается до DB writes; flag означает принятое решение пропустить отклонённые строки после review, не разрешение сохранить malformed записи. Report открывается `wx` и fsync до закрытия; существующий файл не перезаписывается. Это сохраняет source hash, counts, row/error codes, manual candidates, jobId и результат. Duplicate/unknown CLI options отклоняются. Пути input/manifest/report задаются оператором как локальные файлы, не URLs.

Normalizer revision2 прошёл correction и повтор на текущей БД: stale0. Не трактовать завершённый job с stale как успешную reconciliation будущих наборов. Версия нормализатора зафиксирована в коде и отчёте, не выбирается входным OSM-файлом.

One-off acquisition (для нового согласованного набора, не запускать поверх cache):

```powershell
node --import tsx packages/importer/src/fetch-initial.ts --acknowledge-one-off
node --import tsx packages/importer/src/prepare-replay.ts
```

Fetcher имеет фиксированный endpoint/query и откажется выполнять сеть при существующем cached raw. Prepare replay проверяет original hash, не меняет raw, пишет replay эксклюзивно и дополняет manifest. Новый набор лучше сохранять в отдельную versioned директорию и согласовать source policy; текущий код намеренно заточен под этот проверенный initial manifest.

Read-only evidence capture после initial apply-01/apply-02 пишет новые эксклюзивные validation-summary/manual-review; текущие artifacts не перезаписывать. `inspect-taxonomy.ts` пишет точную correction queue, не изменяет БД. Для последующего production scheduler нужны отдельные источник, очередь/retention/конечные retries и операционная приёмка.

## Измеренные данные и проверки

Initial file2734: accepted2339, rejected390 (`missing_or_invalid_name`), skipped4, boundary1. Warnings1955: address_unknown1858, discarded_phone87, discarded_website10. Возможные дубли56. Исправленный taxonomy dry-run имеет те же2339 записей: cafe191, shopping1135, pharmacy64, medicine115, beauty85, auto122, sport33, hotel42, entertainment105, bank44, education187, government94, services91, fuel32. Один POI может иметь несколько категорий; сумма memberships не обязана равняться числу мест.

Initial jobs:

- `3831aeed-c331-4202-9df1-aab1e84079b3`: completed, imported2339, rejected390;
- `896591cd-0db4-4ba8-8d10-24e3b335b96a`: completed, skipped2339, rejected390, count не вырос.

Nearby с реальным runtime DB connection: radius1500/category=cafe/limit5, total109. Первая пятёрка, без вывода выдуманных адресов:

| OSM slug | Имя из OSM | PostGIS distance, м |
|---|---|---:|
| place-osm-node-11451701263 | Искатели | 35.52132337 |
| place-osm-node-12023063495 | Дикари | 41.90263779 |
| place-osm-node-12006390849 | Coffee Like | 49.72566245 |
| place-osm-node-10039004573 | Surf Coffee | 59.03228351 |
| place-osm-node-1147346818 | Пироговая лавка «Самоваръ» | 59.82206777 |

Snapshot EXPLAIN ANALYZE radius/category query Execution Time1.392ms; план выбрал scan191 cafe category memberships + PK probes, а не GiST. Это единичное локальное измерение2339 мест, не производственный SLA и не доказательство плана на больших объёмах. Полный plan в evidence. Radius/category correctness проверены SQL/DTO, геокодер/маршрутизатор/HTTP API end-to-end не относятся к этому тесту.

Финальные проверки: typecheck PASS; unit10/10 PASS; PostGIS integration8/8 PASS (parent+7 subtests) в отдельной freshly generated DB, удалённой после теста. Проверены14 category searches, provenance/media absence, rerun IDs/count, trigger-injected rollback, failed journal, cancellation, schema revision guard и revision2 correction реального chemist при неизменной дате OSM/UUID/slug. Во время согласованного npm ci17 промежуточные scripts вернули tsc/tsx not recognized; после установки повтор PASS. Первый rollback test после migration002 получил stale, потому что test job остался revision1; тест исправлен на revision2 и реальный trigger rollback PASS.

## Передача

07.1/00: новое требование заказчика — по3–5 реальных бизнесов из каждого города РФ, без полного каталога. Здесь массовый импорт не запускался,2339 текущих записей не удалены. Composition API готов: `@ryadom/importer/normalize` экспортирует normalizeElement/categories/safeWebsite/safePhone/Context и constants; `@ryadom/importer/apply` экспортирует applyPlaces/toNormalized/assertImportCompatibility. Это server-only исходные TS exports, запуск через tsx, как DB source API.07.1 должен объявить зависимость `@ryadom/importer:0.1.0` в своём package manifest (root lock только17), не импортировать CLI/fetcher и не писать чужие importer файлы.

`Context = {cityId?:string, importedAt:string, bounds:readonly [west,south,east,north]}`: normalizeElement валидирует cityId общим SlugSchema, importedAt DateTimeSchema, bounds BoundingBoxSchema; invalid context бросает fatal configuration error. cityId не извлекается из OSM tags. Для07.1 всегда явно передавать проверенный cityId из enabled city registry; schema validation сама не доказывает наличие города/правильность геометрии. Omission cityId сохраняет прежний smolensk только ради обратной совместимости. normalizeDocument остаётся Smolensk-only (явно задаёт smolensk, boundary3339993 и initial manifest); для других городов07.1 владеет отдельным source manifest adapter/selection и проверенными границами, затем вызывает normalizeElement на отобранных строках. Не переиспользовать исходный Smolensk manifest для всей РФ.

Перед записью07.1 вызывает assertImportCompatibility(pool), проверяет активные города/источник, complete PlaceSchema и reviewed rejects, затем applyPlaces(new ImportRepository(pool), places, rejectedCount, signal). Текущий applyPlaces работает только sourceId=osm, revision2, bounded serial record transactions; сторонние источники требуют отдельного согласованного adapter API. Максимум5/city и сохранение общего catalogue count — ответственность07.1, не изменение source identity или удаление существующих мест. Не запускать public Overpass loop/полный Russia POI download. Платная анкета и будущие owner поля — отдельная задача.

17: финальные dependency/runtime checks, интеграция CLI из корня.04/03: реальные данные доступны через repository/API; не публиковать рейтинг/фото/часы openNow и сохранять атрибуцию.14: end-to-end address→cafe→real route при готовности GIS.15: backup уже наполненной базы, отдельная importer role, retention журналов/raw. Текущая задача07 завершена в скорректированном объёме; полный продукт и production readiness не заявляются.
