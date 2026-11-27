import { it, expect } from 'vitest';
import { chromium, expect as browserExpect, type Browser } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function requireFree(port: number) {
  await new Promise<void>((ok, fail) => {
    const s = createServer(); s.once('error', () => fail(new Error(`BLOCKED: port ${port} occupied; only17 may stop stable services`)));
    s.listen(port, '127.0.0.1', () => s.close(error => error ? fail(error) : ok()));
  });
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>(ok => child.once('exit', () => ok()));
  child.kill(); await Promise.race([exited, new Promise<void>(ok => setTimeout(ok, 5000))]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await exited; }
}

it('isolated genuine Next proxy + SSR + browser MFA/CRM/CMS persistence', async () => {
  if (process.env.ADMIN_QA_ISOLATED !== '1' || process.env.ADMIN_QA_BUILD_READY !== '1') throw new Error('BLOCKED:17 must release frozen build and isolated runtime window');
  await requireFree(3001); await requireFree(3171);
  const manifest = JSON.parse(await readFile(resolve('apps/web/.next/routes-manifest.json'), 'utf8'));
  const rewriteText = JSON.stringify(manifest.rewrites);
  expect(rewriteText, 'Frozen rewrite must target fixture3001').toContain('http://127.0.0.1:3001/api/v1/');
  if (/localhost:3001|https:\/\//.test(rewriteText)) throw new Error('BLOCKED: ambiguous API rewrite target');
  const fixtureModule = resolve('apps/api/test/account-fixture.ts');
  const cryptoModule = resolve('apps/api/src/account-crypto.ts');
  const { createAccountFixture, prepareManualAdminFixture } = await import(fixtureModule);
  const { totp } = await import(cryptoModule);
  const { DEPENDENCIES } = await import(resolve('apps/api/src/dependencies.ts'));
  const slice = process.env.ADMIN_QA_SLICE ?? 'full';
  if (!['full', 'catalog', 'cms', 'public', 'media', 'finance', 'review', 'activation'].includes(slice)) throw new Error('Invalid ADMIN_QA_SLICE');
  const origin = 'http://127.0.0.1:3171';
  let f: any; let web: ChildProcess | undefined; let browser: Browser | undefined; let publicRun: ChildProcess | undefined;
  const completed: string[] = []; const marker = randomUUID(); let ssrMe = 0;
  const meTransport: { hasCookie: boolean; hasOrigin: boolean; hasReferer: boolean; hasFetchSite: boolean; hasFetchDest: boolean; fetchMode: string | null }[] = [];
  const failures: { method: string; path: string; status: number; code: string | null }[] = [];
  const requestCounts: Record<string, number> = {};
  const browserRequestCounts: Record<string, number> = {};
  const rateCounts: Record<string, number> = {};
  const rateDenials: { scope: string; max: number | null; windowMs: number | null; code: string }[] = [];
  let formDiagnostic: unknown = null;
  const runId = process.env.QA_RUN_ID ?? 'admin-isolated';
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(runId)) throw new Error('Invalid QA_RUN_ID');
  const out = resolve('packages/qa/artifacts', runId); await mkdir(out, { recursive: true });
  try {
    f = await createAccountFixture({ origin, port: 3001 });
    const domain = ['finance', 'review', 'activation'].includes(slice) ? await prepareManualAdminFixture(f, slice === 'finance' ? { pendingQuote: true } : {}) : null;
    if (slice === 'activation') {
      const run = (op: string, body: unknown, params: Record<string, string> = {}, actorId = f.account.id) => f.admin.execute(op, { body, params, query: {} }, { actorId, requestId: randomUUID() });
      await run('publishCatalogBusiness', { expectedVersion: domain.business.version }, { placeId: domain.business.id });
      await run('createOwnershipClaim', { placeId: domain.business.id, relationship: 'owner', evidenceText: 'TEST ONLY independent business registry evidence', consent: true }, {}, domain.applicantId);
    }
    expect(f.name).toMatch(/^ryadom_accounttest_[a-f0-9]{32}$/);
    expect(f.app.getHttpServer().address().port, 'Helper must honor fixed fixture port; no fallback').toBe(3001);
    const accountRate = f.runtime.rate;
    const consumeAccount = accountRate.consume.bind(accountRate);
    accountRate.consume = async (scope: string, subject: string, max: number, windowMs: number) => {
      rateCounts[`account:${scope}`] = (rateCounts[`account:${scope}`] ?? 0) + 1;
      try { return await consumeAccount(scope, subject, max, windowMs); }
      catch (e) { rateDenials.push({ scope: `account:${scope}`, max, windowMs, code: (e as any)?.code ?? 'UNKNOWN' }); throw e; }
    };
    const publicRate = f.app.get(DEPENDENCIES).limiter;
    const consumePublic = publicRate.consume.bind(publicRate);
    publicRate.consume = async (subject: string, scope: string) => {
      rateCounts[`public:${scope}`] = (rateCounts[`public:${scope}`] ?? 0) + 1;
      try { return await consumePublic(subject, scope); }
      catch (e) { rateDenials.push({ scope: `public:${scope}`, max: null, windowMs: null, code: (e as any)?.code ?? 'UNKNOWN' }); throw e; }
    };
    f.app.getHttpServer().prependListener('request', (req: any, res: any) => {
      res.setHeader('X-Admin-QA-Fixture', marker);
      const safePath = String(req.url).split('?')[0]!.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}');
      const requestKey = `${req.method} ${safePath}`;
      requestCounts[requestKey] = (requestCounts[requestKey] ?? 0) + 1;
    if (req.url === '/api/v1/auth/me') {
      const shape = { hasCookie: !!req.headers.cookie, hasOrigin: !!req.headers.origin, hasReferer: !!req.headers.referer, hasFetchSite: !!req.headers['sec-fetch-site'], hasFetchDest: !!req.headers['sec-fetch-dest'], fetchMode: typeof req.headers['sec-fetch-mode'] === 'string' ? req.headers['sec-fetch-mode'] : null };
      meTransport.push(shape);
      // Node/Undici also emits mode:cors. Browser fetch additionally has Referer/Site/Dest.
      if (shape.hasCookie && !shape.hasOrigin && !shape.hasReferer && !shape.hasFetchSite && !shape.hasFetchDest) ssrMe++;
    }
    });
    web = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3171'], {
      cwd: resolve('apps/web'), env: { ...process.env, API_URL: 'http://127.0.0.1:3001', NODE_ENV: 'production' }, windowsHide: true, stdio: 'ignore'
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (web.exitCode !== null) throw new Error('BLOCKED: isolated Next process exited');
      try { if ((await fetch(origin + '/auth/admin', { signal: AbortSignal.timeout(1000) })).status === 200) { ready = true; break; } } catch {}
      await new Promise(ok => setTimeout(ok, 250));
    }
    expect(ready, 'Frozen Next build ready').toBe(true);
    const probe = await fetch(origin + '/api/v1/admin/catalog/businesses');
    expect(probe.headers.get('x-admin-qa-fixture'), 'Real proxy reaches unique temporaryAPI').toBe(marker);
    expect(probe.status).toBe(401);
    completed.push('unique fixture API proxy401 before auth');
    if (slice === 'public') {
      publicRun = spawn(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', resolve('packages/qa/support/admin.config.ts'), '--project', 'admin-public', '--global-timeout=90000'], {
        cwd: resolve('.'), env: { ...process.env, BASE_URL: origin, API_URL: 'http://127.0.0.1:3001' }, windowsHide: true, stdio: 'inherit'
      });
      const exit = await new Promise<number | null>((ok, fail) => { publicRun!.once('error', fail); publicRun!.once('exit', ok); });
      expect(exit, 'Isolated real public admin Playwright project').toBe(0);
      completed.push('public admin project actual 10 tests passed against enabled disposable fixture');
      return;
    }
    browser = await chromium.launch();
    const context = await browser.newContext({ serviceWorkers: slice === 'media' ? 'allow' : 'block' });
    const page = await context.newPage();
    page.on('request', req => {
      const path = new URL(req.url()).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}');
      const h = req.headers();
      const key = `${req.method()} ${path} rsc=${h.rsc === '1'} prefetch=${h['next-router-prefetch'] === '1' || h.purpose === 'prefetch' || h['sec-purpose']?.includes('prefetch') === true}`;
      browserRequestCounts[key] = (browserRequestCounts[key] ?? 0) + 1;
    });
    page.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (!path.startsWith('/api/v1/') || response.status() < 400) return;
      void response.json().then(body => failures.push({ method: response.request().method(), path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: response.status(), code: typeof body?.error?.code === 'string' ? body.error.code : null })).catch(() => {});
    });
    if (slice === 'media') {
      await page.goto(origin + '/');
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Actual production SW controls isolated browser').toBe(true);
      completed.push('real service worker registration/controlled page before authenticated media flow');
    }
    await page.goto(origin + '/auth/admin');
    await page.getByLabel('Электронная почта', { exact: true }).fill(f.account.email);
    await page.getByLabel('Пароль', { exact: true }).fill(f.password);
    const bootstrap = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/csrf' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    const boot = await bootstrap;
    expect(boot.status()).toBe(200); expect(boot.headers()['x-admin-qa-fixture']).toBe(marker);
    await browserExpect(page.getByRole('heading', { name: 'Подтвердите MFA', exact: true })).toBeVisible();
    const deniedPage = await context.newPage();
    await deniedPage.goto(origin + '/admin');
    await browserExpect(deniedPage.getByRole('heading', { name: 'Вход в панель', exact: true })).toBeVisible();
    await deniedPage.close();
    completed.push('actual browser POST bootstrap/password-only admin denied');
    // Preserve the real password challenge in its original UI while checking denial in another tab.
    await page.getByRole('button', { name: 'Получить секрет TOTP', exact: true }).click();
    const secret = await page.locator('.admin-secret').innerText();
    await page.getByLabel('Код из приложения', { exact: true }).fill(totp(secret, Math.floor(Date.now() / 30000)));
    await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
    await browserExpect(page.getByRole('heading', { name: 'Сохраните коды восстановления' })).toBeVisible();
    await page.getByRole('button', { name: 'Коды сохранены, продолжить' }).click();
    await browserExpect(page.getByRole('heading', { name: 'Обзор', exact: true })).toBeVisible();
    expect(ssrMe, 'SSR gate calls same genuine fixture after cookie authentication').toBeGreaterThan(0);
    completed.push('browser MFA enrollment + genuine SSR fixture gate');
    if (slice === 'full') {
    await page.goto(origin + '/admin/owners');
    await page.getByRole('button', { name: 'Добавить владельца' }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя владельца', { exact: true }).fill('TEST ONLY browser CRM');
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY isolated browser persistence check');
    await dialog.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
    await browserExpect(dialog).toHaveCount(0);
    await page.reload();
    const row = page.getByRole('row').filter({ hasText: 'TEST ONLY browser CRM' });
    await browserExpect(row).toBeVisible();
    await browserExpect(row).toContainText('Оплаченный период не подтверждён');
    const dbOwner = (await f.setup.query("SELECT id FROM owner_crm WHERE display_name=$1", ['TEST ONLY browser CRM'])).rows[0];
    expect(dbOwner?.id).toBeTruthy();
    completed.push('CRM create UI→DB→reload, no invented funded days');
    await row.getByRole('button', { name: 'Контакт', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Новый телефон, либо пусто для удаления', { exact: true }).fill('+7 (000) 000-00-14');
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY synthetic nonroutable phone');
    await dialog.getByRole('button', { name: 'Сохранить контакт', exact: true }).click();
    await browserExpect(dialog).toHaveCount(0); await page.reload();
    await browserExpect(row).not.toContainText('+7 (000)');
    await row.getByRole('button', { name: 'Показать с аудитом' }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY audited reveal browser check');
    await dialog.getByRole('button', { name: 'Раскрыть контакт', exact: true }).click();
    await browserExpect(row).toContainText('+7 (000) 000-00-14');
    expect((await f.setup.query("SELECT count(*)::int n FROM audit_events WHERE action='owner.phone-reveal' AND resource_id=$1", [dbOwner.id])).rows[0].n).toBeGreaterThan(0);
    await page.goto(origin + '/admin/businesses'); await page.goto(origin + '/admin/owners');
    await browserExpect(row).not.toContainText('+7 (000)');
    completed.push('phone masked/reasoned reveal/audit/navigation hides');
    }
    let dialog = page.getByRole('dialog');
    // Genuine browser fetch transport; no request interception or forbidden Origin spoofing.
    const api = async (method: string, path: string, body?: unknown, expectedStatus = 200): Promise<any> => {
      const result = await page.evaluate(async ({ method, path, body }) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (method !== 'GET') {
          const c = await fetch('/api/v1/auth/csrf', { method: 'POST', credentials: 'same-origin', headers, body: '{}', cache: 'no-store' });
          if (!c.ok) return { status: c.status, body: null };
          headers['X-CSRF-Token'] = (await c.json()).data.token;
        }
        const r = await fetch('/api/v1' + path, { method, credentials: 'same-origin', cache: 'no-store', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        return { status: r.status, body: await r.json() };
      }, { method, path, body });
      expect(result.status, `Genuine browser ${method} ${path}`).toBe(expectedStatus);
      return expectedStatus < 400 ? result.body.data : result.body.error;
    };
    if (slice === 'activation') {
      await page.goto(origin + '/admin/claims');
      await page.getByRole('button', { name: 'Изучить доказательства и решение', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Решение', { exact: true }).selectOption('verify');
      await dialog.getByLabel('Фактический способ проверки', { exact: true }).selectOption('independent_registry');
      await dialog.getByLabel('Источник, выполненная проверка и обоснование', { exact: true }).fill('TEST ONLY actual independent registry check in disposable fixture');
      await dialog.getByRole('checkbox').check();
      const decision = page.waitForResponse(r => /\/admin\/claims\/[^/]+\/decision$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
      await dialog.locator('button[type=submit], button.admin-primary').click();
      expect((await decision).status()).toBe(200);
      await browserExpect(dialog).toHaveCount(0);
      const account = (await f.setup.query('SELECT email_verified_at FROM users WHERE id=$1', [domain.applicantId])).rows[0];
      expect(account.email_verified_at).toBeNull();
      expect((await api('GET', `/admin/crm/owners/${domain.owner.id}`)).fundedSubscriptionSummary).toBeNull();
      const current = await api('GET', `/admin/listings/${domain.listing.id}`);
      const payment = await api('POST', `/admin/listings/${domain.listing.id}/manual-payment`, { ...domain.payment, expectedVersion: current.listing.version });
      expect(payment.subscription.status).toBe('pending');
      await page.goto(origin + '/admin/subscriptions');
      await page.getByRole('button', { name: 'Решение по анкете', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Решение', { exact: true }).selectOption('approve');
      await dialog.getByLabel('Заключение независимого модератора', { exact: true }).fill('TEST ONLY independently checked actual agreement, receipt and current month');
      await dialog.getByRole('checkbox').check();
      const publish = page.waitForResponse(r => /\/admin\/listings\/[^/]+\/decision$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Сохранить решение по анкете', exact: true }).click();
      expect((await publish).status()).toBe(200);
      await browserExpect(dialog).toHaveCount(0);
      const summary = (await api('GET', `/admin/crm/owners/${domain.owner.id}`)).fundedSubscriptionSummary;
      expect(summary).toMatchObject({ fundingSource: 'confirmed-funds', subscription: { status: 'active' } });
      completed.push('actual admin ownership evidence UI and funded listing approval UI; active summary only after independent approval, no email mutation');
    }
    if (slice === 'finance') {
      await page.goto(origin + '/admin/owners');
      const ownerRow = page.getByRole('row').filter({ hasText: domain.owner.displayName });
      await browserExpect(ownerRow).toContainText('Оплаченный период не подтверждён');
      await page.goto(origin + '/admin/subscriptions');
      const listingRow = page.getByRole('row').filter({ hasText: domain.business.organization.name });
      await browserExpect(listingRow).toContainText('Фактическое поступление не подтверждено');
      await listingRow.getByRole('button', { name: 'Предложить месячные условия', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.locator('input[name="amount"]').fill(String(domain.quoteInput.amountRub));
      await dialog.getByLabel('Условия предложения', { exact: true }).fill(domain.quoteInput.terms);
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Сохранить месячное предложение', exact: true }).click();
      await browserExpect(dialog).toHaveCount(0);
      await listingRow.getByRole('button', { name: 'Записать согласование', exact: true }).click();
      dialog = page.getByRole('dialog');
      if (await dialog.locator('select[name="ownerId"]').count()) await dialog.locator('select[name="ownerId"]').selectOption(domain.owner.id);
      for (const [name, value] of [['acceptedBy', domain.agreementInput.acceptedBy], ['acceptedAt', domain.agreementInput.acceptedAt], ['reference', domain.agreementInput.agreementReference], ['timezone', domain.agreementInput.billingTimezone], ['anchor', domain.agreementInput.billingAnchorAt]]) {
        await dialog.locator(`input[name="${name}"]`).fill(value as string);
      }
      await dialog.locator('select[name="channel"]').selectOption(domain.agreementInput.channel);
      await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill(domain.agreementInput.verificationNote);
      await dialog.getByRole('checkbox').check();
      await dialog.getByRole('button', { name: 'Записать реальное принятие условий', exact: true }).click();
      await browserExpect(dialog).toHaveCount(0);
      await page.reload();
      await browserExpect(listingRow).toContainText('Фактическое поступление не подтверждено');
      await browserExpect(page.getByRole('link', { name: 'VK · desktopcoder', exact: true })).toHaveAttribute('href', 'https://vk.ru/desktopcoder');
      await browserExpect(page.getByRole('link', { name: 'Telegram · desktopcoder', exact: true })).toHaveAttribute('href', 'https://t.me/desktopcoder');
      // Links are inspected only; no founder message/contact click/payment operation outside fixture.
      await listingRow.getByRole('button', { name: 'Подтвердить полученный месяц', exact: true }).click();
      dialog = page.getByRole('dialog');
      for (const [name, value] of [['receipt', domain.payment.receiptReference], ['receivedAt', domain.payment.receivedAt], ['start', domain.payment.periodStartsAt], ['end', domain.payment.periodEndsAt]]) {
        await dialog.locator(`input[name="${name}"]`).fill(value as string);
      }
      await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill(domain.payment.reason);
      await dialog.getByRole('checkbox').check();
      const submitted = page.waitForRequest(r => new URL(r.url()).pathname === `/api/v1/admin/listings/${domain.listing.id}/manual-payment` && r.method() === 'POST');
      const received = page.waitForResponse(r => new URL(r.url()).pathname === `/api/v1/admin/listings/${domain.listing.id}/manual-payment` && r.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Подтвердить реальное поступление', exact: true }).click();
      const payload = (await submitted).postDataJSON();
      expect((await received).status()).toBe(200);
      await browserExpect(dialog).toHaveCount(0); await page.reload();
      const recorded = await api('POST', `/admin/listings/${domain.listing.id}/manual-payment`, payload);
      expect(recorded.paymentState).toBe('manually-confirmed');
      expect(recorded.placementState).toBe('pending-review');
      await api('POST', `/admin/listings/${domain.listing.id}/manual-payment`, { ...payload, amountRub: payload.amountRub + 1 }, 409);
      expect((await f.setup.query('SELECT count(*)::int n FROM manual_subscription_payments WHERE listing_id=$1', [domain.listing.id])).rows[0].n).toBe(1);
      const owners = await api('GET', '/admin/crm/owners?dataScope=production');
      const projected = owners.items.find((o: any) => o.id === domain.owner.id);
      expect(projected.fundedSubscriptionSummary ?? null, 'Pending ownership/content approval must not claim active paid entitlement').toBeNull();
      await page.goto(origin + '/admin/owners');
      await browserExpect(ownerRow).toContainText('Оплаченный период не подтверждён');
      completed.push('manual monthly actual UI lookup/agreed receipt/period audited; same-key replay idempotent/changed409; no paid entitlement before approval');
    }
    if (slice === 'review') {
      await page.goto(origin + '/admin/reviews');
      const reviewPanel = page.locator('.admin-panel').filter({ hasText: domain.review.originalText }).first();
      await reviewPanel.getByRole('button', { name: 'Оригинал и редакторская история', exact: true }).click();
      dialog = page.getByRole('dialog');
      await browserExpect(dialog).toContainText(domain.review.originalText);
      const corrected = 'TEST ONLY corrected author review with editorial attribution';
      await dialog.getByLabel('Исправленный текст', { exact: true }).fill(corrected);
      await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY editorial typo correction preserving original author');
      await dialog.getByRole('button', { name: 'Сохранить отдельную правку с аудитом', exact: true }).click();
      await browserExpect(dialog).toHaveCount(0);
      const edited = await api('GET', `/admin/reviews/${domain.review.id}/editor`);
      expect(edited.originalText).toBe(domain.review.originalText);
      expect(edited.review.authorId).toBe(domain.review.authorId); expect(edited.review.rating).toBe(domain.review.rating);
      expect(edited.review.status).toBe('pending'); expect(edited.corrections).toHaveLength(1);
      expect(edited.corrections[0].correctedText).toBe(corrected);
      expect(edited.corrections[0].auditId).toBeTruthy();
      await api('POST', `/admin/moderation/place-review/${domain.review.id}/decision`, { decision: 'approve', expectedVersion: edited.review.version, note: 'TEST ONLY prohibited self approval attempt' }, 403);
      completed.push('review UI correction preserves immutable original/author/rating/history/audit; editor cannot self-approve');
      await api('POST', '/auth/logout', {});
      await page.goto(origin + '/auth/admin');
      await page.getByLabel('Электронная почта', { exact: true }).fill(domain.reviewer.account.email);
      await page.getByLabel('Пароль', { exact: true }).fill(domain.reviewer.password);
      await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
      await page.getByRole('button', { name: 'Получить секрет TOTP', exact: true }).click();
      const reviewerSecret = await page.locator('.admin-secret').innerText();
      await page.getByLabel('Код из приложения', { exact: true }).fill(totp(reviewerSecret, Math.floor(Date.now() / 30000)));
      await page.getByRole('button', { name: 'Подтвердить', exact: true }).click();
      await page.getByRole('button', { name: 'Коды сохранены, продолжить', exact: true }).click();
      await page.goto(origin + '/admin/reviews');
      const independentPanel = page.locator('.admin-panel').filter({ hasText: corrected }).first();
      await independentPanel.getByRole('button', { name: 'Одобрить', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY independent reviewer verified editorial correction');
      await dialog.getByRole('button', { name: 'Подтвердить решение', exact: true }).click();
      await browserExpect(dialog).toHaveCount(0);
      const finalReview = (await f.setup.query('SELECT author_id,rating,original_text,text,status FROM account_reviews WHERE id=$1', [domain.review.id])).rows[0];
      expect(finalReview.author_id).toBe(domain.review.authorId); expect(finalReview.rating).toBe(domain.review.rating);
      expect(finalReview.original_text).toBe(domain.review.originalText); expect(finalReview.text).toBe(corrected); expect(finalReview.status).toBe('published');
      completed.push('independent moderator genuine UI password/MFA approves correction; immutable original preserved');
    }
    if (slice === 'media') {
      const sharp = (await import('sharp')).default;
      const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#25a080' } }).png().toBuffer();
      await page.goto(origin + '/admin/media');
      await page.locator('select[name="purpose"]').selectOption('business-photo');
      await page.getByLabel('Файл', { exact: true }).setInputFiles({ name: 'qa-test-only.png', mimeType: 'image/png', buffer: png });
      await page.getByLabel('Автор / атрибуция', { exact: true }).fill('TEST ONLY synthetic raster fixture');
      await page.getByLabel('Лицензия или основание использования', { exact: true }).fill('TEST ONLY generated test pixels');
      await page.getByLabel('Подтверждаю права на использование изображения.', { exact: true }).check();
      const uploadResponse = page.waitForResponse(r => /\/api\/v1\/admin\/media\/[a-f0-9-]+\/content$/.test(new URL(r.url()).pathname) && r.request().method() === 'PUT');
      await page.getByRole('button', { name: 'Загрузить с проверкой', exact: true }).click();
      const uploadedResponse = await uploadResponse;
      expect(uploadedResponse.status()).toBe(200);
      const image = (await uploadedResponse.json()).data;
      expect(image.mime).toBe('image/webp'); expect(image.width).toBe(8);
      await browserExpect(page.getByRole('status').filter({ hasText: 'Изображение принято:' })).toBeVisible();
      const privateResponse = await fetch(origin + `/media/${image.id}.webp`);
      expect(privateResponse.status).toBe(404);
      const draft = await api('PUT', '/admin/cms/homepage', { expectedVersion: null, document: { kind: 'section', title: 'TEST ONLY approved image', blocks: [{ kind: 'image', asset: { source: 'uploaded', mediaId: image.id, url: image.url, alt: 'TEST ONLY synthetic raster' }, caption: 'TEST ONLY raster, not business photograph' }] }, changeNote: 'TEST ONLY publish checked image reference' });
      await api('POST', '/admin/cms/homepage/publish', { expectedVersion: draft.version, revisionId: draft.id });
      const publicImage = await fetch(origin + `/media/${image.id}.webp`);
      expect(publicImage.status).toBe(200); expect(publicImage.headers.get('content-type')).toContain('image/webp');
      expect(publicImage.headers.get('x-content-type-options')).toBe('nosniff');
      const osm = JSON.parse(await readFile(resolve('data/osm/smolensk-replay.json'), 'utf8'));
      const source = osm.elements.find((e: any) => e.type === 'node' && e.tags?.amenity === 'cafe' && e.tags.name && e.tags['addr:street'] && e.tags['addr:housenumber'] && e.lon && e.lat);
      const business = await api('POST', '/admin/catalog/businesses', { organization: { name: source.tags.name, cityId: 'smolensk', categoryIds: ['cafe'], address: `Смоленск, ${source.tags['addr:street']}, ${source.tags['addr:housenumber']}`, coordinates: { lon: source.lon, lat: source.lat }, description: null, phone: null, website: null, openingHours: null }, addressParts: { street: source.tags['addr:street'], house: source.tags['addr:housenumber'] }, provenance: [{ sourceId: 'osm', sourceRecordId: `node/${source.id}`, sourceUrl: `https://www.openstreetmap.org/node/${source.id}`, license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', sourceUpdatedAt: source.timestamp, importedAt: new Date().toISOString() }], photos: [], reason: 'TEST ONLY licensed source copy photo attachment' }, 201);
      await page.goto(origin + '/admin/businesses');
      const photoBusinessRow = page.getByRole('row').filter({ hasText: source.tags.name });
      await photoBusinessRow.getByRole('button', { name: 'Изменить', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Выбрать готовое фото из библиотеки', exact: true }).click();
      await dialog.getByRole('button', { name: `Прикрепить фото ${image.id}`, exact: true }).click();
      await dialog.getByLabel('Описание фото 1', { exact: true }).fill('TEST ONLY synthetic raster, not actual business photo');
      await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY approved fixture image attachment');
      await dialog.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
      await browserExpect(dialog).toHaveCount(0);
      await photoBusinessRow.getByRole('button', { name: 'Опубликовать', exact: true }).click();
      await browserExpect(photoBusinessRow).toContainText('published');
      const placeRow = (await f.setup.query('SELECT slug FROM places WHERE id=$1', [business.id])).rows[0];
      const publicPlace = await api('GET', `/places/${placeRow.slug}`);
      expect(publicPlace.photos).toHaveLength(1);
      expect(publicPlace.photos[0].url).toBe(origin + `/media/${image.id}.webp`);
      await page.goto(origin + `/places/${placeRow.slug}`);
      await browserExpect(page.locator(`img[src="${origin}/media/${image.id}.webp"]`)).toBeVisible();
      await page.goto(origin + '/admin/media');
      await page.reload();
      await browserExpect(page.getByText('TEST ONLY synthetic raster fixture', { exact: false }).first()).toBeVisible();
      // Invalid browser file choices must not create successful assets or claim upload success.
      await page.getByLabel('Файл', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>throw 1</script></svg>') });
      await page.getByLabel('Автор / атрибуция', { exact: true }).fill('TEST ONLY rejected SVG');
      await page.getByLabel('Лицензия или основание использования', { exact: true }).fill('TEST ONLY invalid input');
      await page.getByLabel('Подтверждаю права на использование изображения.', { exact: true }).check();
      await page.getByRole('button', { name: 'Загрузить с проверкой', exact: true }).click();
      await browserExpect(page.locator('main .admin-error[role="alert"]')).toBeVisible();
      expect((await f.setup.query("SELECT count(*)::int n FROM media_assets WHERE state='ready'")).rows[0].n).toBe(1);
      await page.getByLabel('Файл', { exact: true }).setInputFiles({ name: 'too-large.png', mimeType: 'image/png', buffer: Buffer.alloc(2_097_153, 0) });
      await page.getByRole('button', { name: 'Загрузить с проверкой', exact: true }).click();
      await browserExpect(page.locator('main .admin-error[role="alert"]')).toBeVisible();
      expect((await f.setup.query('SELECT count(*)::int n FROM media_assets')).rows[0].n).toBe(1);
      completed.push('media PNG UI→WebP/private404→CMS/public200/nosniff; approved business photo UI attach/publish/publicDTO+image; SVG/oversize rejected');
    }
    if (slice === 'full' || slice === 'catalog') {
    const osm = JSON.parse(await readFile(resolve('data/osm/smolensk-replay.json'), 'utf8'));
    const real = osm.elements.find((e: any) => e.type === 'node' && e.tags?.amenity === 'cafe' && e.tags.name && e.tags['addr:street'] && e.tags['addr:housenumber'] && e.lon && e.lat);
    expect(real, 'Licensed local source provides an actual Smolensk cafe').toBeTruthy();
    await page.goto(origin + '/admin/businesses');
    await page.getByRole('button', { name: 'Добавить бизнес', exact: true }).click();
    dialog = page.getByRole('dialog');
    const address = `Смоленск, ${real.tags['addr:street']}, ${real.tags['addr:housenumber']}`;
    for (const [label, value] of [
      ['Название', real.tags.name],
      ['Полный адрес', address], ['Улица', real.tags['addr:street']], ['Дом (если известен)', real.tags['addr:housenumber']],
      ['Долгота WGS84', String(real.lon)], ['Широта WGS84', String(real.lat)],
      ['Зарегистрированный ID источника', 'osm'], ['ID записи в источнике', `node/${real.id}`],
      ['URL источника', `https://www.openstreetmap.org/node/${real.id}`], ['Лицензия / разрешение', 'ODbL-1.0'],
      ['Атрибуция', '© OpenStreetMap contributors'], ['Обновлено в источнике (ISO с часовым поясом, если известно)', real.timestamp]
    ]) await dialog.getByLabel(label as string, { exact: true }).fill(value as string);
    await dialog.locator('label').filter({ hasText: /^Регион/ }).locator('select').selectOption({ label: 'Смоленская область' });
    await dialog.locator('select[name="cityId"]').selectOption('smolensk');
    const geocodeResult = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/geocode');
    await dialog.getByRole('button', { name: 'Найти адрес', exact: true }).click();
    expect((await geocodeResult).status(), 'Fixture deliberately has no geocoder; show honest manual fallback').toBe(503);
    await browserExpect(dialog).toContainText('введите координаты вручную');
    // The wrapping label includes option text; native multiple-select has listbox role.
    await dialog.getByRole('listbox').selectOption(['cafe']);
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY isolated copy of licensed OSM source');
    await dialog.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    try { await browserExpect(dialog).toHaveCount(0); } catch (error) {
      formDiagnostic = await dialog.evaluate(d => ({
        alert: d.querySelector('[role=alert]')?.textContent ?? null,
        controls: Array.from(d.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')).map(i => ({ name: i.name, valid: i.validity.valid, missing: i.validity.valueMissing, typeMismatch: i.validity.typeMismatch, patternMismatch: i.validity.patternMismatch, stepMismatch: i.validity.stepMismatch, badInput: i.validity.badInput, rangeOverflow: i.validity.rangeOverflow, rangeUnderflow: i.validity.rangeUnderflow }))
      }));
      throw error;
    }
    await page.reload();
    const businessRow = page.getByRole('row').filter({ hasText: real.tags.name });
    await browserExpect(businessRow).toContainText(address);
    await businessRow.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await browserExpect(businessRow).toContainText('published');
    await businessRow.getByRole('button', { name: 'Изменить', exact: true }).click();
    dialog = page.getByRole('dialog');
    await browserExpect(dialog.getByLabel('Улица', { exact: true })).toHaveValue(real.tags['addr:street']);
    await browserExpect(dialog.locator('select[name="cityId"]')).toHaveValue('smolensk');
    await dialog.getByLabel('Телефон организации', { exact: true }).fill('+7 (000) 000-00-15');
    await dialog.getByLabel('Сайт (https://)', { exact: true }).fill('https://fixture.invalid');
    await dialog.getByLabel('График работы (пусто — неизвестен)', { exact: true }).fill('Mo-Fr 10:00-18:00');
    await dialog.getByLabel('Описание', { exact: true }).fill('TEST ONLY edited contact and hours in disposable fixture');
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY browser edited draft persistence');
    await dialog.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await browserExpect(dialog).toHaveCount(0); await page.reload();
    await businessRow.getByRole('button', { name: 'Опубликовать', exact: true }).click();
    await browserExpect(businessRow).toContainText('published');
    const near = await api('GET', `/places/near?city=smolensk&lon=${real.lon}&lat=${real.lat}&radius=300&category=cafe&limit=50`);
    const item = near.items.find((p: any) => p.name === real.tags.name);
    expect(item, 'Genuine published admin change appears in public geosearch').toBeTruthy();
    const detail = await api('GET', `/places/${item.slug}`);
    expect(detail.phone).toBe('+7 (000) 000-00-15'); expect(detail.website).toBe('https://fixture.invalid');
    expect(detail.openingHours).toBe('Mo-Fr 10:00-18:00'); expect(detail.cityId).toBe('smolensk');
    await businessRow.getByRole('button', { name: 'Архивировать', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Причина изменения (обязательно)', { exact: true }).fill('TEST ONLY archive disposable catalog record');
    await dialog.getByRole('button', { name: 'Подтвердить архивирование', exact: true }).click();
    await browserExpect(dialog).toHaveCount(0);
    const afterArchive = await api('GET', `/places/near?city=smolensk&lon=${real.lon}&lat=${real.lat}&radius=300&category=cafe&limit=50`);
    expect(afterArchive.items.some((p: any) => p.id === item.id)).toBe(false);
    completed.push('licensed business UI create/edit/publish/nearby detail readback/archive');
    }
    if (slice === 'full' || slice === 'cms') {
    const documentA = { kind: 'section', title: 'QA published city A', blocks: [{ kind: 'paragraph', text: 'TEST ONLY isolated published paragraph' }], homepageHero: { heading: 'QA published city A', subheading: 'TEST ONLY isolated hero paragraph', primaryCta: { label: 'QA search', href: '#quick-search' }, secondaryCta: { label: 'QA map', href: '/map' } } };
    const a = await api('PUT', '/admin/cms/homepage', { expectedVersion: null, document: documentA, changeNote: 'TEST ONLY isolated public consumer check' });
    await api('POST', '/admin/cms/homepage/publish', { expectedVersion: a.version, revisionId: a.id });
    const b = await api('PUT', '/admin/cms/homepage', { expectedVersion: a.version, document: { ...documentA, title: 'QA PRIVATE DRAFT B', homepageHero: { ...documentA.homepageHero, heading: 'QA PRIVATE DRAFT B' } }, changeNote: 'TEST ONLY unpublished draft isolation' });
    const published = await api('GET', '/content/homepage');
    expect(JSON.stringify(published)).toContain('QA published city A');
    expect(JSON.stringify(published)).not.toContain('QA PRIVATE DRAFT B');
    await page.goto(origin + '/');
    await browserExpect(page.getByRole('heading', { name: 'QA published city A', exact: true })).toBeVisible();
    expect(await page.content()).not.toContain('QA PRIVATE DRAFT B');
    await api('POST', '/admin/cms/homepage/publish', { expectedVersion: b.version, revisionId: b.id });
    await page.reload();
    await browserExpect(page.getByRole('heading', { name: 'QA PRIVATE DRAFT B', exact: true })).toBeVisible();
    completed.push('CMS publishedA/draftB isolation and actual SSR homepage refresh after publishB');
    }
    await page.goto(origin + '/admin/owners');
    // No trace/screenshots/storageState: enrollment seeds/recovery codes/private values stay in memory.
    const cookies = await context.cookies();
    expect(cookies.find(c => c.name === 'ryadom-session-dev')?.httpOnly).toBe(true);
    expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(' '))).not.toMatch(/ryadom-session|000-00-14/);
    const privateCaches = await page.evaluate(async () => {
      const bad: string[] = [];
      for (const name of await caches.keys()) {
        for (const request of await (await caches.open(name)).keys()) {
          const u = new URL(request.url);
          if (/^\/(api\/|admin(?:\/|$)|auth(?:\/|$)|account(?:\/|$)|business\/dashboard)/.test(u.pathname)) bad.push(u.pathname);
        }
      }
      return bad;
    });
    expect(privateCaches).toEqual([]);
    if (slice === 'media') {
      expect(await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name))).toEqual([]);
      await context.setOffline(true);
      const offlinePrivate = await page.evaluate(async () => {
        try { const r = await fetch('/api/v1/auth/me', { cache: 'no-store' }); return { status: r.status, body: await r.text() }; }
        catch { return { status: 0, body: '' }; }
      });
      expect(offlinePrivate.status).not.toBe(200);
      expect(offlinePrivate.body).not.toMatch(/admin@fixture|TEST ONLY|tokenDigest/);
      await context.setOffline(false);
      completed.push('controlled SW excludes authenticated API/private URLs, no IndexedDB, offline auth data unavailable');
    }
    completed.push('authenticated route/API URLs absent from CacheStorage; no session/private value in web storage');
    // No pacing/reset on the new build: reduced fanout must work under unchanged quotas.
    const loggedOut = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/auth/logout' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
    expect((await loggedOut).status(), 'Real server confirms revocation before navigation').toBe(200);
    expect((await f.setup.query('SELECT count(*)::int n FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL', [slice === 'review' ? domain.reviewer.account.id : f.account.id])).rows[0].n, 'Logout durable server revocation').toBe(0);
    await page.waitForURL(origin + '/auth/admin');
    await page.goto(origin + '/admin/owners');
    await browserExpect(page.getByRole('heading', { name: 'Вход в панель', exact: true })).toBeVisible();
    completed.push('logout clears authenticated UI; no private browser storage');
  } finally {
    try { await stop(publicRun); await browser?.close(); } finally {
      try { await stop(web); } finally {
        try { await f?.cleanup(); } finally {
          await writeFile(resolve(out, 'runtime-checkpoint.json'), JSON.stringify({ slice, completed, meTransport, requestCounts, browserRequestCounts, rateCounts, rateDenials, failures, formDiagnostic, evidence: 'Only header presence, route/scope counts, RSC/prefetch flags, error codes and form validity flags; no subjects/values/credentials/PII captured', limitation: 'HTTP loopback explicit development cookie policy; not HTTPS production cookie verification' }, null, 2));
        }
      }
    }
  }
}, 180_000);
