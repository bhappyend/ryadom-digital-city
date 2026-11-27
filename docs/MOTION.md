# 08 — Motion Digital City

Компоненты — progressive enhancement существующей главной Next/React. Применён полностью прочитанный Sites skill, режим local-only; исходные assets, Next/Nest/PostGIS и API-контракт не изменены. Категории работы: UI/UX, visual design/originality, architecture, performance, accessibility, responsive, testing и documentation. Отдельных anti-slop/UI/GIS/security Skills в доступном наборе нет. Новых зависимостей, установки npm, commits/push/deploy нет.

## Точные изменения для frontend03

Только владелец03 меняет `apps/web/src/components/home.tsx`. Импорты напрямую, без client barrel:

```tsx
import { DigitalCityMotion } from './motion/DigitalCityMotion';
import { MapDemoScene } from './motion/MapDemoScene';
```

1. Внутрь существующего `<main id="main">` один раз добавить `<DigitalCityMotion />` (например, перед первой section). Он возвращает null, рендер страницы остаётся серверным.
2. В section с `data-motion="map-demo"` заменить только текущую `<figure className="map-demo">…</figure>` на `<MapDemoScene />`. Существующие `.demo-copy`, CTA, заголовок и `data-motion="map-demo"` сохранить. Компонент уже содержит figure, caption и ol: не оборачивать его в ещё одну figure.
3. Не импортировать motion CSS в globals/layout: CSS module подключён сценой. `MapDemoScene` и `MapDemoArtwork` оставлять server components, не добавлять им `'use client'` и не импортировать через client-модуль. Большая SVG-геометрия тогда не входит в motion client graph.
4. Совместимость: точные текущие селекторы внутри `#main` — `.hero-copy`, `.hero .hero-floating`, `#categories .category-link`, `#reviews .review`, `#reviews .review-empty`. Другие DOM элементы не анимируются. При переименовании03 синхронизирует этот контракт с08. `.hero-floating` должна оставаться неинтерактивной декоративной карточкой, без собственного CSS `translate`.
5. Desktop layout секции должен позволять правой колонке растягиваться: сцена задаёт `align-self: stretch`, а sticky находится внутри неё. Нельзя ставить `overflow: hidden/auto` на родителях sticky-колонки. Верхний отступ — `--dc-motion-sticky-top: 7rem`; при изменении header03 задаёт переменную на section так, чтобы caption и фазы помещались во viewport.

Статистика текущей03 не содержит opt-in data-атрибутов; CountUp намеренно не подключён. Controller не читает и не изменяет `dd`, значения, форматирование, источник и дату метрик. Не добавлять вымышленные показатели или анимацию рейтинга. Если03 позже запросит CountUp для серверных проверенных метрик, сначала согласовать opt-in контракт и отдельную доступную реализацию; существующий текст и источник сохраняются.

## Сцена и fallback

Четыре data-driven фазы в `motion-state.ts`: приближение до 1.055; появление маркеров; выделение условного места; прорисовка линии примера. Прокрутка обратима, wheel/touch/key события не перехватываются. Нет live-карты, provider-запросов, геолокации, точек реальных организаций, расстояний или времени маршрута.

`MapDemoArtwork.tsx` — точная статическая JSX-геометрия первых трёх элементов supplied `ryadom-digital-city/assets/illustrations/map-demo.svg`: фон, улицы/здания и река. Исходный SVG уже содержит готовый маршрут, поэтому его маршрут/точки/маленькая внутренняя подпись не копировались: сцена добавляет отдельные overlays и читаемый figcaption. Оригинал не изменялся. Координаты overlays — координаты декоративного SVG viewBox, не GIS-данные. `/assets/markers/cafe.svg` используется без изменения. При обновлении исходного SVG нужно повторно сверить derived geometry и маршрут. Caption всегда явно сообщает «Демонстрация интерфейса · не навигационная карта».

Без JS все элементы видимы, все четыре подписи доступны, показан статичный финальный пример. На мобильных/планшетах, touch-устройствах и при viewport ниже 40rem используется та же статичная сцена без длинного scroll-track; мягкий reveal возможен на обычном устройстве. Reduced motion, Save-Data, ≤4 logical cores или ≤4 GB reported memory отключают все эффекты. Неизвестные browser resource hints не заменяются выдуманной оценкой устройства. Preference/connection changes применяются в текущей сессии.

## Доступность и ресурсы

- Серверный контент не получает `opacity:0`; WAAPI reveal 420ms, opacity .88→1, смещение 6px. Stagger ограничен 140ms. Повторный reveal исключён через WeakSet; текущий focus не анимируется. Навигация, DOM-порядок, tabindex и доступные имена не меняются.
- Hero-картинка, её загрузка и заголовок не ждут эффекта. Запуск после window load и idle slot (timeout 1000ms; fallback timer160ms). Нет сети/SDK, WebGL, GSAP/Framer, динамической загрузки шрифтов и тяжёлой бесконечной анимации.
- Декоративная SVG-сцена и overlays имеют `aria-hidden`; статичный caption и список фаз читаются один раз, без live region и aria-current на каждом progress tick. Только декоративный цвет подчёркивания отражает текущую фазу. Keyboard scrolling остаётся нативным.
- Лёгкий float декоративной hero-карточки ограничен 4px и зависит только от прокрутки. Passive scroll listener подключается только пока hero/сцена находятся в IntersectionObserver viewport. rAF один на пачку событий и не планирует следующий кадр сам. Вне viewport нет scroll listener. Геометрия кэшируется; layout reads только при входе/resize/layout invalidation, до style writes.
- При hidden document ожидающий rAF отменяется, listener прокрутки снимается, WAAPI отменяются. Размер уже активной sticky-сцены сохраняется при скрытии вкладки, чтобы смена visibility не прыгала по странице. Возврат обновляет геометрию. Resize/Intersection observers, media/connection/document/window listeners, idle/timer и все animation frames освобождаются при unmount; повторный Strict Mode mount поддержан.
- CSS module использует исходные tokens. Нет новых градиентов, glass, glow, маркетинговых карточек или выдуманных данных. Рисунок референса просмотрен; оформление карты не заменяет рабочий GIS.

## Проверки и последующая QA

Из корня репозитория:

```text
node_modules/.bin/vitest.cmd run apps/web/src/components/motion
node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit --incremental false
node apps/web/src/components/motion/scripts/verify-motion.mjs
```

Unit tests проверяют motion policy, bounded/reversible phases, coalescing/cancellation кадров, отсутствие self-loop, cleanup при unmount/remount и reduced-motion change, освобождение observer/listener, hidden-tab suspension без удаления scroll-track, отсутствие layout reads при простом scroll и сохранность метрик. Browser doubles не доказывают layout/paint/accessibility tree. Node verify script выполняет реальный React SSR в памяти: caption, 4 фазы, aria-hidden/отсутствие live/focus controls, исходный cafe marker, резерв aspect ratio и точное совпадение 155 элементов source geometry. Он также считает transpiled client source, не выдавая это за production bundle или Web Vitals.

После integration03 задаче14: 360/390/768/1024/1440/1920, keyboard/tab/focus, масштаб200%, reduced motion до загрузки и во время scroll, JS disabled, Save-Data, weak-device hints, hidden/visible, scroll restoration и route-away/back. Проверить высоту sticky-figure относительно viewport, все подписи без обрезки, отсутствие горизонтального overflow и scroll hijack. Измерить LCP/INP/CLS в production build, frames/long tasks и отсутствие idle animation work. Отдельно проверить позднюю hydration со scroll restoration: активация desktop track меняет layout ниже fold, поэтому CLS без измерения не заявляется. Performance цели проекта остаются критериями, не подтверждённым результатом этого модуля.

Наблюдённые фактические результаты и внешние ошибки перечислены в `docs/HANDOFFS/08.md`.
