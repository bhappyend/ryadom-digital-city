# Смоленск: первичный открытый набор OSM

© OpenStreetMap contributors. Данные и производный replay доступны по [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). [Условия и атрибуция OpenStreetMap](https://www.openstreetmap.org/copyright). Программный код ETL не объявляется частью OSM-базы.

Набор получен одним успешным bounded запросом Overpass 2026-11-27 **02:24:48.987 Europe/Moscow** (2026-11-26T23:24:48.987Z). OSM base timestamp: 2026-11-26T23:23:05Z. Проверенная граница: [relation/3339993](https://www.openstreetmap.org/relation/3339993), `boundary=place`, `place=city`, `name=Смоленск`. Выборка POI выполнена внутри OSM area этой relation, не по прямоугольнику всей области. Координаты way/relation center являются центрами bbox объекта Overpass, а не проверенными входами.

Файлы:

- `smolensk-initial.overpassql`: точный успешный запрос; timeout60s, maxsize32MiB.
- `source-manifest.json`: источник, лицензия, base timestamp, acquisition timestamp, byte counts и SHA256 оригинала/запроса/replay.
- `smolensk-replay.json`: отслеживаемый воспроизводимый снимок, 775615 байт, 2734 элемента. Сохранены type/id/timestamp/coordinates/center/bounds/tags; удалены uid/user/version/changeset и geometry members. Не содержит придуманных POI. Исходные tags могут содержать ссылки, но код не скачивает их содержимое.
- `raw/smolensk-initial.json`: локальный неизменённый ответ 1304942 байт, ignored. Для повторного импорта достаточно tracked replay; новая сеть не нужна.
- `validation-summary.json`: реальные результаты первого импорта и повторного запуска, запрос nearby через runtime роль, SQL EXPLAIN ANALYZE. Это evidence начальной версии нормализации; см. correction queue ниже.
- `manual-review.json`: 56 потенциальных совпадений name+distance≤50м; ничего не объединялось.
- `taxonomy-corrections.json`: исходная read-only очередь19 исправлений `shop=chemist`→shopping со старыми hashes. Исправления применены через normalizerRevision2 API DB05 без изменения source timestamps/UUID/slug.
- `revision2-validation.json`: актуальная проверка всех2339 identities/UUID/slug/source timestamps/categories; correction19 updated/2320 unchanged, rerun2339 unchanged/stale0. Содержит old/new hashes19 записей. Историческая validation-summary не перезаписана.
- `reports/`: локальные полные отчёты с row/error codes, source hash и job ID; ignored. Хранить вместе с backup import journal. Секреты/сырые ошибки PostgreSQL не включаются.

Оригинальный SHA256: `44c370dcfb908341d485eee48b9b3cafd69b00d8d1833f536a733de3e15a2e56`.
Replay SHA256: `2e16c1efea174f522e47244d6a5f3bf70816f309065279c8bd7d0fbda6e331e4`.

Первый запрос по предполагаемому `boundary=administrative/admin_level=8` вернул пустой набор и был отклонён; он не кэшировался и не импортировался. После одного metadata GET официального OSM API для relation/3339993 запрос исправлен. Автоматических retry, bbox stitching или запросов отдельных POI не было.

Набор неполный, не подтверждает действующий статус бизнеса и точность OSM. Имена отсутствуют у390 выбранных объектов: они отклонены, а не названы выдуманными именами. Нет разрешённых рейтингов/отзывов/фото; они не импортируются. Полная инструкция и ограничения: `docs/IMPORT.md`.
