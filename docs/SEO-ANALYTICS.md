# SEO и аналитика — этап 1

## Интеграция для frontend03

Задача16 владеет только `src/lib/seo/**`, `app/robots.ts`, `app/sitemap.ts` и этим документом. Layout/page интегрирует frontend03 после готовности helper API ниже. Исходные Assets и контракты не изменяются. Режим local-only, без публикации и отправки URL поисковикам.

Реализованный API:

- `@/lib/seo/metadata`: `createStaticMetadata('/')`, `createStaticMetadata('/map', { hasSearchParams: true })`, `createPlaceMetadata(place)`; вызывать только из Server Components / `generateMetadata`. Для `/map` в `generateMetadata` дождаться `searchParams` и передать `hasSearchParams: Object.keys(searchParams).length > 0`. Никогда не включать query/координаты/контакты в canonical, title или description.
- Root layout: собственные icons/manifest сохранить; не наследовать canonical главной на все страницы. Для главной helper вызывать в её page. Для layout использовать `createLayoutMetadata()` (без canonical).
- `@/lib/seo/structured-data`: `createWebsiteJsonLd()` только на главной; `createPlaceJsonLd(place)` и `createPlaceBreadcrumbJsonLd(place)` только на успешной SSR-карточке с тем же валидированным Place, что виден посетителю. `null` означает не рендерить script.
- `@/lib/seo/serialize`: в нативном `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />` использовать только сериализатор, не raw JSON.stringify. При CSP nonce использовать механизм frontend/security13. Не помещать script в Client Component.
- Ошибки API/404: не вызывать schema helper с fixtures/fallback. 404 должен оставаться 404. Никаких отзывов/рейтингов из демо.

Helpers реализованы в задаче16; этот документ не подтверждает исполненную frontend03 SSR-интеграцию. После подключения 03/17 должны проверить фактический HTML на `/`, `/map`, `/map?city=…`, существующей карточке, 404 и unavailable API. Проверить единственный canonical, meta robots, отсутствие raw query/геолокации, корректный script и CSP. Снимки экранов/адаптивность не применялись к задаче16: UI не изменён.

## Домен и управление индексацией

Все значения читает сервер, без `NEXT_PUBLIC_` и без доверия к Host/X-Forwarded-Host или посетительскому URL. Требуются настройки реального deployment от 00/15; задача16 не редактирует env/manifests и не назначает домен.

| Настройка | Результат по умолчанию / условие |
| --- | --- |
| `PUBLIC_SITE_URL` | Нет значения → нет canonical/OG URL, пустой sitemap, Disallow `/`. Только доверенный HTTPS origin без пути, query, hash, credentials, IP, зарезервированных example/test/local доменов и нестандартного production порта. Владение/назначение домена подтверждается эксплуатационно, не синтаксическим валидатором. |
| `SITE_ENVIRONMENT` | Только точное `production` вместе с `NODE_ENV=production` допускает индексацию. Staging, dev и отсутствие значения закрыты. |
| `SEO_INDEXING_ENABLED` | Только точное `true` после проверки домена и приёмки включает индексацию. По умолчанию закрыто. |
| `SEO_ALLOW_LOCALHOST` | Только `true` + `NODE_ENV=development` + `SITE_ENVIRONMENT=development` разрешают явно заданный `http(s)://localhost`, `127.0.0.1` или `[::1]` с портом. Индексация остаётся закрыта. Автоматического localhost fallback нет. |

Для staging с корректным origin canonical указывает на его настроенный origin, но metadata содержит noindex/nofollow/noarchive/nosnippet; schema не выводится и sitemap пуст. Robots/sitemap `force-dynamic`: политика не должна сохраняться из build другого окружения. После релиза 15 обязан проверить ответы маршрутов на самом deployment. Robots не поддерживает директиву noindex: её обеспечивает metadata после подключения frontend03. До интеграции meta robots нельзя считать установленным на страницах. Disallow сам по себе не гарантирует исчезновение уже известного URL из индекса и не защищает приватные разделы: авторизация/RBAC/ограничение доступа staging остаются отдельной обязанностью security13/DevOps15.

Публичная crawl policy запрещает admin/auth/login/signin/account/API, business dashboard/add и URL с query. Canonical, sitemap и schema всегда без пользовательских query. Нельзя индексировать геолокацию, поиск, служебные/приватные страницы; их владельцам нужны собственные серверные noindex, без наследования canonical главной. Нельзя рассчитывать, что бот прочтёт meta noindex на URL, запрещённом robots. Не раскрывать секреты в URL вообще; удаление уже проиндексированного URL — отдельная проверяемая операция владельца Search Console.

## Sitemap и реальные сущности

Allowlist сейчас ровно `/`, `/map`, для которых проверяется наличие `page.tsx`. Ни query вариантов, ни синтетических `/cities/smolensk`, категорий и будущих бизнес-страниц. Наличие проверенного City в БД не означает наличие городской публичной страницы. Нет придуманных lastModified/changeFrequency/priority.

Полный каталог Place **не включён**: контракт 1.0.0 имеет detail и bounded nearby, но не публичный экспорт всех опубликованных slug. `/places/near` не является экспортом и не вызывается для sitemap. Для полного sitemap архитектуре01/API04 нужны согласованный курсорный export только опубликованных и разрешённых карточек, достоверный `updatedAt`, лимиты/разбиение и удаление снятых публикаций. До этого discovery по реальным ссылкам возможен, полнота индекса не обещается.

Place helpers повторно проверяют DTO через `PlaceSchema`; неправдоподобные/неполные runtime данные дают `null` schema/noindex metadata. Это проверка контракта, не доказательство истинности/лицензии импортированных данных: источник и модерация обязательны upstream. `@id` — canonical карточки, координаты — только её `lat/lon`, адрес/название/описание — из неё. Категории берутся из `CATEGORIES` как `additionalProperty`. Для однозначных бизнес-категорий cafe/shopping/pharmacy/beauty/auto/hotel/bank/services/fuel выводится общий `LocalBusiness`; для широких medicine/sport/education/government/entertainment и смешанных категорий — общий `Place`, без выдуманной узкой специализации. Метаданные не публикуют phone/site/rating/openingState в сниппете.

Телефон проходит DTO-проверку и дополнительный предел 5–15 цифр после удаления разрешённых разделителей; сайт и optional provenance `sourceUrl` допускают только валидированные HTTP(S) без credentials и control/whitespace/backslash. Из внешних schema ссылок удаляются query/hash; ссылки никогда не скачиваются. Веб-сайт — `sameAs`, ссылки на источник — `subjectOf: CreativeWork`. Фото из hero применяется только в OG как декоративный брендовый фон, никогда как image организации. JSON-LD serializer заменяет `<`, `>`, `&`, U+2028/U+2029, сохраняет точный roundtrip исходной строки и не позволяет OSM-названию закрыть script.

Даже при наличии Rating DTO этап1 не выводит aggregateRating/review: текст `source` не подтверждает права и верификацию. Нет priceRange/услуг/контактов/отзывов из fixtures. Свободная строка openingHours не переводится в формальные часы: неизвестность не становится `open`/24×7. Breadcrumb содержит только реальную главную и текущую успешную карточку. WebSite без SearchAction: `/map` пока не подтверждён как рабочий универсальный endpoint одного query, ему нужны город и исходная точка. Добавление SearchAction требует проверенного маршрута/шаблона и отдельного теста; синтетического `/search` нет.

## Аналитика и минимизация

Аналитика **выключена по умолчанию и в этой поставке**: нет добавленного SDK, пикселя, beacon, session replay, endpoint, cookies/localStorage или фонового сборщика. Не подключены PostHog/Яндекс Метрика; нет мнимых диаграмм, пользователей/конверсий или измеренных CWV. Включение требует отдельной задачи, выбранного провайдера/размещения, согласованной модели согласия, срока хранения и удаления, доступа и ответственного. Наличие `SEO_INDEXING_ENABLED` не включает аналитику. До решения этих вопросов не отправлять события даже в собственный backend.

Минимальные будущие цели: успешность поиска/маршрута, доля отказов провайдеров, пустая выдача и скорость интерфейса. Предлагаемый allowlist ниже — спецификация для будущей реализации, **сейчас события не собираются**.

| Событие | Разрешённые поля после отдельного согласования |
| --- | --- |
| `page_view` | Только template `/`, `/map`, `/places/[slug]`, без самого slug/ID/полного URL/referrer. |
| `catalog_result` | outcome `results/empty/unavailable/error`, duration bucket; без запроса, названий/ID мест и точного количества, позволяющего восстановить поиск. |
| `route_result` | outcome `success/unavailable/error/cancelled`, mode walking/driving/cycling, duration bucket; без начала/конца/геометрии/расстояния/манёвров. |
| `web_vital` | LCP/INP/CLS + округлённое значение/категория, route template, coarse mobile/desktop. Без element selector, текста, полного URL и device fingerprint. |

Никогда не включать точные или округлённые координаты, адрес/q/searchParams, контакты, текст жалоб/форм, user/session/request идентификаторы, persistent IP, user agent/fingerprint, геоисторию и связь посещений разных организаций. Не сохранять raw payload в debug/error логах; не включать autocapture/session replay/recording. Сетевой сервис неизбежно видит IP в транспорте, поэтому нужны отдельные настройки журналов reverse proxy/CDN/API и redaction, а не обещание «IP не обрабатывается». Operational/security logs — отдельные цели/права/retention, не источник продуктовой аналитики. Согласие, отказ/отзыв и удаление должны реально блокировать/удалять сбор; UI согласия и правовые тексты здесь не созданы. Финальная юридическая оценка ещё не проведена.

## Core Web Vitals и проверка после интеграции

Цели: p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1, отдельно mobile/desktop. Lab (локальный controlled прогон DevTools/Lighthouse) ловит регрессии, но не доказывает field p75. Lighthouse без пользовательских взаимодействий не измеряет INP; TBT — только lab proxy. Field — реальные посещения/CrUX при достаточных данных либо будущий разрешённый RUM; отсутствие данных не равно успешной метрике. Текущие CWV не измерены задачей16.

03/14/17: lab на production build, cold/warm, заданные устройство/сеть/CPU и версия браузера; минимум сценарии главная, загрузка карты, ввод адреса, выдача, выбор места, маршрут и unavailable. Протоколировать реальные значения/trace/время/commit; не подменять их целями. Проверять 360/390/768/1024/1440/1920, keyboard/focus, reduced motion после UI интеграции. Field-настройка — только после утверждения минимизации и consent/retention, не за счёт самовольной telemetry.

## Открытые решения и передача

00/15: реальный домен/TLS и подтверждение production origin, разрешение индексации после приёмки, конфигурация staging и runtime env. 03: SSR metadata/schema integration; 14/17: фактический HTML, HTTP 404/robots/sitemap/CSP и lab QA. 01/04: export опубликованных slug перед расширением sitemap. Владелец домена: Search Console (и при выборе Яндекс Вебмастер), DNS verification, ответственный за удаления и мониторинг; ни внешняя отправка sitemap, ни indexing submit не выполнялись. Юрист/владелец: провайдер/регион/договор/правовое основание/consent/retention/delete и доступ к аналитике; до решения сбор выключен.

## Первичные источники

Проверены 2026-11-27; официальные страницы Next указывают App Router v16.4.6 (совпадает с package.json). [Metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [robots](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots), [sitemap](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap), [JSON-LD и безопасный script](https://nextjs.org/docs/app/guides/json-ld), [server-only boundary](https://nextjs.org/docs/app/getting-started/server-and-client-components). Schema semantics: [LocalBusiness](https://schema.org/LocalBusiness), [Place](https://schema.org/Place), [BreadcrumbList](https://schema.org/BreadcrumbList), [WebSite](https://schema.org/WebSite), [SearchAction](https://schema.org/SearchAction). Измерения и отличие lab/field: [Web Vitals](https://web.dev/articles/vitals). Это технические источники; юридическое заключение не получено.
