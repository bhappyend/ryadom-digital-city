import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { GeocodeResponseSchema, PlacesResponseSchema, RouteResponseSchema } from '@ryadom/types';
import { acceptanceAddress } from '../support/live';
import { preflight } from '../support/preflight';
import { catalogPlace } from '../support/catalog';

test.beforeAll(() => preflight(['BASE_URL']));

test('business pricing is accessible and explains manual monthly owner payment', async ({ page }, info) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/business/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    await info.attach(`pricing-axe-${width}`, { body: JSON.stringify(axe), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`pricing-${width}.png`), fullPage: true });
    expect(axe.violations).toEqual([]);
    await expect(page.getByRole('main')).toContainText(/ежемесяч|каждый месяц/i);
    await expect(page.getByRole('main')).toContainText(/вручную/i);
    await expect(page.getByRole('main').locator('a[href="https://vk.ru/desktopcoder"]')).toBeVisible();
    await expect(page.getByRole('main').locator('a[href="https://t.me/desktopcoder"]')).toBeVisible();
  }
});

for (const width of [360, 390, 768, 1024, 1440, 1920]) {
  test(`home ${width}px: content, overflow, accessibility and screenshot`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ближе, чем кажется');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: info.outputPath(`home-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'No horizontal overflow').toBeLessThanOrEqual(1);
    await expect(page.getByRole('form', { name: 'Поиск поблизости' }).getByLabel('Адрес или район')).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    await info.attach(`axe-${width}`, { body: JSON.stringify(axe, null, 2), contentType: 'application/json' });
    expect(axe.violations, 'WCAG automated violations; manual checks remain required').toEqual([]);
    expect(errors, 'Unhandled browser errors').toEqual([]);
  });
}

test('mobile navigation: keyboard focus stays in dialog, Escape restores trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержимому' })).toBeFocused();
  const toggle = page.getByRole('button', { name: 'Меню', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Навигация' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(toggle).toBeFocused();
});

test('QuickSearch preserves address, city and category in map navigation', async ({ page }) => {
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Поиск поблизости' });
  await expect(form.getByRole('combobox', { name: 'Город', exact: true })).toBeEnabled();
  await form.getByRole('combobox', { name: 'Город', exact: true }).selectOption('smolensk');
  await form.getByLabel('Адрес или район').fill(acceptanceAddress);
  await form.getByRole('combobox', { name: 'Категория', exact: true }).selectOption('cafe');
  await form.getByRole('button', { name: 'Найти поблизости', exact: true }).click();
  await expect(page).toHaveURL(/\/map\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get('q')).toBe(acceptanceAddress);
  expect(url.searchParams.get('city')).toBe('smolensk');
  expect(url.searchParams.get('category')).toBe('cafe');
});

test('category entry opens map with chosen category', async ({ page }) => {
  await page.goto('/');
  await page.locator('#categories').getByRole('link', { name: 'Кафе', exact: true }).click();
  await expect(page).toHaveURL(/\/map\?.*category=cafe/);
});

test('live map loads worker and real vector tiles without map error state', async ({ page }, info) => {
  const failures: string[] = [];
  const tiles: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && /worker|maplibre|CSP|Content Security/i.test(event.text())) failures.push(event.text()); });
  page.on('response', response => { if (/\.(?:pbf|mvt)(?:\?|$)/.test(response.url()) && response.ok()) tiles.push(response.url()); });
  await page.goto('/map?city=smolensk');
  await expect(page.getByRole('region', { name: /^Карта: Смоленск/ }).locator('canvas')).toBeVisible();
  await expect.poll(() => tiles.length, { message: 'Canvas alone is insufficient; real vector tile must load' }).toBeGreaterThan(0);
  await expect(page.locator('.map-status')).toHaveCount(0);
  expect(failures).toEqual([]);
  await info.attach('map-network-evidence', { body: JSON.stringify({ tiles, failures }), contentType: 'application/json' });
  await page.screenshot({ path: info.outputPath('map-live.png'), fullPage: true });
});

test('LIVE browser acceptance: provider address selection → genuine cafe → map and route', async ({ page }, info) => {
  await page.goto('/map?city=smolensk&category=cafe');
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('smolensk');
  await page.getByLabel('Начальный адрес').fill(acceptanceAddress);
  const geocodeResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/v1/geocode'));
  await page.getByRole('button', { name: 'Найти адрес', exact: true }).click();
  const geocodeHttp = await geocodeResponse;
  await info.attach('browser-live-geocode', { body: await geocodeHttp.body(), contentType: 'application/json' });
  expect(geocodeHttp.status(), 'Real geocoding is required').toBe(200);
  const result = GeocodeResponseSchema.parse(await geocodeHttp.json()).data;
  const address = result.items.find(item => Math.abs(item.coordinates.lat - 54.7823535) < 0.005 && Math.abs(item.coordinates.lon - 32.049985) < 0.005);
  expect(address).toBeDefined();
  const nearbyResponse = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/api/v1/places/near'));
  await page.getByRole('button', { name: address!.label, exact: true }).click();
  const nearbyHttp = await nearbyResponse;
  expect(nearbyHttp.status()).toBe(200);
  const places = PlacesResponseSchema.parse(await nearbyHttp.json()).data.items;
  expect(places.length, 'Genuine imported cafe required').toBeGreaterThan(0);
  const destination = places.find(place => place.distanceMeters > 50)!;
  expect(destination).toBeDefined();
  const article = page.getByRole('article', { name: destination.name, exact: true });
  await article.getByRole('button', { name: 'На карте', exact: true }).click();
  await expect(article.getByRole('button', { name: 'На карте', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: /^Карта: Смоленск/ }).locator('canvas')).toBeVisible();
  const routePanel = page.getByRole('region', { name: 'Построение маршрута' });
  const routeResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/routes'));
  await routePanel.getByRole('button', { name: 'Построить маршрут', exact: true }).click();
  const routeHttp = await routeResponse;
  await info.attach('browser-live-route', { body: await routeHttp.body(), contentType: 'application/json' });
  expect(routeHttp.status(), 'Unavailable router is an acceptance blocker').toBe(200);
  const route = RouteResponseSchema.parse(await routeHttp.json()).data;
  await expect(routePanel.getByRole('status')).toContainText(route.maneuvers[0]!.instruction);
  await page.screenshot({ path: info.outputPath('live-map-route.png'), fullPage: true });
  await routePanel.getByRole('link', { name: 'Карточка места' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(destination.name);
  for (const source of destination.provenance) {
    await expect(page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Сведения и источники' }) })).toContainText(source.license);
  }
});

test('denied geolocation is explained and address entry remains available', async ({ page, context }) => {
  await context.clearPermissions();
  // Deterministic denied permission is a browser condition, not an API replacement.
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure?.({ code: 1, message: 'Permission denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await page.goto('/');
  const form = page.getByRole('form', { name: 'Поиск поблизости' });
  await form.getByRole('button', { name: 'Разрешить определение местоположения и найти рядом' }).click();
  await expect(form.getByRole('alert')).toContainText(/разреш|доступ|отклон/i);
  await expect(form.getByLabel('Адрес или район')).toBeEditable();
  await expect(page).toHaveURL(/\/$/);
});

test('genuine detail exposes provenance and guest favorite persists on reload', async ({ page, request }) => {
  const place = await catalogPlace(request);
  await page.goto(`/places/${place.slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(place.name);
  const sources = page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Сведения и источники' }) });
  for (const source of place.provenance) {
    await expect(sources).toContainText(source.license);
    await expect(sources).toContainText(source.sourceRecordId);
    await expect(sources).toContainText(source.attribution);
  }
  const favorite = page.getByRole('button', { name: 'В избранное', exact: true });
  await favorite.click();
  await expect(page.getByRole('button', { name: 'В избранном', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  const selected = page.getByRole('button', { name: 'В избранном', exact: true });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await selected.click();
  await expect(page.getByRole('button', { name: 'В избранное', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('reduced motion leaves no persistent heavy animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const heavy = await page.evaluate(() => document.getAnimations().filter(animation => {
    const timing = animation.effect?.getComputedTiming();
    return timing && (timing.iterations === Infinity || Number(timing.activeDuration) > 650);
  }).map(animation => ({ id: animation.id, state: animation.playState })));
  expect(heavy).toEqual([]);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('home laboratory LCP/CLS observation (no INP claim)', async ({ page }, info) => {
  await page.addInitScript(() => {
    const measurements = { lcp: 0, cls: 0 };
    Object.assign(window, { __qaVitals: measurements });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) measurements.lcp = entry.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput: boolean; value: number };
        if (!shift.hadRecentInput) measurements.cls += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const measured = await page.evaluate(() => ({ ...(window as typeof window & { __qaVitals: { lcp: number; cls: number } }).__qaVitals, navigation: performance.getEntriesByType('navigation')[0]?.toJSON() }));
  await info.attach('lab-vitals-unthrottled', { body: JSON.stringify({ ...measured, note: 'Single local unthrottled observation; CLS is page observation sum, not field session-window metric. INP requires field interaction measurement.' }, null, 2), contentType: 'application/json' });
  expect(measured.lcp, 'LCP observer must produce evidence').toBeGreaterThan(0);
});

