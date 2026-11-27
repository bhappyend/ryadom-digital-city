# Локальные GIS-сервисы Смоленска

Задача06.1, режим local-only. Это отдельный Compose project `ryadom-gis`, не замена Next/Nest/PostGIS и не production deployment. `compose.yaml`, существующие DB/Redis, приложения и root env не изменяются.

## Запуск и повторный запуск

Требования: работающий Docker Desktop Linux/WSL2, Node22.22.2, зависимости общего репозитория (`tsx`, GIS06 и types); установка root зависимостей принадлежит интегратору17. Для команд ниже cwd: `C:/Users/tihoyo/Documents/ChatGPT/Рядом - PV`.

```powershell
node infra/gis/start.mjs
node --import tsx infra/gis/smoke.mts
```

`start.mjs` остаётся foreground владельцем, выводит checkpoint каждые30 секунд и запускает Valhalla → tilemaker → Nominatim → tiles последовательно. Все контейнеры имеют project label `ryadom-gis`, лимиты памяти/CPU/PID и bounded local logs. Таймауты ожидания30/30/60/2 минуты; по истечении процесс сообщает ошибку, сохраняет контейнеры и данные. Повторяется та же команда, без удаления volumes. Длительные шаги не маскируются фоновым заданием. Проверять конкретные стадии:

```powershell
docker compose -p ryadom-gis -f compose.gis.yaml --profile build --profile geocoder --profile tiles ps --all
docker compose -p ryadom-gis -f compose.gis.yaml logs --tail 30 valhalla
docker compose -p ryadom-gis -f compose.gis.yaml logs --tail 30 nominatim
docker logs --tail 10 ryadom-gis-tilemaker-1
```

Остановка только этих runtime сервисов без удаления данных:

```powershell
docker compose -p ryadom-gis -f compose.gis.yaml --profile geocoder --profile tiles stop valhalla nominatim tiles
```

Не использовать `down -v`, prune или `--remove-orphans`: в общем Docker есть чужие проекты. Оставлен собственный failed container `ryadom-gis-tilemaker-build` от первой проверки strict integrity; orphan warning про него ожидаем и не означает сбой сервиса.

## Источники, версии и контроль данных

`infra/gis/source.lock.json` фиксирует OSM France Smolensk oblast snapshot: 44,088,273 байта (<150MiB), timestamp2026-11-25T00:06:47Z, replication sequence7387177. MD5 `b06a09374bdac2f0d9354eaf9e1c4a41` сверен с [опубликованным checksum](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast.osm.pbf.md5); SHA256 `cc44d9cc4ddc46b26ff2eeafa430a3add9f18b6f2fd25041574c59189346b3b2` рассчитан локально. [PBF](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast-latest.osm.pbf), [state](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast.state.txt), [индекс источника](https://download.openstreetmap.fr/extracts/russia/central_federal_district/).

`download.mjs` проверяет готовый файл, скачивает максимум150MiB в `.part`, проверяет hash перед atomic rename; другой upstream checksum требует явного пересмотра lock, молча новый snapshot не принимается. Если upstream latest уже обновлён, нужен сохранённый файл с этим checksum либо осознанное обновление snapshot и всех stores. Чужие raw files не модифицируются. Повторная загрузка прерванного файла начинается заново; `.part` никогда не используется сервисами.

| Компонент | Pinned image index digest | Источник и лицензия |
|---|---|---|
| Valhalla3.9.3-4d8b2061b | `ghcr.io/valhalla/valhalla-scripted@sha256:ef30a71658c1b372d301153c35cf31fccaf90d817e7815d12200b6354fb4f805` | [upstream Docker README](https://github.com/valhalla/valhalla/blob/master/docker/README.md), [MIT](https://github.com/valhalla/valhalla/blob/master/COPYING) |
| Nominatim5.3.3 / PostgreSQL16.15 / PostGIS3.4 | `mediagis/nominatim@sha256:168c30e20fbba0c2e8199fca7a8aa2640e8cc1a62f8b05b1958897796fdb38f1` | [container source/howto](https://github.com/mediagis/nominatim-docker/blob/master/howto.md), wrapper CC0; Nominatim GPL2+, bundled components retain licenses |
| tilemaker3.2.0, revision12bf56004e4109e340bac87b3314413153316965 | `ghcr.io/systemed/tilemaker@sha256:71f65be841445a69bae9bbb1fd30cd2809686d705d3f47682508f8a33851d51c` | [source](https://github.com/systemed/tilemaker), [license](https://github.com/systemed/tilemaker/blob/12bf56004e4109e340bac87b3314413153316965/LICENCE.txt); copied LICENSE kept locally |
| Node22.22.2-alpine | `node@sha256:8ea2348b068a9544dae7317b4f3aafcdc032df1647bb7d768a05a5cad1a7683f` | [official image source](https://github.com/nodejs/docker-node), Node MIT and bundled licenses |

OSM data uses [ODbL1.0](https://opendatacommons.org/licenses/odbl/1-0/), attribution [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright). Map attribution also names OpenMapTiles schema. Every display must preserve visible attribution. Commercial deployment/license compliance remains a separate review; these open-source local services require no paid account or API key.

Tilemaker uses explicit OpenMapTiles Lua/profile from the pinned source, **not its Protomaps default**. The JSON omits `ocean`, `urban_areas`, `ice_shelf`, `glacier` external shapefile layers. Smolensk is inland; OSM water polygons/waterways and OSM landcover remain real. No invented coast/water geometry or global downloads. Profile settings source maxzoom14; client overzooms to20.

All256 BMP font ranges from [openmaptiles/fonts gh-pages revision025ff2b2f84cc0fdf11f7b1d74b3a784595fe7a4](https://github.com/openmaptiles/fonts/tree/025ff2b2f84cc0fdf11f7b1d74b3a784595fe7a4/Klokantech%20Noto%20Sans%20Regular) are downloaded once and served locally under alias `Noto Sans Regular`. Original font is Klokantech Noto Sans Regular; [SIL OFL1.1](https://github.com/openmaptiles/fonts/blob/d48c5fce2fc58b55c98d353558d807cac45e7262/noto-sans/LICENSE) copied to `FONT-LICENSE.txt`. `runtime/glyphs-source.json` records individual SHA256. The glyph file internal font name is retained; alias is only URL/font stack provisioning. No webfont license or public glyph endpoint is assumed.

## Endpoints для04/17

| Сервис | Base URL / paths | Доступ |
|---|---|---|
| Valhalla | `http://127.0.0.1:8002`, POST `/route`, GET `/status` | server-only selfhost adapter |
| Nominatim | `http://127.0.0.1:8088`, GET `/search`, GET `/status?format=json` | server-only selfhost adapter |
| Tiles | `http://127.0.0.1:8089/tiles/{z}/{x}/{y}.pbf`, `/tiles.json` | browser/public OSM data |
| Style | `http://127.0.0.1:8089/style.json` | GIS06 `createDarkMapStyle` output |
| Glyphs | `http://127.0.0.1:8089/glyphs/{fontstack}/{range}.pbf` | fontstack=`Noto Sans Regular`, encoded spaces |

Значения для локального API (записывает владелец root env17):

```dotenv
GEOCODER_PROVIDER=nominatim
NOMINATIM_URL=http://127.0.0.1:8088
VALHALLA_URL=http://127.0.0.1:8002
GIS_ALLOWED_ORIGINS=http://127.0.0.1:8088,http://127.0.0.1:8002
GIS_ALLOW_HTTP=true
GIS_USER_AGENT=Ryadom-Patchvale/0.1 (https://vk.ru/patchvale)
GIS_TIMEOUT_MS=5000
MAP_STYLE_URL=http://127.0.0.1:8089/style.json
MAP_ALLOWED_ORIGINS=http://127.0.0.1:8089
MAP_ALLOW_HTTP=true
MAP_ATTRIBUTION=© OpenStreetMap contributors (ODbL 1.0) · © OpenMapTiles
```

Эти URL для API, запущенного на Windows host. `127.0.0.1` внутри контейнера относится к самому контейнеру: контейнеризированному API потребуется отдельное согласованное подключение к сети/host gateway, не молчаливая подмена URL. Сеть только GIS project; опубликованные ports bind127.0.0.1. Подключение со смартфона через LAN этими настройками не предоставлено.

Frontend CSP connect-src должен разрешать exact `http://127.0.0.1:8089`. Tiles CORS допускает только `http://localhost:3000` и `http://127.0.0.1:3000`. HTTP — явно разрешённый локальный режим; для внешнего сервиса нужны HTTPS, authentication/network isolation по назначению, rate limits и production operations. Сервер tiles не proxy: не принимает URLs, query, пути файлов или SQL. SQLite read-only, parameterized tile lookup, z/x/y bounds, read-only nonroot container/cap_drop, no-new-privileges. Никаких private/API/geolocation cache responses он не обслуживает.

## Ресурсы и checkpoint

Фактически на старте: host RAM7.92GiB, free0.925GiB; Docker3.786GiB /12CPU; SSD212GiB free. Плановые hard limits: Valhalla1400MiB/2CPU/1worker, tilemaker1400MiB/2CPU/1thread, Nominatim1600MiB/2CPU/1thread/1API worker +256MB osm2pgsql cache, tiles192MiB/1CPU. Одновременные hard limits не являются резервированием доступной памяти; строить последовательно, наблюдать фактическое usage. Nominatim default10GB maintenance memory заменена256MB. Ни host/WSL/security/BIOS, ни чужие контейнеры не менялись.

Raw/tiles/graphs/fonts в ignored `infra/gis/runtime/`; Nominatim DB — persistent named volume `ryadom-gis_nominatim-db`. Valhalla сохраняет hash/graph checkpoint; tilemaker сначала пишет `smolensk-building.mbtiles`, публикует только после exit0 и сохраняет fingerprint входа/profile/Lua/build script. Прерванный mbtiles переименовывается в собственном runtime, не раздаётся. При смене source digest пересоздание графа должно проверяться; старый source не заменяется автоматически. Nominatim `import-finished` checkpoint пропускает готовый import; прерванный initial import upstream перезапускает **собственную** nominatim DB, не DB проекта. Не изменять источник поверх готового Nominatim volume без процедуры reimport.

Локальный Nominatim password генерируется в ignored runtime, подаётся Docker secret; его содержимое и env не выводятся. Wrapper запускает pinned upstream startup scripts без xtrace, который иначе мог бы напечатать пароль. PostgreSQL port Nominatim не публикуется. Это локальная инфраструктура с внутренним upstream provisioning superuser, не production least-privilege deployment.

Первые strict tilemaker checks обнаружили missing node458446824 у way83046336; для региональной обрезки применён [документированный `--skip-integrity`](https://github.com/systemed/tilemaker/blob/master/docs/RUNNING.md). Он не восстанавливает утраченные геометрии. `check-extract.py` измеряет missing way-node refs и пересечение известных bounds с пилотом; `smoke.mts` независимо проверяет25 реальных центральных MVT, inland water polygons, schema keys, кириллицу и routing. Полнота relation membership и покрытия всей области не подразумевается.

Проверки, actual RAM/disk, counts и оставшиеся ограничения публикуются в `docs/HANDOFFS/06.1.md`; machine-readable evidence — ignored `infra/gis/evidence/`. Эта задача не выполняет визуальную browser/UI приёмку, PWA и production load/security audit. Они остаются у03/14/17.

### Финальная проверка06.1

Selfhost geocode8088, router8002 и tiles8089 healthy, live-smoke PASS (см. handoff06.1). Lua profile адаптирован: preferred_language_attribute=name вместо upstream name:latin для точного соответствия генератору GIS06. CC-BY4.0 attribution OpenMapTiles из заголовка Lua сохраняется. Областной extract:1 incomplete way/5 missing refs вне пилота, подтверждено сканированием6.77M nodes/442979 ways; relation completeness не проверена. Финальные тайлы67,633,152 bytes. Nominatim import~8m18s, peak1600MiB/безOOM; raw/graphs/tiles/fonts runtime162.2MiB + DB2.0GiB + unpacked images~2.52GiB. Browser/UI приёмка отдельно.
