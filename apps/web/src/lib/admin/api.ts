import { z } from 'zod';
import { CsrfResponseSchema } from '@ryadom/accounts-types';

export class AdminError extends Error {
  constructor(public status: number, public code: string, public requestId?: string) {
    super(status === 401 ? 'Сессия завершена. Войдите снова.' : status === 403 ? 'Недостаточно прав или требуется свежее подтверждение MFA.' : status === 409 ? 'Запись изменена другим оператором. Обновите данные и повторите изменение.' : status === 429 ? 'Превышен лимит запросов. Повторите позже.' : status === 400 ? 'Проверьте поля формы. Данные не приняты сервером.' : 'Сервис недоступен. Результат изменения неизвестен — обновите данные перед повтором.');
  }
}
export async function adminRequest<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}): Promise<T> {
  // Keep the pathname fixed to our API families. Encoded query values (including
  // Cyrillic business names) are data, never remote destinations or path segments.
  const [pathname, query = ''] = path.split('?');
  if (path.length > 4096 || !/^\/(auth|admin|business)\/[a-z0-9/_-]+$/i.test(pathname ?? '') || path.includes('..') || /[\u0000-\u0020\u007f#]/u.test(query) || /%(?![0-9a-f]{2})/i.test(query) || path.split('?').length > 2) throw new Error('Invalid account path');
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  const write = options.method && options.method !== 'GET';
  if (write && path !== '/auth/csrf') {
    const csrf = await adminRequest('/auth/csrf', CsrfResponseSchema, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    headers.set('X-CSRF-Token', csrf.data.token);
    if (!(options.body instanceof Blob)) headers.set('Content-Type', 'application/json');
  }
  let response: Response;
  try { response = await fetch('/api/v1' + path, { ...options, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new AdminError(0, 'NETWORK_ERROR'); }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.object({ code: z.string() }), meta: z.object({ requestId: z.string().uuid() }) }).safeParse(body);
    throw new AdminError(response.status, error.success ? error.data.error.code : 'REQUEST_FAILED', error.success ? error.data.meta.requestId : undefined);
  }
  const result = schema.safeParse(body);
  if (!result.success) throw new AdminError(502, 'INVALID_RESPONSE');
  return result.data;
}
export const jsonWrite = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export function adminMessage(error: unknown) { return error instanceof AdminError ? error.message + (error.requestId ? ` Код обращения: ${error.requestId}` : '') : error instanceof z.ZodError ? 'Проверьте обязательные поля, формат и длину значений.' : 'Не удалось выполнить действие. Обновите данные и повторите.'; }
