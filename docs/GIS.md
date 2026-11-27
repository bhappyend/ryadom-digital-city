# GIS «Рядом»: адаптеры, карта и локальный пилот

Владелец: задача06; 2026-11-27. Стек Next/Nest/PostGIS сохраняется. Skills: полностью прочитан Sites, выбран local-only; специальных GIS/security/anti-slop Skills нет. Категории: GIS/backend/API, архитектура, безопасность, производительность, визуальный стиль, accessibility, testing, документация. Изменения ограничены `packages/gis/**`, этим файлом и handoff06; исходные Assets не меняются.

## Фактический статус

- `@ryadom/gis` содержит Node22 native-fetch Nominatim/Valhalla адаптеры, декодер polyline5/6 и browser-safe OpenMapTiles dark style generator.
- Используются общие DTO `@ryadom/types`, контракт1.0.0 и `docs/ARCHITECTURE.md`: mode `walking|cycling|driving`, `{lon,lat}`, GeoJSON `[lon,lat]`, bbox `[west,south,east,north]`, метры/секунды.
- Конфигурации провайдеров по умолчанию нет. Публичные demo URL не подставляются. Отказ маршрутизатора не создаёт прямую линию. Пустой успешный geocode — `items=[]`; ошибки провайдера не маскируются пустой выдачей.
- Docker engine уже доступен по сообщению15; отдельная06.1 владеет реальным GIS provisioning. В момент публикации документа сервисы Nominatim/Valhalla/тайлы здесь ещё не проверены. Генератор style не подтверждает доступность HTTP-источников.
- Каталог организаций, API HTTP endpoints, CSP/CORS, карта React/MapLibre и ограничения запросов принадлежат другим задачам. Готовность полного сценария «адрес→кафе→маршрут» этим пакетом не заявляется.

## Серверная интеграция / exact env

Пакет принимает объекты конфигурации; сам не читает `process.env` и не попадает в frontend через map subpath. Предлагаемое отображение deployment env в API (канонические root `.env.example`/инфраструктура принадлежат01/15; при их отличиях согласовать через00):

| Переменная | Назначение / значение по умолчанию |
|---|---|
| `NOMINATIM_URL` | Необязательный фиксированный base URL self-hosted Nominatim, например `http://nominatim:8080`; без `/search`, query/fragment/credentials |
| `VALHALLA_URL` | Необязательный base URL self-hosted Valhalla, например `http://valhalla:8002`; без `/route` |
| `GIS_ALLOWED_ORIGINS` | Разделённый запятыми список **точных** canonical origins; например `http://nominatim:8080,http://valhalla:8002`. Пусто → запросы запрещены |
| `GIS_ALLOW_HTTP` | Только строка `true` разрешает явно allowlisted HTTP для локальной сети; default `false`, production HTTPS |
| `GIS_USER_AGENT` | Обязательный идентификатор приложения ASCII10..256, реальный контакт/сайт оператора; пример `Ryadom-Patchvale/0.1 (https://vk.ru/patchvale)` |
| `GIS_TIMEOUT_MS` | Предлагаемый env; package option timeoutMs default5000, integer10..30000. Текущий API фиксирует5000 и env пока не читает |
| `GIS_MAX_RESPONSE_BYTES` | Предлагаемый env; package option default1048576, integer256..4194304. Текущий API фиксирует4194304 и env пока не читает |

```ts
import { NominatimGeocoder, ValhallaRouter, ProviderUnavailable, toProviderState } from '@ryadom/gis';
const shared = {
  allowedOrigins: ['http://nominatim:8080', 'http://valhalla:8002'],
  allowHttp: true, // only for this explicit private local deployment
  userAgent: 'Ryadom-Patchvale/0.1 (https://vk.ru/patchvale)',
  timeoutMs: 5000,
};
const geocoder = new NominatimGeocoder({ ...shared, baseUrl: 'http://nominatim:8080' });
const router = new ValhallaRouter({ ...shared, baseUrl: 'http://valhalla:8002' });
// city: verified enabled City from repository; signal: HTTP client disconnect cancellation.
// await geocoder.search(q, city, signal);
// await router.route(validatedRouteRequest, signal);
// catch ProviderUnavailable => toProviderState(error) => shared API error envelope.
```

`ProviderUnavailable` — исключение адаптера с безопасными `provider`, `reason`, необязательным upstream `httpStatus`. `toProviderState` преобразует его в DTO `provider:geocoder|router`, `reason:not_configured|disabled|timeout|upstream_error|coverage_missing`. `InvalidGisInput` →400. Отмена клиента (`cancelled`) позволяет API завершить обработку без записи тела в закрытое соединение. No-route без геометрии никогда не success; API должен выбрать404 для подтверждённого отсутствия маршрута,503 для отказа зависимости. Valhalla HTTP400 с bounded JSON `error_code:442` преобразуется в `no_route`; остальные HTTP400 остаются `http_error`, без раскрытия upstream body/message.

### Границы безопасности и приватности

URL берётся только из deployment configuration; никакой URL из HTTP query/body не передаётся адаптеру. Exact origin, фиксированный endpoint, запрет credentials/query/fragment/backslash, protocol allowlist, `redirect:error`; тестируются host suffix/userinfo/port/metadata spoofing. HTTP разрешён только явно. Public `nominatim.openstreetmap.org` запрещён адаптером даже при allowlist; ручная проверка ниже выполнена отдельно.

Allowlist — доверенная операторская конфигурация, **не** DNS firewall: свой сервис может намеренно жить в private network. В production ограничить egress на уровне сети, закрепить доверенные DNS/hosts, закрыть metadata endpoint и произвольные сервисы; не позволять пользователям менять env/allowlist. Пакет не обещает защиту от компрометации allowlisted сервиса или DNS.

Один таймер охватывает headers и чтение body; входной AbortSignal отменяет native fetch. Ответы ограничены по Content-Length и фактическим streamed bytes, JSON content-type, UTF-8/JSON syntax, количеству результатов/точек/манёвров, диапазонам и city bbox. Redirect и retry отсутствуют. Тела upstream/адреса/точные координаты не входят в ошибки. API не должен логировать q/body или сохранять историю перемещений. Нужны API rate limits из ARCHITECTURE и bounded concurrency на уровне сервиса; пакет их не заменяет.

`normalizeGeocodeQuery` выполняет NFKC, trim, свёртку пробелов, длину3..200; `geocodeCacheKey(q,city)` включает city bounds и язык, сохраняет регистр. Сам кэш не создаётся. Если оператор добавляет shared server cache, namespace должен включать configured provider/dataset version, ограничить TTL/entries и оценить privacy адресов; не кэшировать API/geolocation в PWA. Клиентские и provider fetch используют no-store. `sourceUpdatedAt:null` честно означает отсутствие source dataset timestamp в Nominatim search, `importedAt` — момент получения, а не обновления OSM.

## Реальная карта / frontend

`@ryadom/gis/map` — чистый frontend export, type-only зависимости, без Node/http/env. `createDarkMapStyle` возвращает MapLibre `StyleSpecification`; `getMapPresentation()` без ресурсов возвращает общий `unavailable/not_configured`. Генератор проверяет конфигурацию; загрузку и ошибки actual tile/glyph HTTP проверяет MapLibre/UI.

| Public параметр / env для consuming frontend | Назначение |
|---|---|
| `NEXT_PUBLIC_MAP_TILE_URL` | MVT path template `https://maps.<your-domain>/smolensk/{z}/{x}/{y}.pbf`; не TileJSON URL |
| `NEXT_PUBLIC_MAP_GLYPHS_URL` | Собственные легально поставленные glyph PBF `https://maps.<your-domain>/fonts/{fontstack}/{range}.pbf` |
| `NEXT_PUBLIC_MAP_ALLOWED_ORIGINS` | Exact origins ресурсов, запятые; никакого wildcard |
| `NEXT_PUBLIC_MAP_ALLOW_HTTP` | Explicit `true` только для localhost preview, defaultfalse |
| `MAP_STYLE_URL` | API `/map/config`: абсолютный URL опубликованного JSON результата генератора либо согласованного style endpoint; не URL декоративного SVG |
| `MAP_ALLOWED_ORIGINS` | Серверный allowlist style URL; frontend может иметь отдельные tile/glyph origins |

Переменные frontend — документированное отображение параметров, package автоматически их не читает. Не помещать private keys в `NEXT_PUBLIC_*` или style. Ресурсы с query keys здесь не поддержаны; для licensed provider с browser-public key нужен отдельно согласованный adapter/CSP. Собственный style JSON должен создаваться владельцем API/сборки из той же конфигурации и обслуживаться с корректным content-type/CORS. До его публикации API MapConfig остаётся unavailable.

```ts
import { getMapPresentation } from '@ryadom/gis/map';
const presentation = getMapPresentation({
  tileUrl: 'https://maps.example.test/smolensk/{z}/{x}/{y}.pbf',
  glyphsUrl: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf',
  allowedOrigins: ['https://maps.example.test'],
});
// .example.test is illustrative and deliberately not a working/default provider.
// On available: new maplibregl.Map({container, style: presentation.style, ...verifiedCityCamera});
// Keep attributionControl enabled, and handle MapLibre error/load events in the UI.
```

Стиль основан на фактических source-layer `water`, `waterway`, `building`, `transportation`, `transportation_name`, `landcover`, `park`, `place`, `housenumber` и полях `class`, `name:ru`, `name`, `housenumber`. Нельзя подставлять Shortbread/Protomaps tiles: у них другая схема. Проверить metadata `vector_layers` конкретного tileset перед подключением. OpenMapTiles схема и её Java implementation описаны в [schema](https://openmaptiles.org/docs/schema/) и [Planetiler OpenMapTiles](https://github.com/openmaptiles/planetiler-openmaptiles).

Палитра строго из оригинала: `map-water #0D4355`, `map-road #2B424D`, `map-building #193440`, фон `#061217`, текст `#F4F9FA`. Без градиентов/свечения/фиктивных POI и route. Нативный source maxzoom14 с overzoom до20. Русские названия предпочитаются, text labels14px+, halo. Glyph server обязан включать Cyrillic для выбранного `Noto Sans Regular`; этот пакет не содержит лицензированного font binary и не утверждает наличие glyphs. Можно выбрать свой fontStack с правами на распространение.

Источник всегда задаёт видимую attribution [OpenStreetMap](https://www.openstreetmap.org/copyright) и [OpenMapTiles](https://openmaptiles.org/). Не отключать attribution control и не перекрывать его bottom sheet, включая360px. Дополнительные права провайдера добавляет интегратор. Публичные OSM raster tile servers не являются default; их [usage policy](https://operations.osmfoundation.org/policies/tiles/) запрещает bulk/prefetch. Style generator не делает внешний запрос; browser QA размеров/клавиатуры/контраста и реального рендера выполняется при интеграции frontend, а не заменяется unit-тестом JSON.

## Проверенный контрольный адрес

Точного адреса в пользовательском задании нет. Для технической проверки выбран **Смоленск, улица Ленина, 8**: [официальная страница исторического музея](https://www.smolensk-museum.ru/catalog/istoricheskiy_muzey/) указывает этот адрес. Не импортировали фото/контакты/отзывы музея.

Сделан **ровно один** ручной HTTP GET к public Nominatim с идентифицирующим User-Agent `Ryadom-Patchvale/0.1 (manual single address verification; https://vk.ru/patchvale)`, timeout15s, redirect forbidden, `format=jsonv2&limit=1&addressdetails=1&countrycodes=ru&accept-language=ru`, `q=Россия, Смоленск, улица Ленина, 8`.

Ответ получен **2026-11-26T23:16:58.972Z / 2026-11-27 02:16:58.972 Europe/Moscow**, HTTP200. Source [Nominatim search](https://nominatim.openstreetmap.org/search?q=%D0%A0%D0%BE%D1%81%D1%81%D0%B8%D1%8F%2C%20%D0%A1%D0%BC%D0%BE%D0%BB%D0%B5%D0%BD%D1%81%D0%BA%2C%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%20%D0%9B%D0%B5%D0%BD%D0%B8%D0%BD%D0%B0%2C%208&format=jsonv2&limit=1&addressdetails=1&countrycodes=ru&accept-language=ru), OSM [way99066474](https://www.openstreetmap.org/way/99066474), category `building`, type `yes`.

- lat `54.7823535`, lon `32.0499850`; GeoJSON `[32.0499850,54.7823535]`.
- Nominatim bbox `[south,north,west,east]`: `[54.7822094,54.7824433,32.0496577,32.0503182]`.
- Нормализованный bbox: `[32.0496577,54.7822094,32.0503182,54.7824433]`.
- Полученная лицензия: ODbL1.0, OpenStreetMap contributors. Это реальный ответ об адресе здания, не проверка ближайших кафе/маршрута/точности входа. Source object timestamp ответ не содержал.

[Public Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) прочитана перед запросом: максимум1req/s суммарно, идентификация, attribution, нельзя autocomplete/systematic extraction. Данный ручной запрос не подключает сервис в приложение. Не повторять его автоматически при тестах/CI, не отправлять приватные адреса; production — собственный либо лицензированный geocoder. [Nominatim Search API](https://nominatim.org/release-docs/latest/api/Search/) — основание для fixed `/search`, bbox/viewbox, bounded и hard country filter.

## Воспроизводимый малый локальный пилот

Provisioning владелец06.1, Docker/ресурсы15; этот раздел — проверенная схема запуска, команды импортов **ещё не выполнялись в06**. Не скачивать Россию/планету. Достаточен региональный Smolensk extract, чтобы сохранить connectivity вокруг города без искусственного обрыва маршрутов на городской bbox.

1. Источник [официальный индекс OSM France](https://download.openstreetmap.fr/extracts/russia/central_federal_district/): [smolensk_oblast-latest.osm.pbf](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast-latest.osm.pbf), показано42M, mtime25-Nov-2026 00:09 при исследовании. Sidecars: [MD5](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast.osm.pbf.md5), [replication state](https://download.openstreetmap.fr/extracts/russia/central_federal_district/smolensk_oblast.state.txt). Эти ссылки изменяемые. В06 PBF не скачан, checksum не вычислен, dataset state не прочитан. После загрузки06.1 должен зафиксировать UTC fetch timestamp, content SHA256, sidecars и osmium header timestamp в provenance/отчёте; при обновлении повторить атомарно. Для настоящей воспроизводимости хранить разрешённый snapshot по SHA256.
2. Лицензия данных [OSM ODbL](https://www.openstreetmap.org/copyright), attribution/доступ к лицензии обязательны; derivative database distribution оценить по ODbL. Не смешивать нелицензированные фото/отзывы. Каталог импортирует07 с собственной provenance; geocoder/tiles/router — отдельные data stores.
3. Опциональный городской bbox extract `[31.85,54.65,32.25,54.9]` — **инженерный envelope**, не утверждение о границе города/координатах адреса. Предпочтительно оставить42MB область для маршрутов. [osmium extract](https://docs.osmcode.org/osmium/latest/osmium-extract.html): `osmium extract -b 31.85,54.65,32.25,54.9 -s complete_ways smolensk_oblast.osm.pbf -o smolensk-city.osm.pbf`. complete_ways сохраняет nodes дорог, но не полные все relations; для сложных multipolygon/restrictions нужен smart и проверка references. `osmium fileinfo -e` и `osmium check-refs` записать в отчёт; bbox уменьшает покрытие и не обещает корректность маршрутов у края.
4. Собственный Nominatim: отдельный PostgreSQL/PostGIS store/роль, не application catalog DB. После установки pinned Nominatim по [официальному import guide](https://nominatim.org/release-docs/latest/admin/Import/) в отдельном project dir: `nominatim import --osm-file /data/smolensk_oblast.osm.pbf --threads 2`. Не создавать planet flatnode file для малого extract. Settings/version/image digest и locale фиксирует06.1. Private API обслуживает `/search`; никаких обращений к public Nominatim из приложения.
5. Собственный Valhalla: [официальные build/run instructions](https://valhalla.github.io/valhalla/building/) и [Mjolnir guide](https://valhalla.github.io/valhalla/mjolnir/getting_started_guide/). В изолированном data dir: `valhalla_build_config --mjolnir-tile-dir /data/tiles --mjolnir-tile-extract /data/tiles.tar > /data/valhalla.json`, затем `valhalla_build_tiles -c /data/valhalla.json /data/smolensk_oblast.osm.pbf`, `valhalla_build_extract -c /data/valhalla.json`, `valhalla_service /data/valhalla.json 1`. Нужны timezone/admin data для соответствующих rules; не включать transit/traffic/elevation без источников. Версию graph builder и server держать одинаковой. Проверка route использует two break locations, `pedestrian|bicycle|auto`; стандартный Valhalla JSON отдаёт polyline6 и km, преобразуемые в GeoJSON/метры по [Route API](https://valhalla.github.io/valhalla/api/route/api-reference/).
6. Tiles: использовать именно [OpenMapTiles Java profile](https://github.com/openmaptiles/planetiler-openmaptiles), закрепив image digest/build version, а не произвольный Planetiler default/Protomaps profile. Пример аргументов образа: `--osm-path=/data/smolensk_oblast.osm.pbf --output=/data/smolensk.mbtiles --download`; проверить `--help` закреплённого release и ограничить concurrency/heap. `--download` получает дополнительные water/NaturalEarth assets, не является разрешением загрузить planet. Их URL/license/version тоже сохранить. [Planetiler](https://github.com/onthegomap/planetiler) документирует input path/MBTiles и минимум SSD1GB+5–10×PBF. Выходной metadata `vector_layers` должен совпасть с source-layer выше; MBTiles подать через Martin/TileServer GL на private-backed HTTPS/CORS endpoint. У серверов могут быть пути без `.pbf`: template задать фактический. При отсутствии glyphs/tiles карта остаётся unavailable.

Плановый budget, **не измеренный benchmark**: PBF~42MB;4CPU,8GiB RAM,20GiB свободного SSD — разумная стартовая квота для поочерёдного построения трёх stores, с отдельным контролем RAM/диска. Для Nominatim начать2 import threads, Planetiler heap1–2GiB и1–2 workers, Valhalla build concurrency1–2. Дополнительные water/font datasets могут быть больше PBF. Текущий Docker budget3.8GiB (сообщение15) означает sequential jobs, остановку ненужных сервисов и фактические измерения; этот объём не гарантирует одновременную работу full stack. При OOM не переключать приложение на public unlimited API; уменьшить нагрузку/покрытие или согласовать ресурсы. Записать actual duration/peak RSS/disk/image digests в06.1. В06 никаких тяжёлых downloads/imports/инфраструктурных изменений нет.

## Проверки и оставшаяся приёмка

Пакетные тесты: canonical polyline5, polyline6 negative/zero/extreme coordinates, malformed/oversized geometry; coordinate/bbox order; city bounds/empty provider data; three mode mappings; km→m/maneuver indices; invalid JSON/HTTP/content-type/size; spoof URL/redirect/network errors; native timeout during body and client abort; реальный MapLibre style validator, palette/source schema/attribution/not_configured. Итоговые команды/результаты фиксируются в `docs/HANDOFFS/06.md` после controlled root dependency install.

Нужна дальнейшая интеграционная проверка на реальных локальных сервисах: адрес выше геокодируется self-hosted, nearby кафе берётся из разрешённого каталога07, Valhalla строит фактическую линию с временем/длиной/манёврами для трёх режимов; отказ сервиса честно отображается, attribution видна, тайлы/кириллица действительно загружаются, responsive/keyboard/contrast/reduced-motion проверены владельцем UI. Unit fixtures не являются источником данных и не должны попасть в seed/API.
