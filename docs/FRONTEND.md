# Frontend03 — этап 1

Next16.4.6 / React19.3.1, strict TypeScript6, MapLibre6.19.0. Sites skill применён в local-only workflow, исходный Next/Nest/PostGIS стек сохранён. UI берётся из @ryadom/ui, taxonomy/DTO/runtime validation из @ryadom/types. Исходные материалы не изменены.

## Запуск и конфигурация

Установка/lock принадлежат интегратору17. Из корня: `npm run build:shared`, `npm run dev:web`. API_URL — серверный HTTP(S) origin без path/credentials, по умолчанию http://127.0.0.1:3001. SSR использует его напрямую, browser только same-origin /api/v1 через Next rewrite. Секреты не передаются через NEXT_PUBLIC.

WEB_MAP_CONNECT_ORIGINS — comma-separated публичные origins style/tile/glyph для production CSP; локальный GIS требует http://127.0.0.1:8089. В dev8089 разрешён. MapLibre worker6.19.0 поставлен byte-for-byte из dependency в public/vendor с BSD license; при обновлении MapLibre нужно обновить оба worker pathname/version и vendored file. Worker не зависит от CDN и не кэшируется PWA.

## Маршруты и взаимодействия

- `/`: исходный hero, 14 категорий, QuickSearch, how-to, явно декоративная motion scene08, реальные nearby/stats/reviews API или честный empty/error, business/PWA/about/FAQ/footer.
- `/map`: города API, geocode с явным выбором результата, click-only location consent, карта/list selection, bounded20/page и100pages, radius300..10000, category/openNow/accessibility/rating. Origin не подменяется центром города. Нажатие свободной карты выбирает origin. Кластеры MapLibre, доступные DOM marker buttons, cancellation и12s timeout.
- `place` query — validated slug карточки назначения, передаётся из `/places/[slug]`, не подменяет origin. Маршрут только POST API, настоящая GeoJSON/маневры/time/distance; отказ без поддельной линии.
- `/places/[slug]`: runtime validated Place, source/license/timestamps, legal photo attribution или отсутствие фото, safe phone/site, share clipboard/manual fallback, local-only favorites, report consent10..2000 chars и успех только по реальному receipt.
- `/categories`, `/about`, `/sources`, `/privacy`, `/terms`, `/reviews`: содержательные информационные страницы. Юридические тексты прямо обозначают подготовку окончательной политики.
- `/business`, `/business/add`, `/business/pricing`, `/business/dashboard`: публичная информация о будущем этапе, без fake submissions/кабинета/цен/оплат. Стартовый открытый каталог не является подтверждённой платной анкетой владельца.
- `/login` и `/admin`: временное объяснение отсутствующего auth. Владелец этапа2 должен заменить их реальными guarded routes; никаких логин-форм или fake session нет.

## Интеграции и ограничения

PwaRegistration09 один раз в root layout; InstallButton в desktop/mobile header и home. Motion08 enhancer/scenery прямо импортированы в server home; исходные DOM hooks сохранены. SEO16 root/home/map helpers подключены, robots/sitemap принадлежат16; detail metadata/schema integration ещё требует финального подключения после build slot. Индексация закрыта по умолчанию.

CSP ограничивает default/object/base/frame/form/connect/worker. Production script-src всё ещё unsafe-inline для Next bootstrap; nonce hardening не выполнен. В production нет unsafe-eval. API no-store, no unrestricted fetch destination, abort/timeout, strict envelope validation, ошибки инфраструктуры не выводятся посетителю. Фотографии только из DTO с attribution/license, referrerPolicy no-referrer.

Responsive CSS рассчитан на360/390/768/1024/1440/1920, safe areas, keyboard focus/menu trap/Escape, reduced motion. Реальные браузерные доказательства, contrast/overflow/axe/performance принадлежат QA14: CSS review не выдаётся за их прохождение. Собственный CUA обнаружил отсутствие доступных browsers и iab unavailable. Координатор00 сообщил hero contrast/worker issues; внесены dark scrim и explicit same-origin worker, повтор browser render ещё требуется.

Business update: monthly placement is available for personal discussion via canonical founder VK/TG links. Price/payment/renewal agreed manually, no automatic charges or online checkout; contact-link click is not payment/subscription/publication. Verify with node apps/web/scripts/verify-business.mjs (4 SSR variants).

