import { HttpUrlSchema, CoordinatesSchema, CategoryIdSchema } from '@ryadom/types';
import type { Coordinates, Place } from '@ryadom/types';

export const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date(value));
export const distance = (value: number) => value < 1000 ? `${Math.round(value)} м` : `${(value / 1000).toFixed(1)} км`;
export const duration = (value: number) => `${Math.max(1, Math.round(value / 60))} мин`;
export const safeWebsite = (value: string | null) => { const parsed = HttpUrlSchema.safeParse(value); return parsed.success ? parsed.data : null; };
export const safePhone = (value: string | null) => value && /^\+?[0-9 ()-]{5,30}$/.test(value) ? `tel:${value.replace(/[ ()-]/g, '')}` : null;
export const opening = (place: Place) => place.openingState === 'open' ? 'Открыто сейчас' : place.openingState === 'closed' ? 'Сейчас закрыто' : 'Часы работы не подтверждены';
export function readCoordinates(params: URLSearchParams): Coordinates | null {
  const lon = params.get('lon'), lat = params.get('lat');
  if (params.getAll('lon').length !== 1 || params.getAll('lat').length !== 1 || lon === null || lat === null || !/^-?\d+(?:\.\d+)?$/.test(lon) || !/^-?\d+(?:\.\d+)?$/.test(lat)) return null;
  const parsed = CoordinatesSchema.safeParse({ lon: Number(lon), lat: Number(lat) });
  return parsed.success ? parsed.data : null;
}
export function readCategory(value: string | null) { const parsed = CategoryIdSchema.safeParse(value); return parsed.success ? parsed.data : ''; }
export function locationFromBrowser(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Геолокация не поддерживается браузером. Введите адрес.')); return; }
    navigator.geolocation.getCurrentPosition(position => resolve({ lon: position.coords.longitude, lat: position.coords.latitude }), error => reject(new Error(error.code === 1 ? 'Доступ к местоположению не разрешён. Введите адрес.' : 'Не удалось определить местоположение. Введите адрес.')), { enableHighAccuracy: false, timeout: 12_000, maximumAge: 0 });
  });
}
