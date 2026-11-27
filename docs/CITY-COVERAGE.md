# Стартовое покрытие городов

Задача 07.1, 2026-11-27 Europe/Moscow. По прямому обновлению заказчика через00 национальное расширение **остановлено с сохранением checkpoint**. Текущий результат — витрина **35 реальных организаций**, подготовленная и сверенная с БД. Национальное наполнение **не завершено**. Открытые стартовые записи не являются платными анкетами, подтверждением владельца или гарантией работы организации.

## Витрина 35 организаций

[showcase35.json](../data/cities/showcase35.json): **35 организаций,34 города,11 регионов источника,12 коммерческих категорий**. Категории: auto,bank,beauty,cafe,entertainment,fuel,hotel,medicine,pharmacy,services,shopping,sport. Детерминированный выбор предпочитает новые категории, затем регионы/города, фактический адрес/контакты, tie-break sourceRecordId; максимум3 организации одного города. Никаких вымышленных владельцев/оплат/партнёрства. Photo/review scraping Яндекс/2ГИС не выполнялся; photos=[],rating=null,openingState=unknown.

Каждая запись содержит durable UUID/slug, город/регион, реальные данные контактов при наличии, provenance/license/source timestamps, `apiPath=/api/v1/places/{slug}` и `webPath=/places/{slug}`. Эти существующие endpoints не требуют нового API. Read-only runtime-role проверка [verification.json](../data/cities/verification.json) подтвердила точное соответствие35 карточек текущей БД. HTTP/browser QA отдельно у17.

После остановки завершены только уже запущенные offline extraction: Амур11,Кемерово19,Курган8 городских полигонов. Эти **38 городов не импортированы**, план84 городов не расширялся. Загруженные МарийЭл/Новгород/Калуга не обрабатывались после stop. Данные сохранены для отдельного возобновления; новых download/apply после stop не было.

## Реестр и знаменатель

Официальный знаменатель пока `null`. Проверяемый предварительный реестр: **1117** записей справочника [HFLabs/city](https://github.com/hflabs/city), лицензия CC BY-SA 4.0, данные DaData, исторический список Википедии. Не объявляем его актуальным официальным списком. Включаются только строки с явным типом `г` в city/settlement/area/region; район или обычный GeoNames PPL не становится городом. Идентификатор `city-<FIAS UUID>` различает одноимённые города; Смоленск сохраняет существующий `smolensk`.

Центры берутся из исходного справочника. Отдельное сопоставление с [GeoNames RU.zip](https://download.geonames.org/export/dump/RU.zip) (CC BY 4.0) требует совпадения имени/alternate name и расстояния менее 15 км, предоставляет IANA timezone. **1099** совпадений, **18** unmatched остаются `needs_review`. Они входят в знаменатель и не теряются. Источник старый, новые города после его публикации отсутствуют; этот разрыв требует отдельной официальной сверки.

Границы/viewport не строятся на глаз вокруг центров. Офлайн PBF-процессор собирает реальные OSM полигоны place=city/town, boundary=place или boundary=administrative/admin_level=8 с совпадающим именем и включённым центром. Вложенные одноимённые полигоны выбираются по наименьшему extent. Это геометрия OSM соответствующей даты, не универсальное юридическое определение границы. HFLabs/GeoNames используют собственную территориальную классификацию. Включение Крыма в исходный список явно является юрисдикцией источника; оно не утверждает международный консенсус. Несопоставленные/спорные записи требуют review и не импортируются автоматически.

## Источники и транспорт

Разрешённые OSM файлы: [BBBike](https://download.bbbike.org/osm/), [Geofabrik](https://download.geofabrik.de/russia.html), [OSM France](https://download.openstreetmap.fr/extracts/russia/), ODbL 1.0, © OpenStreetMap contributors. Только небольшие city/regional файлы, один download за раз, лимит150MiB на файл и640MiB суммарно, кеш с SHA256; нет country/planet загрузок, scraping, Nominatim-циклов, backend runtime запросов или фотографий/отзывов. Извлечение offline: pyosmium из уже имеющегося Nominatim image, ограничение процесса768MiB/1CPU, disk location index. Полные региональные POI в БД не пишутся.

`data/cities/raw/<source>.osm.pbf.json` фиксирует exact/resolved URL, fetchedAt, HTTP Last-Modified, bytes, SHA256, TLS verified, license/attribution. Реальная дата редактирования каждого OSM объекта берётся из PBF, никогда из HTTP даты. `derived/*.json` содержит фактический boundary ID/timestamp/geometry и до 80 кандидатов на город; `state/plan.json` пинит SHA256 этого файла и выбранные IDs. HFLabs/GeoNames exact URL/bytes/SHA256 находятся в `registry.json`.

Полный [acquisition-manifest.json](../data/cities/acquisition-manifest.json) включает точные URL/bytes/SHA256 всех15 файлов источников/лицензии/транспорт, отдельно [quarantine-manifest.json](../data/cities/quarantine-manifest.json). Для ранних справочников честно указан filesystem download completion mtime, sourceUpdatedAt=null. Не утверждается наличие несуществующей upstream подписи. Национальный registry и OSM provenance остаются различимыми; правовая оценка совместного распространения производной базы с разными share-alike лицензиями остаётся юридическим gate проекта.

Публичный Overpass остановлен: две попытки вернули 502 capacity; третья после паузы завершилась timeout 55 s. Данные не приняты, бесконечных retries и обхода через другие серверы нет. Для будущего приобретения query-источника нужны отдельный лимит/Retry-After/backoff и контролируемый сервис. Текущий CLI использует файловые выгрузки.

### Карантин Росстата

Первичная проверка нашла [официальный набор ОКТМО](https://rosstat.gov.ru/opendata/7708234640-oktmo), modified 20261001, и [условия открытых данных](https://rosstat.gov.ru/storage/2018/08-23/6RswQtD5/usl-od.pdf). Старые BUL_MO_2024.xlsx и DOCX ссылки вернули 404; штатные HTTPS запросы дали SELF_SIGNED_CERT_IN_CHAIN/UntrustedRoot. До уточнения координатора одноразовая PowerShell загрузка CSV/metadata/pages использовала SkipCertificateCheck. **Это untrusted quarantine, не authority импорта или официального знаменателя.** Никаких дальнейших исключений TLS; системный trust store не менялся. Нужна независимая verified-TLS byte-identical копия или официальная подпись/checksum. `quarantine-manifest.json` хранит URL/hash/bytes и transport caveat; CSV не читается сборкой registry/selection/apply.

## Выбор бизнеса и фактическое покрытие

Цель 5, минимум 3. Named commercial nodes: кафе/магазины/услуги/отели/банки/АЗС и разрешённые медицинские сервисы; ATM, памятники, музеи, учебные/государственные учреждения не подставляются вместо бизнеса. Explicit private/no access, lifecycle/disused/abandoned/closed фильтруются. OSM активность вероятностная, звонок/юридический статус не проверены.

Кандидат должен находиться в действительном полигоне города и не далее 8 км от проверенного центра. Это ограниченная стартовая центральная выборка, а не полная география города. Address/phone/website только исходные, неизвестный адрес явно указан. Приоритет фактическому адресу и контактам; затем разнообразию категорий, расстоянию и стабильному source ID. Identity duplicate удаляется; same normalized name менее 50 м считается потенциальным дублем и не выбирается дважды. Разные филиалы на разных координатах разрешены. Пересечение одного source ID между городами останавливает план.

Сохранённый selection максимум 5 на город. `extend` добавляет только новые города, старые selection не меняет; предыдущий план сохраняется по hash. `apply` валидирует registry/dataset/selection, вызывает owned05 `registerCity` и owned07 `applyPlaces`; SQL mutation в city-catalog отсутствует. Схема должна пройти importer policy guard. Commit/rollback принадлежит одной записи, не всему региональному batch; предыдущие успешные записи сохраняются, ошибки/отмена журналируются. Повтор использует прежние source identities.

`complete` означает actual DB distinct selected business count ≥3, активные place/city, OSM provenance/license/date, категория и ST_DWithin ≤8000. `partial` — 1–2 или недостающее количество; `source_missing` — нет пригодного набора/полигона; `needs_review` — source matching, конфликт, stale или write failure. Успешный download сам по себе не complete. `coverage.json` и `state/journal.json` дают точный список всех пропусков и значения на момент измерения.

## Запуск

Из корня репозитория, dependencies/lock только у17. Секреты только ignored infra/.env.local. Команды расширения ниже — инструкция для **отдельно возобновлённой** работы, сейчас не запускаются. README пакета содержит полный CLI acquire/extract/dry-run/extend/apply/coverage и read-only showcase/verify.

```powershell
python packages/city-catalog/src/prepare-registry.py
node packages/city-catalog/src/download.mjs moscow
# Offline extraction: см. README пакета, pinned existing GIS image.
node --import tsx packages/city-catalog/src/cli.ts dry-run
# При появлении новых derived файлов, сохраняя выбор старых городов:
node --import tsx packages/city-catalog/src/cli.ts extend
node --env-file=infra/.env.local --import tsx packages/city-catalog/src/cli.ts apply
node --import tsx packages/city-catalog/src/cli.ts coverage
```

## Текущее измерение

Измерение 2026-11-27T00:02:22.086Z. Предварительный знаменатель **1117**, официальный **null**.

- Complete: **82**.
- Partial: **2**.
- Source missing: **1015**.
- Needs review: **18**.
- Всего выбранных записей, подтверждённых в БД: **414** (включая предыдущие batch, не число новых записей последнего запуска).
- Городов без complete: **1035**.

Точный поимённый список пропусков: [coverage.json](../data/cities/coverage.json), поле missing; состояния каждого города: [journal.json](../data/cities/state/journal.json). Исходные2339 записей Смоленска сохраняются отдельно; его выбранная пятёрка ещё требует отдельной сверки геометрии. GIS вне Смоленска этим импортом не включён.
