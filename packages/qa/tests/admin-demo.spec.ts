import { expect, test } from '@playwright/test';
import { checkAdminLayout, demoNotice, visitAdmin, widths } from '../support/admin';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const sections = ['overview', 'owners', 'businesses', 'subscriptions', 'content', 'media', 'reviews', 'audit'];

test('every demo view remains labelled and never calls private API', async ({ page }) => {
  const privateRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => {
    if (/\/api\/v1\/(auth|admin|account|business)(\/|\?|$)/.test(r.url())) privateRequests.push(`${r.method()} ${new URL(r.url()).pathname}`);
  });
  for (const section of sections) {
    await visitAdmin(page, `/admin/demo/${section}`);
    await expect(page.getByRole('note').filter({ hasText: demoNotice })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Раздел не найден');
  }
  expect(privateRequests, 'Demo must use only isolated in-memory data').toEqual([]);
  expect(errors).toEqual([]);
});

test('demo phone hides after timeout and navigation; no persistent phone storage', async ({ page }) => {
  await page.clock.install();
  await visitAdmin(page, '/admin/demo/owners');
  const row = page.locator('tbody tr').first();
  await row.getByRole('button', { name: 'Показать демо номер', exact: true }).click();
  await expect(row).toContainText('+7 (9XX) XXX-XX-01');
  await page.clock.fastForward(31_000);
  await expect(row).not.toContainText('+7 (9XX) XXX-XX-01');
  await row.getByRole('button', { name: 'Показать демо номер', exact: true }).click();
  await page.getByRole('navigation', { name: 'Разделы управления' }).getByRole('link', { name: 'База данных · Бизнесы', exact: true }).click();
  await page.getByRole('navigation', { name: 'Разделы управления' }).getByRole('link', { name: 'База данных · Владельцы', exact: true }).click();
  await expect(page.locator('tbody')).not.toContainText('+7 (9XX) XXX-XX-01');
  expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(' '))).not.toContain('+7 (9XX)');
});

for (const width of widths) test(`demo owners accessibility and responsive layout at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await visitAdmin(page, '/admin/demo/owners');
  await expect(page.getByRole('note').filter({ hasText: demoNotice })).toBeVisible();
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await checkAdminLayout(page, info);
});

for (const width of widths) test(`demo business showcase accessibility at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  await visitAdmin(page, '/admin/demo/businesses');
  await expect(page.getByRole('note')).toContainText(demoNotice);
  await expect(page.locator('article').first()).toContainText('Иллюстрация категории');
  await expect(page.locator('article').first()).toContainText('Оплата и владелец не заявлены');
  await page.locator('article').first().getByText('Источник и лицензия', { exact: true }).click();
  await expect(page.locator('article').first()).toContainText('ODbL');
  await checkAdminLayout(page, info);
});

test('exactly 35 fictional owners; nonroutable phone reveal, days bounds and local-only edit', async ({ page }) => {
  const privateCalls: string[] = [];
  page.on('request', r => {
    if (/\/api\/v1\//.test(r.url()) && (r.method() !== 'GET' || /\/api\/v1\/(auth|admin|account|business)(\/|\?|$)/.test(r.url()))) {
      privateCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
    }
  });
  await visitAdmin(page, '/admin/demo/owners');
  const names: string[] = [];
  for (const expected of [20, 15]) {
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(expected);
    for (const row of await rows.all()) {
      await expect(row).toContainText('Вымышленный владелец');
      await expect(row).toContainText('Не оплаченный период');
      names.push(await row.locator('strong').innerText());
      const days = Number((await row.locator('[data-label="Демо срок"] .admin-tag').innerText()).replace(/\D/g, ''));
      expect(days).toBeGreaterThanOrEqual(22);
      expect(days).toBeLessThanOrEqual(30);
    }
    if (expected === 20) await page.getByRole('button', { name: 'Следующая', exact: true }).click();
  }
  expect(names).toHaveLength(35);
  expect(new Set(names).size).toBe(35);
  await expect(page.getByRole('button', { name: 'Следующая', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Предыдущая', exact: true }).click();
  const row = page.locator('tbody tr').first();
  await row.getByRole('button', { name: 'Показать демо номер', exact: true }).click();
  await expect(row).toContainText('+7 (9XX) XXX-XX-01');
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  await row.getByRole('button', { name: 'Изменить локально', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(demoNotice);
  await dialog.getByLabel('Вымышленное имя').fill('QA fictional local edit');
  await dialog.getByLabel('Демо дни (22–30)', { exact: true }).fill('30');
  await dialog.getByRole('button', { name: 'Изменить локально', exact: true }).click();
  await expect(row).toContainText('QA fictional local edit · демо');
  await expect(row).toContainText('30 дней');
  await page.reload();
  await expect(page.locator('tbody')).not.toContainText('QA fictional local edit');
  expect(privateCalls).toEqual([]);
});

test('showcase paginates 35 distinct real licensed source identities without owner/payment claims', async ({ page }) => {
  const source = JSON.parse(await readFile(resolve('data/cities/showcase35.json'), 'utf8')) as { records: { id: string; webPath: string; provenance: { license: string; sourceId: string }[] }[] };
  expect(source.records).toHaveLength(35);
  expect(new Set(source.records.map(r => r.id)).size).toBe(35);
  expect(source.records.every(r => r.provenance.some(p => p.sourceId === 'osm' && p.license.includes('ODbL')))).toBe(true);
  await visitAdmin(page, '/admin/demo/businesses');
  const links: string[] = [];
  for (const count of [12, 12, 11]) {
    const cards = page.locator('article');
    await expect(cards).toHaveCount(count);
    for (const card of await cards.all()) {
      await expect(card).toContainText('Открытый каталог. Оплата и владелец не заявлены.');
      await expect(card).toContainText('Иллюстрация категории');
      links.push((await card.getByRole('link', { name: 'Публичная карточка', exact: true }).getAttribute('href'))!);
    }
    if (count === 12) await page.getByRole('button', { name: 'Следующая', exact: true }).click();
  }
  expect(links.sort()).toEqual(source.records.map(r => r.webPath).sort());
  expect(new Set(links).size).toBe(35);
  await expect(page.getByRole('button', { name: 'Следующая', exact: true })).toBeDisabled();
});

test('demo dialogs retain notice, trap focus, close with Escape and restore focus', async ({ page }, info) => {
  await visitAdmin(page, '/admin/demo/owners');
  const edit = page.getByRole('button', { name: /Изменить|Редактировать/ }).first();
  await edit.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(demoNotice, { exact: true })).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    const focus = await dialog.evaluate(d => ({ inside: d.contains(document.activeElement), activeTag: document.activeElement?.tagName, activeName: document.activeElement?.getAttribute('name'), modal: d.matches(':modal'), open: (d as HTMLDialogElement).open }));
    await info.attach(`tab-${i}-focus`, { body: JSON.stringify(focus), contentType: 'application/json' });
    expect(focus.inside, JSON.stringify(focus)).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(d => d.contains(document.activeElement))).toBe(true);
  }
  await checkAdminLayout(page, info);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(edit).toBeFocused();
});
