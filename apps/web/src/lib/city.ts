import type { City } from '@ryadom/types';
/** Respect an explicit available city; the pilot must not depend on catalog ordering. */
export function selectCity(cities: readonly City[], preferred?: string): City | undefined {
  const enabled = cities.filter(city => city.enabled);
  return enabled.find(city => city.id === preferred) ?? enabled.find(city => city.id === 'smolensk') ?? enabled[0];
}
