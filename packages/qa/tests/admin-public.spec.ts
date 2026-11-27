import { expect, test } from '@playwright/test';
import { adminOrigin, checkAdminLayout, visitAdmin, widths } from '../support/admin';

test('real admin denies anonymous HTML and does not serialize private entities', async ({ page }) => {
  for (const path of ['/admin', '/admin/owners', '/admin/businesses', '/admin/subscriptions', '/admin/content', '/admin/reviews', '/admin/audit']) {
    await visitAdmin(page, path);
    await expect(page.getByRole('heading', { name: 'Вход в панель', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Войти с MFA' })).toHaveAttribute('href', '/auth/admin');
    await expect(page.locator('table, input[name="phone"], input[name="receiptReference"]')).toHaveCount(0);
    expect(await page.content()).not.toMatch(/demo-owner-\d|encryptedSecret|passwordPHC|tokenDigest|"phone"\s*:\s*"\+\d/);
  }
});

test('browser login bootstraps CSRF through actual Next proxy without injected Origin', async ({ page }) => {
  await visitAdmin(page, '/auth/admin');
  await page.getByLabel('Электронная почта', { exact: true }).fill('adminqa-nonexistent@fixture.invalid');
  await page.getByLabel('Пароль', { exact: true }).fill('QA intentionally invalid password');
  // No route interception, extra headers, request-context auth or manual cookie injection.
  const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/csrf' && r.request().method() === 'POST');
  const login = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/login', { timeout: 12_000 });
  // Register rejection handling before awaiting bootstrap, so failure cannot leave an unhandled wait.
  const loginResult = login.then(response => ({ response }), error => ({ error }));
  await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
  expect((await bootstrap).status(), 'Real browser must obtain preauth without a spoofed Origin header').toBe(200);
  const result = await loginResult;
  expect('response' in result, 'Login request must follow successful real CSRF bootstrap').toBe(true);
  if (!('response' in result)) throw new Error('Login did not reach API after CSRF bootstrap');
  expect(result.response.status()).toBe(401);
  expect((await result.response.json()).error.code).toBe('INVALID_CREDENTIALS');
  await expect(page.locator('main .admin-error[role="alert"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Войти в управление', exact: true })).toBeVisible();
});

for (const width of widths) test(`operator login accessible at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitAdmin(page, '/auth/admin');
  await expect(page.getByLabel('Электронная почта', { exact: true })).toHaveAttribute('autocomplete', 'username');
  await expect(page.getByLabel('Пароль', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Электронная почта', { exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Пароль', { exact: true })).toBeFocused();
  await checkAdminLayout(page, info);
});

test('anonymous API read protections are actual handlers, not 404 placeholders', async ({ request }) => {
  const origin = adminOrigin('API_URL');
  for (const path of ['/admin/catalog/businesses', '/admin/crm/owners?dataScope=production', '/admin/media', '/admin/audit']) {
    const response = await request.get(`${origin}/api/v1${path}`);
    expect(response.status(), `${path}: missing implementation/unavailable is BLOCKED, never a passing denial`).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
    const body = await response.json();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.data).toBeUndefined();
  }
});

test('anonymous typed admin mutations cannot bypass guard through case or slash', async ({ request }) => {
  const origin = adminOrigin('API_URL');
  // Empty bodies and a nonexistent resource ID cannot form valid mutations even on a defective guard.
  const absentId = '00000000-0000-4000-8000-000000000014';
  const targets = [
    '/admin/catalog/businesses', '/admin/crm/owners', '/admin/media',
    `/admin/crm/owners/${absentId}/reveal-phone`,
    `/admin/listings/${absentId}/manual-payment`
  ];
  for (const path of targets) for (const variant of [path, path + '/', path.toUpperCase()]) {
    const response = await request.post(`${origin}/api/v1${variant}`, { data: {} });
    // A deliberate routing rejection is allowed for variants, never for the canonical operation.
    if (variant !== path && response.status() === 404) continue;
    expect(response.status(), variant).toBe(401);
    expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    expect(response.headers()['cache-control']).toContain('no-store');
  }
});
