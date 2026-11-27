# Приёмка этапа 1 — наблюдаемые доказательства

Этот документ принадлежит координатору00. Требования не считаются выполненными по наличию исходного кода; PASS требует фактического результата из handoff/тестового отчёта. Fixtures и mock failure tests отдельно от live-приёмки. Полный продукт включает ещё этапы2/3 MASTER-PROMPT.

| Область | Критерий | Владелец доказательства |
|---|---|---|
| Источники | Все 72 оригинальных Assets совпадают SHA256; SVG без active/external content; шрифт локально с OFL и кириллицей; фото/аватары макета не используются | 02 |
| Дизайн | Токены неизменны; hero живой HTML слева/исходный город справа; dark Digital City; основные CTA mint; референсная композиция и разнообразие секций | 02/03/14 |
| Главная | Заданная последовательность секций, поиск/14 категорий, how-to, явно декоративная map-demo, реальные places/stats/reviews либо честные состояния без фальшивых чисел | 03/14 |
| Контракты | Единые Zod DTO/OpenAPI, строгие scalar query, неизвестные поля/invalid boolean/coordinate/radius отклоняются, defaults корректно optional | 01/04 |
| Данные | Разрешённый OSM snapshot/source/license/hash/timestamps, нормализация/карантин/дедуп; повторный импорт сохраняет количество и ID; нет fabricated seed POI | 05/07 |
| Геопоиск | Реальные geography(Point,4326), GiST, ST_DWithin/ST_Distance, category/text/radius/openNow/accessibility/rating, stable pagination/count; negative injection/timeout tests | 05/04 |
| Адрес | Пользователь вводит существующий адрес, собственный/лицензированный geocoder возвращает координаты; контрольный адрес ул.Ленина8 не заменяет полноценный провайдер | 06/06.1/14 |
| Карта | Настоящие vector tiles с проверенной схемой и кириллическими glyphs, корректная OSM/схема attribution, синхронизация результатов/маркеров, controls, выбор origin, mobile sheet | 06/06.1/03/14 |
| Маршрут | Реальные Valhalla geometry/maneuvers/time/distance для walking/cycling/driving; невозможный маршрут404, сбой503, retry; никаких straight-line подмен | 06/06.1/04/14 |
| Карточка | Адрес/координаты/источник/лицензия/дата, неизвестные поля неизвестны; phone/website/share/favorites; report202 только после durable DB write | 03/04/05/14 |
| UX отказов | Без геолокации, denied consent, пустая выдача, сбойAPI, недоступные map/geocoder/router, abort/stale requests, rate limit, offline | 03/04/09/14 |
| PWA | Manifest any/maskable/apple, HTTPS/localhost, install по действию и инструкции, offline fallback, bounded allowlisted static cache, update без reload loop, API/private/query никогда не cache | 09/14 |
| Motion | Sticky scrub presentation без scroll hijack, упрощённый mobile, reduced-motion/saveData, cleanup/no runaway rAF, достоверный CountUp либо отсутствие счётчика | 08/14 |
| Адаптивность | 360/390/768/1024/1440/1920 без overflow, safe-area, keyboard/Escape/focus return, accessible labels, проверка контраста/axe; manual ограничения явно | 03/14 |
| SEO | SSR metadata/canonical только валидный deployment origin, sitemap действующих public routes, staging robots, безопасный JSON-LD без выдуманных рейтингов | 16/03/14 |
| Performance | LCP<=2.5s/CLS<=0.1/INP<=200ms — только измеренные; лабораторные показатели отдельно от полевого INP, lazy map/code splitting, ограниченные списки | 03/08/14 |
| Security | SEC-01..13 с owner/evidence, bounded body/query/SQL/upstream/rates, exact CORS/Origin, SSRF/URL/XSS, секреты не frontend/log/cache, dependency/secret checks, least privilege | 13/04/05/14/17 |
| Воспроизводимость | Один npm lock, clean install/typecheck/tests/build, production Node-path, Docker healthchecks, DB/Redis auth, backup+restore прикладной схемы, CI config validation | 15/17 |
| Документация | README/env/миграции/import/OpenAPI/дизайн/GIS/PWA/security/интеграции и handoff каждого чата, фактические статусы и блокеры | все/00 |

## Сквозной live-сценарий

1. Запустить локальные DB/Redis/API/web и настроенные собственные GIS-сервисы по документации; применить миграции и проверенный OSM import.
2. Открыть `/`, ввести «Смоленск, улица Ленина, 8», выбрать «Кафе»; выбрать результат геокодирования, проверить nearest/cafe/source и фактическое расстояние.
3. Выбрать карточку и маркер, открыть `/places/<реальный slug>`, построить маршрут от выбранного адреса. Сверить линию/манёвры/единицы/attribution, проверить три режима без подмены координат.
4. Повторить ключевые действия на390px с клавиатурой и без геолокации; отдельно denied geolocation, пустая область и отказ router/API.
5. Сеть отключить: появляется доступная offline-заглушка; координаты/результаты/API/приватные страницы не попадают в Cache Storage. Обновление SW требует действия и не создаёт цикл reload.

Отсутствующий провайдер с корректным unavailable — PASS только для обработки отказа, **не** для успешной live-навигации. Доказательства и оставшиеся release gates фиксируются в `docs/QA-REPORT.md`, `docs/INTEGRATION.md`, `docs/PROJECT-STATUS.md`.
