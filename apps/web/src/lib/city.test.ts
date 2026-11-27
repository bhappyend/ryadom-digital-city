import { describe, expect, it } from 'vitest';
import type { City } from '@ryadom/types';
import { selectCity } from './city';
const make = (id: string, enabled = true): City => ({ id, enabled, name: id, region: 'Test', countryCode: 'RU', center: { lon: 32, lat: 54 }, bounds: [31, 53, 33, 55], timezone: 'Europe/Moscow' });
describe('pilot city selection', () => {
  const cities = [make('kotelniki'), make('dzerzhinsky'), make('smolensk')];
  it('defaults to Smolensk even after national cities sort ahead', () => { expect(selectCity(cities)?.id).toBe('smolensk'); expect(selectCity([...cities].reverse())?.id).toBe('smolensk'); });
  it('preserves an explicit enabled city from user selection or query', () => { expect(selectCity(cities, 'kotelniki')?.id).toBe('kotelniki'); });
  it('falls back to the pilot for unknown or disabled explicit cities', () => { expect(selectCity(cities, 'missing')?.id).toBe('smolensk'); expect(selectCity([make('disabled', false), ...cities], 'disabled')?.id).toBe('smolensk'); });
  it('uses an enabled fallback if pilot unavailable, and none for an empty catalog', () => { expect(selectCity([make('smolensk', false), make('kotelniki')])?.id).toBe('kotelniki'); expect(selectCity([])).toBeUndefined(); expect(selectCity([make('smolensk', false)])).toBeUndefined(); });
});
