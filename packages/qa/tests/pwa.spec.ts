import { test, expect } from '@playwright/test';
import { preflight } from '../support/preflight';

test.beforeAll(() => preflight(['BASE_URL']));

test('manifest and production registration provide real offline shell', async ({ page, context, request }, info) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();
  expect(manifest.name).toContain('Рядом');
  expect(manifest.start_url).toBe('/');
  for (const purpose of ['any', 'maskable']) {
    expect(manifest.icons.some((icon: { purpose?: string; sizes: string }) => (icon.purpose ?? 'any').split(' ').includes(purpose) && icon.sizes.includes('512x512'))).toBe(true);
  }
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest/);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.state), { message: 'Production PWA registration required (dev is insufficient)' }).toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const cache = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => ({ key, urls: (await (await caches.open(key)).keys()).map(r => r.url) })))));
  await info.attach('cache-before-offline', { body: JSON.stringify(cache, null, 2), contentType: 'application/json' });
  expect(cache.flatMap(c => c.urls).some(url => url.endsWith('/offline.html'))).toBe(true);
  await context.setOffline(true);
  const response = await page.goto('/about', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(503);
  await expect(page.getByRole('heading', { name: 'Пока нет соединения' })).toBeVisible();
  await expect(page.getByText(/Для поиска мест, просмотра карты и построения маршрутов нужен интернет/)).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Открыть главную' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ближе, чем кажется');
});

test('service worker never caches API/private/query/geolocation responses', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration('/'))?.active?.state)).toBe('activated');
  await page.reload();
  const outcomes = await page.evaluate(async () => {
    const paths = ['/api/v1/categories', '/api/v1/places/near?city=smolensk&lat=54.7823535&lon=32.049985&radius=300', '/map?qaPrivacyProbe=14&lat=54.7823535&lon=32.049985', '/admin', '/business/dashboard'];
    return Promise.all(paths.map(async path => { const response = await fetch(path); return { path, status: response.status, cacheControl: response.headers.get('cache-control') }; }));
  });
  const urls = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key => (await (await caches.open(key)).keys()).map(r => r.url)))).flat());
  await info.attach('privacy-cache-probe', { body: JSON.stringify({ outcomes, urls }, null, 2), contentType: 'application/json' });
  expect(outcomes[0]?.status).toBe(200);
  expect(outcomes[0]?.cacheControl).toContain('no-store');
  for (const value of urls) {
    const url = new URL(value);
    expect(url.search).toBe('');
    expect(url.pathname).not.toMatch(/^\/(?:api|admin|places|map|business\/dashboard)(?:\/|$)/);
    expect(url.pathname === '/offline.html' || /^\/_next\/static\/.+\.(?:js|css)$/.test(url.pathname), `Only offline shell or immutable code allowed: ${url.pathname}`).toBe(true);
  }
});
