import { test, expect } from '@playwright/test';
import { envelope, fixturePlace, fixturePoint, mockMapApi } from '../support/mock-api';
import { catalogPlace } from '../support/catalog';
import { preflight } from '../support/preflight';

test.beforeAll(() => preflight(['BASE_URL']));

const mapUrl = `/map?city=smolensk&category=cafe&lon=${fixturePoint.lon}&lat=${fixturePoint.lat}`;

test('MOCKED empty catalog is distinct from service failure; unavailable map never displays fake geography', async ({ page }) => {
  const unexpected = await mockMapApi(page, { catalog: 'empty' });
  await page.goto(mapUrl);
  await expect(page.getByRole('heading', { name: 'Пока ничего не найдено' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Карта пока недоступна' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Повторить поиск' })).toHaveCount(0);
  await expect(page.locator('main canvas, main img[src*="map-demo"], main img[src*="hero-city"]')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test('MOCKED catalog outage offers retry, never claims empty; recovery shows empty correctly', async ({ page }) => {
  const control: { catalog: 'failure' | 'empty' } = { catalog: 'failure' };
  const unexpected = await mockMapApi(page, control);
  await page.goto(mapUrl);
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'Каталог пока недоступен' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Пока ничего не найдено' })).toHaveCount(0);
  control.catalog = 'empty';
  await page.getByRole('button', { name: 'Повторить поиск' }).click();
  await expect(page.getByRole('heading', { name: 'Пока ничего не найдено' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert').filter({ hasText: 'Каталог пока недоступен' })).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

for (const condition of ['empty', 'failure'] as const) {
  test(`MOCKED geocoder ${condition} gives distinct useful feedback`, async ({ page }) => {
    const unexpected = await mockMapApi(page, { geocode: condition });
    await page.goto('/map?city=smolensk');
    await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('smolensk');
    await page.getByLabel('Начальный адрес').fill('QA test address');
    await page.getByRole('button', { name: 'Найти адрес', exact: true }).click();
    if (condition === 'empty') {
      await expect(page.getByText('Адрес не найден. Уточните название улицы и номер дома.')).toBeVisible();
      await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
    } else {
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Поиск по адресу пока недоступен');
      await expect(page.getByText('Адрес не найден. Уточните название улицы и номер дома.')).toHaveCount(0);
    }
    expect(unexpected).toEqual([]);
  });
}

test('MOCKED selected geocoder result, rather than typed text, supplies nearby origin', async ({ page }) => {
  const unexpected = await mockMapApi(page, { geocode: 'one', catalog: 'one' });
  await page.goto('/map?city=smolensk&category=cafe');
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('smolensk');
  await page.getByLabel('Начальный адрес').fill('QA test address');
  await page.getByRole('button', { name: 'Найти адрес', exact: true }).click();
  await expect(page.getByRole('article', { name: fixturePlace.name })).toHaveCount(0);
  const nearbyRequest = page.waitForRequest(r => new URL(r.url()).pathname.endsWith('/places/near'));
  await page.getByRole('button', { name: 'QA ONLY — выбранный адрес', exact: true }).click();
  const url = new URL((await nearbyRequest).url());
  expect(url.searchParams.get('lon')).toBe(String(fixturePoint.lon));
  expect(url.searchParams.get('lat')).toBe(String(fixturePoint.lat));
  expect(url.searchParams.get('category')).toBe('cafe');
  await expect(page.getByRole('article', { name: fixturePlace.name })).toBeVisible();
  expect(unexpected).toEqual([]);
});

test('MOCKED router failure offers retry without fake route result', async ({ page }) => {
  const unexpected = await mockMapApi(page, { catalog: 'one', router: 'failure' });
  await page.goto(mapUrl);
  await page.getByRole('article', { name: fixturePlace.name }).getByRole('button', { name: 'На карте', exact: true }).click();
  const section = page.getByRole('region', { name: 'Построение маршрута' });
  await section.getByRole('button', { name: 'Построить маршрут', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Построение маршрутов пока недоступно');
  await expect(section.locator('.route-result')).toHaveCount(0);
  const retry = page.waitForResponse(r => r.url().endsWith('/api/v1/routes') && r.status() === 503);
  await section.getByRole('button', { name: 'Повторить', exact: true }).click();
  await retry;
  await expect(section.locator('.route-result')).toHaveCount(0);
  expect(unexpected).toEqual([]);
});

test('MOCKED untrusted catalog name renders as text without executing markup', async ({ page }) => {
  await mockMapApi(page);
  const maliciousName = '<img src=x onerror="window.__qaXss=1">';
  await page.route('**/api/v1/places/near?**', route => route.fulfill({ status: 200, json: envelope({ items: [{ ...fixturePlace, name: maliciousName, distanceMeters: 100 }], pagination: { page: 1, limit: 20, total: 1, hasMore: false } }) }));
  await page.goto(mapUrl);
  await expect(page.getByRole('article', { name: maliciousName, exact: true }).getByRole('heading')).toHaveText(maliciousName);
  expect(await page.evaluate(() => (window as typeof window & { __qaXss?: number }).__qaXss)).toBeUndefined();
  await expect(page.locator('main img[src="x"], main [onerror]')).toHaveCount(0);
});

test('MOCKED unavailable native install opens instructions and restores focus', async ({ page }) => {
  await page.addInitScript(() => {
    addEventListener('beforeinstallprompt', event => { event.preventDefault(); event.stopImmediatePropagation(); }, true);
  });
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Установить', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Рядом под рукой' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Для поиска мест и построения маршрутов нужен интернет.');
  await expect(dialog).toContainText(/меню браузера|на главный экран/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
});

for (const failure of ['unavailable', 'invalid-receipt'] as const) {
  test(`MOCKED report ${failure} with LIVE detail never claims successful submission`, async ({ page, request }) => {
    // SSR detail remains genuine. Only the write response is intercepted in this isolated context.
    const place = await catalogPlace(request);
    let writes = 0;
    await page.route('**/api/v1/reports', async route => {
      writes++;
      return failure === 'unavailable'
        ? route.fulfill({ status: 503, json: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'QA outage', provider: { status: 'unavailable', provider: 'reports', reason: 'disabled', message: 'QA isolated outage' } }, meta: { requestId: '10000000-0000-4000-8000-000000000014', generatedAt: new Date().toISOString() } } })
        : route.fulfill({ status: 202, json: { data: { status: 'pending' } } });
    });
    await page.goto(`/places/${place!.slug}`);
    await page.getByRole('button', { name: 'Сообщить об ошибке', exact: true }).click();
    await page.getByLabel('Описание ошибки').fill('short');
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    expect(writes, 'Browser validation must prevent a short report').toBe(0);
    await page.getByLabel('Описание ошибки').fill('QA isolated failure test; no real correction submitted.');
    await page.getByLabel(/Согласен на обработку сообщения/).check();
    await page.getByRole('button', { name: 'Отправить на проверку' }).click();
    await expect(page.locator('#report-form').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Сообщение принято на проверку' })).toHaveCount(0);
    await expect(page.getByLabel('Описание ошибки')).toHaveValue('QA isolated failure test; no real correction submitted.');
    expect(writes).toBe(1);
  });
}


