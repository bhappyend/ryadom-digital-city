# PWA «Рядом» — оболочка этапа 1

Задача 09, 2026-11-27. Реализованы установка по возможности браузера, автономная заглушка и управляемая смена версии. Офлайн-поиска, офлайн-карты и офлайн-маршрутизации нет. Это локальная реализация, не доказательство готовности всего продукта или совместимости со всеми устройствами.

## Подключение — владелец frontend03

Файлы layout/header не входят в область 09. Единственная точка экспорта:

```tsx
import { InstallButton, PwaRegistration } from '@/components/pwa';

// Внутри body root layout, один экземпляр вне условного меню:
<PwaRegistration />

// Header, секция приложения или мобильная навигация:
<InstallButton className="dc-button dc-button--secondary">Установить приложение</InstallButton>
```

Оба компонента клиентские. `PwaRegistration` регистрирует `/sw.js` только из `useEffect` после hydration. Внешний provider не нужен. Несколько `InstallButton` используют один store и один отложенный `beforeinstallprompt`. Кнопку в мобильном меню не помещать внутрь ссылки/другой кнопки. Native dialog останавливает bubbling Tab/Escape, не отменяя native default: текущий document-level focus trap навигации не должен перехватывать их. Совместную работу modal, меню и возврата фокуса всё равно проверить в браузере; capture-phase trap навигации потребовал бы отдельной интеграции.

В существующие Next metadata/viewport нужно **добавить**, сохранив остальные поля:

```tsx
export const metadata: Metadata = {
  // ...существующие metadata
  manifest: '/manifest.webmanifest',
  icons: { /* ...существующие icons */ apple: '/assets/brand/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'Рядом', statusBarStyle: 'default' },
};
export const viewport: Viewport = {
  // ...существующие viewport
  themeColor: '#061217',
};
```

Исходные PNG уже поставлены UI02 в public/assets/brand: any 192×192 и 512×512, maskable 192×192 и 512×512, Apple 180×180. Manifest разделяет purpose `any`/`maskable`, scope/start_url/id `/`, display `standalone`; в URL запуска нет меток аналитики, поисковых запросов или координат. Apple icon указывается в metadata, отдельно от manifest purposes.

## Политика Service Worker

| Запрос/ответ | Поведение |
|---|---|
| Install | Только `/offline.html`, credentials `omit`, redirect `error`; непригодный ответ отклоняет установку SW |
| Public document navigation без query | Network-first, `cache:no-store`; HTML никогда не сохраняется; при сетевой ошибке, таймауте 8 s или HTTP 5xx — автономный HTML с HTTP 503 |
| 4xx public navigation | Исходный ответ сервера; ошибка не маскируется офлайн-страницей |
| Hash-named `/_next/static/chunks/**.js`, `/_next/static/css/**.css` с destination script/style | Cache-first только при HTTP 200, basic, exact response URL, без redirect, корректном MIME, `public` + `immutable`; максимум 64 записи |
| API, auth, admin, account, private, location, business/dashboard, place detail, photos, maps, произвольные assets | SW не перехватывает и не сохраняет |
| Любой URL с query, non-GET, другой origin, Authorization, Range, request no-store | Полный обход обработчика SW |
| Ответ opaque/redirected/private/no-store/no-cache/Vary Cookie/Authorization/*/Set-Cookie | В Cache Storage не попадает |

Public allowlist строго: `/`, `/map`, `/categories`, `/about`, `/business`, `/business/pricing`. Trailing slash, новые страницы и `places/[slug]` автоматически не добавляются. В `/map?lat=…&lon=…` и иных запросах с параметрами офлайн-заглушка SW тоже не подставляется; при потере сети действует обычная ошибка браузера. Это намеренное ограничение приватности. `fetch`/RSC SPA-переходы не являются document navigation: их ошибки должен обрабатывать frontend. Для заглушки нужен полный переход/перезагрузка безопасного URL после успешной установки SW.

Регистрации по HTTP разрешены только на secure localhost/127.0.0.1/[::1]; production требует HTTPS. В `next dev` компонент SW не регистрирует и кэши не создаёт. Worker от прежнего production-запуска на том же origin может остаться: для dev используйте другой port/profile либо вручную удалите **только** `/sw.js` и `ryadom-pwa-*` через DevTools. Автоматического удаления чужих SW/кэшей нет.

Статические JS/CSS загружаются worker через запрос без cookies/Authorization. Публичный compiled JS не должен содержать секретов или пользовательских данных. Некоторым именам Next/Turbopack whitelist может не соответствовать: тогда файл просто остаётся сетевым. Нет pre-cache всего build и нет обещания загрузить приложение целиком без сети. Неперсонализированный offline.html — единственный сохраняемый HTML. Ни localStorage, ни IndexedDB, ни история геолокации не используются.

Cache names: `ryadom-pwa-shell-2026-11-27.1` и `ryadom-pwa-assets-2026-11-27.1`. На activation удаляются только прежние cache names с собственным prefix `ryadom-pwa-`. При изменении оболочки/политики повысить `VERSION` в sw.js. Не удалять посторонние кэши. Отказ/quota Cache Storage не должен ломать сетевую доставку JS/CSS; при недоступном хранилище и сети возвращается минимальный русский текст 503.

## Установка и обновление

`beforeinstallprompt` не имеет универсальной поддержки и не гарантирован даже в браузере с PWA. Событие перехватывается после mount, `.prompt()` вызывается только непосредственно по нажатию. Одно событие потребляется один раз; параллельные кнопки не запускают два диалога. Accepted означает только принятие предложения: статус установлен подтверждают `appinstalled` либо standalone/iOS standalone. Браузер не предоставляет универсального API для проверки установки/удаления с другого устройства или другой сессии.

Без системного события открывается native `<dialog>` с инструкцией: iOS/iPadOS — через меню «Поделиться»/«На экран Домой», Safari macOS — «Файл»/«Добавить в Dock», другие браузеры — доступный пункт их меню или закладки. Формулировки условные, без обещания поддержки любой версии. Native modal имеет accessible name/description, Escape, удержание фокуса браузером и возврат фокуса на trigger при закрытии; реальное взаимодействие с навигационным modal требует QA.

Worker не вызывает `skipWaiting` на install. Если есть waiting worker и текущий controller, показывается уведомление «Обновить / Позже». Только «Обновить» отправляет `SKIP_WAITING` same-origin worker; после `controllerchange` инициирующая вкладка перезагружается один раз. Первый `clients.claim`, повторный event или обновление другой вкладкой сами по себе не перезагружают страницу. Уже activated worker другой вкладкой требует явного клика для перезагрузки. Через 12 s без завершения появляется возможность повторить; поздний event после таймаута не вызывает неожиданную перезагрузку. Cleanup снимает listeners/timer. Возврат видимости запускает revalidation не чаще раза в минуту; offline ошибка сохраняет текущую версию.

## Требования к серверу — frontend/DevOps/security

- Отдавать `/sw.js` как JavaScript с revalidation (`Cache-Control: no-cache` либо max-age=0), scope `/`; reverse proxy не должен направлять его на SPA fallback. Не использовать immutable для sw.js.
- `/offline.html` — неизменённый публичный файл `text/html`, HTTP 200, без redirects, cookies, авторизации и private/no-store/no-cache. Подходит `Cache-Control: public, max-age=0, must-revalidate`. SW install специально отклоняет небезопасный ответ. Сам fallback response имеет `no-store` и 503.
- Manifest — `application/manifest+json`, PNG — `image/png`, публичные и без auth; hashed static JS/CSS — `public, max-age=31536000, immutable` только при фактической неизменяемости.
- На API/private/auth/geolocation ответах отдельно обеспечить server/proxy `Cache-Control: no-store`: обход SW не управляет обычным HTTP cache. Публичный HTML с персонализацией также no-store. Не применять глобальное no-store к offline.html.
- Разрешить `worker-src 'self'`, `manifest-src 'self'` в основной CSP. Offline страница автономна и содержит минимальный inline CSS с точным SHA-256: `yAy2cLjNEYdw48m5anAS6l9E01UXvGNcTCy2prsSUew=`. Если сервер задаёт CSP для offline.html, разрешить **этот hash**, не ослабляя глобальную policy. В документе есть meta CSP, а SW fallback добавляет header CSP, frame-ancestors none, nosniff, DENY и no-referrer.
- При изменении inline CSS синхронно обновить hash в offline.html и sw.js, повысить версию; тест проверяет точное совпадение, включая пробелы/newlines. Не переписывать inline стиль CDN minifier без пересчёта hash.
- Размещать этот Next app в корне выделенного origin. Base path или соседний app требуют нового согласованного scope/URL/cache prefix; текущая реализация на subpath не рассчитана.

## Проверки и границы доказательств

Из корня репозитория, без установки новых пакетов:

```text
node --check apps/web/public/sw.js
node --test apps/web/src/components/pwa/tests/verify-pwa.mjs apps/web/src/components/pwa/tests/verify-install.mjs apps/web/src/components/pwa/tests/verify-registration.mjs
node node_modules/typescript/bin/tsc --noEmit --ignoreConfig --target ES2022 --module ESNext --moduleResolution bundler --jsx react-jsx --lib ES2022,DOM,DOM.Iterable --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node,react apps/web/src/components/pwa/index.ts
```

Node VM проверяет настоящие обработчики sw.js с mock Cache Storage/network/clients; store tests — настоящую логику отложенной установки; lifecycle tests — регистрацию, guards, update click/timeout/reload/unmount с mock React hooks и SW. Они не эмулируют layout engine, DOM focus, системную установку или реальный browser SW lifecycle. PNG размеры и совпадение с исходными файлами проверяются по bytes. Offline HTML проверяется на отсутствие внешних ресурсов и согласованный CSP hash.

После сборки/подключения frontend03 QA14 должен проверить production preview на HTTPS/localhost:

1. Чистый профиль: регистрация после hydration; первая activation без toast/reload; offline.html действительно сохранён. После потери сети hard navigation `/map` → автономный 503, online recovery → обычная страница.
2. Network/Cache Storage: API, приватные пути, фото и URL с query не появляются в `ryadom-pwa-*`; authenticated ответы не сохраняются; другой cache prefix остаётся после обновления. Query navigation офлайн не подменяется картой.
3. Deploy новой VERSION при открытой вкладке → toast; «Позже» сохраняет сессию, «Обновить» даёт один reload. Повторить с двумя вкладками, offline update и таймаутом.
4. Chromium desktop/Android: prompt только click, cancel/accept, повторные клики, appinstalled. Safari iOS/iPadOS/macOS и Firefox: честная инструкция вместо мнимой установки. OS/browser версии и результаты записать фактически.
5. Viewports 360/390/768/1024/1440/1920: offline page, manual dialog и update notice без overflow; keyboard Tab/Shift+Tab/Escape, focus return, screen-reader status, zoom200%, contrast, reduced motion (в PWA нет анимаций), safe-area. Отдельно проверить dialog из мобильной навигации.

Источники API: [beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event), [Service Worker registration](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register), [skipWaiting](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting), [native modal dialog](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal). Browser/OS QA пока не выполнен задачей 09; передан QA14. Build всего приложения не считается заменой этих проверок.
