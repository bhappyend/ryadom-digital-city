import { AccountsApiErrorSchema, ACCOUNTS_ERROR_STATUS, type AccountsErrorCode } from '@ryadom/accounts-types';
import type { Request, Response } from 'express';
import { meta } from './errors.js';

export class AccountFault extends Error {
  constructor(readonly code: AccountsErrorCode, readonly reason: 'not_configured' | 'upstream_error' | 'disabled' = 'upstream_error') { super(code); }
}
export function sendAccountError(error: unknown, req: Request, res: Response) {
  const fault = error instanceof AccountFault ? error : new AccountFault('PROVIDER_UNAVAILABLE');
  if (res.headersSent || res.destroyed) return;
  if (fault.code === 'RATE_LIMITED') res.setHeader('Retry-After', '60');
  const message = fault.code === 'PROVIDER_UNAVAILABLE' ? 'Сервис временно недоступен' : fault.code === 'INVALID_CREDENTIALS' ? 'Не удалось войти' : 'Запрос не может быть выполнен';
  res.status(ACCOUNTS_ERROR_STATUS[fault.code]).json(AccountsApiErrorSchema.parse({ error: { code: fault.code, message,
    ...(fault.code === 'PROVIDER_UNAVAILABLE' ? { provider: { status: 'unavailable', provider: 'accounts', reason: fault.reason, message } } : {}) }, meta: meta(req) }));
}
