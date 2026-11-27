import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const widths = [360, 390, 768, 1024, 1440, 1920] as const;
export const demoNotice = 'Демонстрационные данные. Не реальные клиенты и оплаты.';
export function adminOrigin(variable: 'BASE_URL' | 'API_URL'): string {
  const raw = process.env[variable];
  if (!raw) throw new Error(`BLOCKED: ${variable} required; obtain current admin build URL from integration owner17`);
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/') {
    throw new Error(`BLOCKED: ${variable} must be a credential-free loopback origin`);
  }
  return url.origin;
}
export async function visitAdmin(page: Page, path: string) {
  const response = await page.goto(adminOrigin('BASE_URL') + path);
  expect(response, 'Navigation response').not.toBeNull();
  expect(response!.status(), `Admin build must serve ${path}`).toBe(200);
  // Next streaming may retain a hidden loading <main>; evaluate the settled visible landmark.
  await expect(page.locator('main:visible'), 'Exactly one visible main after streaming settles').toHaveCount(1);
  await expect(page.locator('main:visible')).toBeVisible();
}
export async function checkAdminLayout(page: Page, info: TestInfo) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, 'No horizontal document overflow; tables may scroll inside their region').toBeLessThanOrEqual(1);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  await info.attach('axe', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.violations).toEqual([]);
  await info.attach('page', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
}
