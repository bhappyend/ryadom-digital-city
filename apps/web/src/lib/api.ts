import { ApiErrorSchema, API_PREFIX } from '@ryadom/types';
import type { z } from 'zod';

export class ServiceError extends Error {
  constructor(message: string, public readonly status = 0, public readonly code = 'NETWORK_ERROR') { super(message); this.name = 'ServiceError'; }
}

/** Only fixed, same-origin API paths are accepted. External destinations never come from visitors. */
export async function api<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  if (!/^\/[a-z][a-z0-9/?=&%_.+\-]*$/i.test(path) || path.includes('..')) throw new ServiceError('Некорректный запрос');
  const prefix = typeof window === 'undefined' ? serverOrigin() + API_PREFIX : API_PREFIX;
  let response: Response;
  try {
    response = await fetch(prefix + path, { ...options, cache: 'no-store', redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12_000)]) : AbortSignal.timeout(12_000), headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ServiceError('Сервис временно недоступен. Попробуйте ещё раз.');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const err = parsed.data.error;
      throw new ServiceError(err.code === 'PROVIDER_UNAVAILABLE' ? unavailableText(err.provider?.provider) : err.code === 'NOT_FOUND' ? 'Место не найдено.' : err.code === 'RATE_LIMITED' ? 'Слишком много запросов. Попробуйте чуть позже.' : 'Не удалось выполнить запрос. Проверьте введённые данные и повторите.', response.status, err.code);
    }
    throw new ServiceError('Сервис временно недоступен. Попробуйте ещё раз.', response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ServiceError('Не удалось получить корректные данные. Попробуйте позже.', response.status, 'INVALID_RESPONSE');
  return parsed.data;
}

function serverOrigin() {
  const value = new URL(process.env.API_URL ?? 'http://127.0.0.1:3001');
  if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.pathname !== '/') throw new Error('API_URL must be an HTTP(S) origin');
  return value.origin;
}
export function unavailableText(provider?: string) {
  if (provider === 'router') return 'Построение маршрутов пока недоступно. Попробуйте позже.';
  if (provider === 'geocoder') return 'Поиск по адресу пока недоступен. Можно выбрать местоположение на карте или воспользоваться геолокацией.';
  if (provider === 'map') return 'Карта пока недоступна. Список организаций остаётся доступным.';
  if (provider === 'reports') return 'Приём исправлений пока недоступен. Сообщение не отправлено.';
  return 'Каталог пока недоступен. Попробуйте позже.';
}
export function message(error: unknown) { return error instanceof ServiceError ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.'; }
export async function optional<T>(promise: Promise<T>): Promise<T | null> { return promise.catch(() => null); }
