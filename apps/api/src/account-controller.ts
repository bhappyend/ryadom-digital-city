import { Controller, Get, Post, Put, Patch, Delete, Req, Res, Inject } from '@nestjs/common';
import { ACCOUNT_OPERATIONS, type AccountOperation } from '@ryadom/accounts-types';
import type { Response } from 'express';
import { DEPENDENCIES, type Dependencies } from './dependencies.js';
import type { ApiRequest } from './errors.js';
import { AccountFault, sendAccountError } from './accounts-fault.js';

export class AccountController {
  constructor(readonly deps: Dependencies) {}
}
export class PublicMediaController {
  constructor(readonly deps: Dependencies) {}
  async file(req: ApiRequest, res: Response) {
    try {
      const file = req.params.file;
      if (!this.deps.accounts?.publishedMedia || typeof file !== 'string' || !/^[0-9a-f-]{36}\.webp$/.test(file)) throw new AccountFault('NOT_FOUND');
      await this.deps.limiter.consume(req.ip ?? 'unknown', 'read');
      const data = await this.deps.accounts.publishedMedia(file.slice(0, -5));
      res.type('image/webp').setHeader('X-Content-Type-Options', 'nosniff').send(data);
    } catch (error) { sendAccountError(error, req, res); }
  }
}
Controller('media')(PublicMediaController); Inject(DEPENDENCIES)(PublicMediaController, undefined, 0);
Get(':file')(PublicMediaController.prototype, 'file', Object.getOwnPropertyDescriptor(PublicMediaController.prototype, 'file')!);
Req()(PublicMediaController.prototype, 'file', 0); Res()(PublicMediaController.prototype, 'file', 1);
Controller()(AccountController); Inject(DEPENDENCIES)(AccountController, undefined, 0);
const decorators = { get: Get, post: Post, put: Put, patch: Patch, delete: Delete };
export const ACCOUNT_HANDLERS = new Map<Function, AccountOperation>();
for (const operation of ACCOUNT_OPERATIONS) {
  const handler = async function(this: AccountController, req: ApiRequest, res: Response) {
    try {
      if (!this.deps.accounts) throw new AccountFault(operation.access === 'admin' || operation.access === 'session' || operation.access === 'verified-owner' ? 'UNAUTHORIZED' : 'PROVIDER_UNAVAILABLE', 'not_configured');
      await this.deps.accounts.dispatch(operation, req, res);
    } catch (error) { sendAccountError(error, req, res); }
  };
  Object.defineProperty(AccountController.prototype, operation.id, { value: handler, configurable: true });
  const descriptor = Object.getOwnPropertyDescriptor(AccountController.prototype, operation.id)!;
  decorators[operation.method](operation.path.slice(1).replace(/\{([^}]+)\}/g, ':$1'))(AccountController.prototype, operation.id, descriptor);
  Req()(AccountController.prototype, operation.id, 0); Res()(AccountController.prototype, operation.id, 1);
  ACCOUNT_HANDLERS.set(handler, operation);
}
