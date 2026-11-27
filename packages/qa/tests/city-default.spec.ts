import { test, expect } from '@playwright/test';
import { CitiesResponseSchema } from '@ryadom/types';
import { preflight } from '../support/preflight';

test.beforeAll(() => preflight(['BASE_URL']));

test('national catalog order does not replace Smolensk home/map default; explicit city is preserved', async ({ page, request }, info) => {
  const response = await request.get('/api/v1/cities');
  expect(response.status()).toBe(200);
  const cities = CitiesResponseSchema.parse(await response.json()).data;
  expect(cities[0]?.id, 'Regression requires real national catalog ordered before pilot').not.toBe('smolensk');
  const explicitCity = cities.find(city => city.name === 'Котельники' && city.enabled);
  expect(explicitCity, 'Use actual catalog ID, not an invented transliteration').toBeDefined();
  await info.attach('city-order', { body: JSON.stringify(cities.map(c => ({ id: c.id, enabled: c.enabled }))), contentType: 'application/json' });
  await page.goto('/');
  await expect(page.getByRole('form', { name: 'Поиск поблизости' }).getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('smolensk');
  await page.goto('/map');
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue('smolensk');
  await page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true }).selectOption(explicitCity!.id);
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue(explicitCity!.id);
  await page.goto(`/map?city=${encodeURIComponent(explicitCity!.id)}&category=cafe`);
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Город', exact: true })).toHaveValue(explicitCity!.id);
  await expect(page.getByRole('main').getByRole('combobox', { name: 'Категория', exact: true })).toHaveValue('cafe');
  expect(new URL(page.url()).searchParams.get('city')).toBe(explicitCity!.id);
  await page.screenshot({ path: info.outputPath('explicit-kotelniki.png'), fullPage: true });
});
