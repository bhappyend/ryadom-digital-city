import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiErrorSchema, type ApiError, type ProviderUnavailable } from '@ryadom/types';

export type ErrorCode = ApiError['error']['code'];
export class ApiFault extends Error {
  constructor(readonly status: number, readonly code: ErrorCode, message: string,
    readonly provider?: ProviderUnavailable, readonly details?: ApiError['error']['details'], readonly retryAfter?: number) { super(message); }
}
export function unavailable(provider: ProviderUnavailable['provider'], reason: ProviderUnavailable['reason'] = 'upstream_error'): ApiFault {
  const state: ProviderUnavailable = { status: 'unavailable', provider, reason, message: 'Сервис временно недоступен' };
  return new ApiFault(503, 'PROVIDER_UNAVAILABLE', state.message, state);
}
export const invalid = () => new ApiFault(400, 'VALIDATION_ERROR', 'Проверьте параметры запроса');
export const notFound = () => new ApiFault(404, 'NOT_FOUND', 'Запись не найдена');
export type ApiRequest = Request & { requestId: string; signal: AbortSignal };
export function meta(req: Request) {
  return { requestId: (req as Partial<ApiRequest>).requestId ?? randomUUID(), generatedAt: new Date().toISOString() };
}
export function sendError(error: unknown, req: Request, res: Response) {
  if (res.headersSent || res.destroyed) return;
  let fault = error instanceof ApiFault ? error : undefined;
  const parser = error as { type?: string; status?: number } | undefined;
  if (!fault && parser?.type === 'entity.too.large') fault = new ApiFault(413, 'PAYLOAD_TOO_LARGE', 'Слишком большой запрос');
  if (!fault && parser?.type === 'encoding.unsupported') fault = new ApiFault(415, 'UNSUPPORTED_MEDIA_TYPE', 'Требуется JSON без сжатия');
  if (!fault && (parser?.type === 'entity.parse.failed' || parser?.type === 'request.aborted')) fault = invalid();
  if (!fault && error instanceof HttpException && error.getStatus() === 404) fault = notFound();
  fault ??= new ApiFault(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервиса');
  if (fault.status === 429) res.setHeader('Retry-After', String(fault.retryAfter ?? 60));
  const body = ApiErrorSchema.parse({ error: { code: fault.code, message: fault.message,
    ...(fault.provider ? { provider: fault.provider } : {}), ...(fault.details ? { details: fault.details } : {}) }, meta: meta(req) });
  res.status(fault.status).json(body);
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    sendError(error, host.switchToHttp().getRequest<Request>(), host.switchToHttp().getResponse<Response>());
  }
}
