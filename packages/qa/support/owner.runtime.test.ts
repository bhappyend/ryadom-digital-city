import { it, expect } from 'vitest';
import { chromium, expect as visible } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

async function free(port: number) {
  await new Promise<void>((ok, fail) => { const server = createServer(); server.once('error', fail); server.listen(port, '127.0.0.1', () => server.close(e => e ? fail(e) : ok())); });
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise<void>(ok => child.once('exit', () => ok())); child.kill();
  await Promise.race([done, new Promise<void>(ok => setTimeout(ok, 5000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await done; }
}
it('admin issues owner credentials; anonymous platform has no registration; owner login and reset work', async () => {
  if (process.env.ADMIN_QA_ISOLATED !== '1' || process.env.ADMIN_QA_BUILD_READY !== '1') throw new Error('Requires frozen build and isolated runtime window');
  await free(3001); await free(3171);
  const routes = JSON.parse(await readFile('apps/web/.next/routes-manifest.json', 'utf8'));
  expect(JSON.stringify(routes.rewrites)).toContain('http://127.0.0.1:3001/api/v1/');
  const { createAccountFixture } = await import(resolve('apps/api/test/account-fixture.ts'));
  const { totp } = await import(resolve('apps/api/src/account-crypto.ts'));
  const origin = 'http://127.0.0.1:3171'; let f: any; let web: ChildProcess | undefined; let browser;
  const completed: string[] = [];
  try {
    f = await createAccountFixture({ origin, port: 3001 });
    expect(f.name).toMatch(/^ryadom_accounttest_[a-f0-9]{32}$/);
    const exec = (op: string, body: unknown, params = {}) => f.admin.execute(op, { body, params, query: {} }, { actorId: f.account.id, requestId: randomUUID() });
    const reason = 'TEST ONLY isolated operator provision and business fixture';
    const owner = await exec('createCrmOwner', { dataScope: 'production', displayName: 'TEST ONLY access owner', accountId: null, notes: null, reason });
    const place = await exec('createCatalogBusiness', { organization: { name: 'TEST ONLY applicant cafe', cityId: 'smolensk', categoryIds: ['cafe'], address: 'TEST ONLY address', coordinates: { lon: 32.0453, lat: 54.7826 }, description: null, phone: null, website: null, openingHours: null }, addressParts: { street: 'TEST ONLY street', house: null }, provenance: [{ sourceId: 'osm', sourceRecordId: randomUUID(), sourceUrl: null, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', sourceUpdatedAt: null, importedAt: new Date().toISOString() }], photos: [], reason });
    await exec('publishCatalogBusiness', { expectedVersion: place.version }, { placeId: place.id });
    const placeRow = (await f.setup.query('SELECT slug FROM places WHERE id=$1', [place.id])).rows[0];
    web = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3171'], { cwd: resolve('apps/web'), env: { ...process.env, API_URL: 'http://127.0.0.1:3001', NODE_ENV: 'production' }, windowsHide: true, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (web.exitCode !== null) throw new Error('Next exited');
      try { if ((await fetch(origin + '/business', { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch {}
      await new Promise(ok => setTimeout(ok, 250));
    }
    expect(ready).toBe(true);
    browser = await chromium.launch(); const context = await browser.newContext({ serviceWorkers: 'block' }); const page = await context.newPage();
    expect((await context.request.get(origin + '/auth/register')).status()).toBe(404);
    await page.goto(origin + '/business');
    await visible(page.getByLabel('Логин — электронная почта', { exact: true })).toBeVisible();
    const closedRegistration = await page.evaluate(async () => {
      const csrf = await fetch('/api/v1/auth/csrf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      const token = (await csrf.json()).data.token;
      return (await fetch('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify({ email: 'closed-registration@fixture.invalid', password: 'TEST ONLY closed registration', displayName: 'TEST ONLY unavailable', terms: { accepted: true, version: 'retired' }, privacy: { accepted: true, version: 'retired' } }), cache: 'no-store' })).status;
    });
    expect(closedRegistration, 'Public registration stays closed even with valid CSRF transport').toBe(503);
    expect(await page.getByRole('link', { name: /регистрац|Создать аккаунт/i }).count()).toBe(0);
    for (const width of [360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `business login width ${width}`).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations, `business login axe ${width}`).toEqual([]);
      if (width === 360 || width === 1440) {
        await mkdir('packages/qa/artifacts/release-owner', { recursive: true });
        await page.screenshot({ path: `packages/qa/artifacts/release-owner/business-${width}.png`, fullPage: true });
      }
    }
    completed.push('no public registration page/links; business login six widths overflow and axe passed');
    const email = `owner-${randomUUID()}@fixture.invalid`;
    const password = `TEST ONLY ${randomUUID()}`;
    const operator = await context.newPage();
    await operator.goto(origin + '/auth/admin');
    await operator.getByLabel('Электронная почта', { exact: true }).fill(f.account.email);
    await operator.getByLabel('Пароль', { exact: true }).fill(f.password);
    await operator.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await operator.getByRole('button', { name: 'Получить секрет TOTP', exact: true }).click();
    const secret = await operator.locator('.admin-secret').innerText();
    await operator.getByLabel('Код из приложения', { exact: true }).fill(totp(secret, Math.floor(Date.now() / 30000)));
    await operator.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await operator.getByRole('button', { name: 'Коды сохранены, продолжить', exact: true }).click();
    await operator.goto(origin + '/admin/owners');
    const row = operator.getByRole('row').filter({ hasText: 'TEST ONLY access owner' });
    await row.getByRole('button', { name: 'Создать доступ', exact: true }).click();
    let dialog = operator.getByRole('dialog');
    await dialog.getByLabel('Логин — электронная почта', { exact: true }).fill(email);
    await dialog.getByLabel('Новый пароль', { exact: true }).fill(password);
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill(reason);
    await dialog.getByRole('checkbox').check();
    const issued = operator.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/admin/crm/owners/${owner.id}/access` && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Создать доступ', exact: true }).click();
    const issuedResponse = await issued; expect(issuedResponse.ok()).toBe(true);
    const issuedBody = await issuedResponse.json(); expect(JSON.stringify(issuedBody)).not.toContain(password);
    await visible(dialog).toHaveCount(0);
    const user = (await f.setup.query('SELECT id,email_verified_at,password_phc FROM users WHERE id=$1', [issuedBody.data.accountId])).rows[0];
    expect(user.email_verified_at).toBeNull(); expect(user.password_phc).toMatch(/^\$argon2id\$/);
    expect((await f.setup.query('SELECT count(*)::int n FROM account_consents WHERE user_id=$1', [user.id])).rows[0].n).toBe(0);
    const customer = await browser.newContext({ serviceWorkers: 'block' });
    const ownerPage = await customer.newPage();
    await ownerPage.goto(origin + '/business');
    await ownerPage.getByLabel('Логин — электронная почта', { exact: true }).fill(email);
    await ownerPage.getByLabel('Пароль', { exact: true }).fill(password);
    await ownerPage.getByRole('button', { name: 'Войти в кабинет', exact: true }).click();
    await ownerPage.waitForURL(origin + '/auth/business');
    await page.close();
    const accountPage = ownerPage;
    await accountPage.goto(origin + '/auth/business?place=' + encodeURIComponent(placeRow.slug));
    await visible(accountPage.getByLabel('Основания и доступные доказательства', { exact: true })).toBeVisible();
    await accountPage.getByLabel('Основания и доступные доказательства', { exact: true }).fill('TEST ONLY independently checkable business evidence');
    await accountPage.getByRole('checkbox', { name: /Подтверждаю достоверность/ }).check();
    const claim = accountPage.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/business/claims' && r.request().method() === 'POST');
    await accountPage.getByRole('button', { name: 'Отправить заявку о правах', exact: true }).click(); expect((await claim).status()).toBe(202);
    await accountPage.getByLabel('Что нужно разместить или уточнить', { exact: true }).fill('TEST ONLY monthly listing application');
    await accountPage.getByRole('checkbox', { name: /Согласен на рассмотрение анкеты/ }).check();
    const listing = accountPage.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/business/listings' && r.request().method() === 'POST');
    await accountPage.getByRole('button', { name: 'Отправить анкету', exact: true }).click(); expect((await listing).status()).toBe(202);
    await accountPage.reload(); await visible(accountPage.getByRole('heading', { name: 'Мои заявки для бизнеса', exact: true })).toBeVisible();
    expect((await f.setup.query('SELECT status FROM owner_claims WHERE applicant_id=$1', [user.id])).rows).toEqual([{ status: 'pending' }]);
    expect((await f.setup.query('SELECT count(*)::int n FROM business_memberships WHERE user_id=$1', [user.id])).rows[0].n).toBe(0);
    completed.push('operator-created credentials login; own claim/listing persisted without public registration or fake consent');
    await operator.goto(origin + '/admin/owners');
    await operator.getByRole('row').filter({ hasText: 'TEST ONLY access owner' }).getByRole('button', { name: 'Сменить пароль владельца', exact: true }).click();
    dialog = operator.getByRole('dialog');
    const newPassword = `TEST ONLY reset ${randomUUID()}`;
    await dialog.getByLabel('Логин — электронная почта', { exact: true }).fill(email);
    await dialog.getByLabel('Новый пароль', { exact: true }).fill(newPassword);
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY requested credential reset, no ownership or payment grant');
    await dialog.getByRole('checkbox').check();
    const reset = operator.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/admin/crm/owners/${owner.id}/access` && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Сменить пароль владельца', exact: true }).click();
    expect((await reset).ok()).toBe(true); await visible(dialog).toHaveCount(0);
    expect((await customer.request.get(origin + '/api/v1/business/claims')).status()).toBe(401);
    await accountPage.goto(origin + '/business');
    await accountPage.getByLabel('Логин — электронная почта', { exact: true }).fill(email);
    await accountPage.getByLabel('Пароль', { exact: true }).fill(newPassword);
    await accountPage.getByRole('button', { name: 'Войти в кабинет', exact: true }).click();
    await accountPage.waitForURL(origin + '/auth/business');
    const logout = accountPage.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/logout' && r.request().method() === 'POST');
    await accountPage.getByRole('button', { name: 'Выйти', exact: true }).click(); expect((await logout).status()).toBe(200);
    await accountPage.waitForURL(origin + '/business');
    expect((await customer.request.get(origin + '/api/v1/business/claims')).status()).toBe(401);
    completed.push('admin reset revokes prior owner session; new credentials work; logout revokes access');
  } finally {
    try { await browser?.close(); } finally { try { await stop(web); } finally { await f?.cleanup(); } }
    await mkdir('packages/qa/artifacts/release-owner', { recursive: true });
    await writeFile('packages/qa/artifacts/release-owner/checkpoint.json', JSON.stringify({ completed, privateDataCaptured: false }, null, 2));
  }
});
