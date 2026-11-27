import 'reflect-metadata';
import { Module, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ApiController, HealthController } from './controller.js';
import { DEPENDENCIES, type Dependencies } from './dependencies.js';
import { ApiFault, invalid, SafeExceptionFilter, sendError, type ApiRequest } from './errors.js';
import { AccountController, PublicMediaController } from './account-controller.js';

export async function createApp(deps: Dependencies): Promise<NestExpressApplication> {
  @Module({ controllers: [ApiController, HealthController, AccountController, PublicMediaController], providers: [{ provide: DEPENDENCIES, useValue: deps }] })
  class ApiModule {}
  const app = await NestFactory.create<NestExpressApplication>(ApiModule, { bodyParser: false, logger: false });
  app.disable('x-powered-by');
  app.set('trust proxy', deps.config.trustedProxies.length ? [...deps.config.trustedProxies] : false);
  app.set('query parser', 'simple');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const request = req as ApiRequest;
    request.requestId = randomUUID();
    const controller = new AbortController(); request.signal = controller.signal;
    req.once('aborted', () => controller.abort());
    res.once('close', () => { if (!res.writableEnded) controller.abort(); });
    res.setHeader('X-Request-Id', request.requestId); res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: {
    defaultSrc: ["'none'"], baseUri: ["'none'"], frameAncestors: ["'none'"], formAction: ["'none'"],
  } }, referrerPolicy: { policy: 'no-referrer' } }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      if (Buffer.byteLength(req.originalUrl) > 4096) throw new ApiFault(413, 'PAYLOAD_TOO_LARGE', 'Слишком длинный запрос');
      const origin = req.headers.origin;
      if (origin && !deps.config.origins.includes(origin)) throw invalid();
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
      if (req.method === 'OPTIONS') {
        if (!origin || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.headers['access-control-request-method'] ?? '')) throw invalid();
        const headers = String(req.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(v => v.trim()).filter(Boolean);
        if (headers.some(v => !['content-type', 'x-csrf-token'].includes(v))) throw invalid();
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
        if (deps.accounts) res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.status(204).end(); return;
      }
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        // Binary upload is parsed only by the authenticated handler, after RBAC/CSRF.
        // This opt-in matches the same case/trailing-slash variants as Express.
        const rasterUpload = req.method === 'PUT' && /^\/api\/v1\/admin\/media\/[0-9a-f-]{36}\/content\/?$/i.test(req.path);
        if (rasterUpload) { next(); return; }
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type'] ?? '') ||
          (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
          throw new ApiFault(415, 'UNSUPPORTED_MEDIA_TYPE', 'Требуется application/json; charset=utf-8');
        }
        if (Number(req.headers['content-length']) > 16_384) throw new ApiFault(413, 'PAYLOAD_TOO_LARGE', 'Слишком большой запрос');
      }
      next();
    })().catch(error => sendError(error, req, res));
  });
  app.use(json({ limit: 16_384, strict: true, inflate: false, type: 'application/json' }));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => sendError(error, req, res));
  app.setGlobalPrefix('api/v1', { exclude: [
    { path: 'media/:file', method: RequestMethod.GET },
    { path: 'health', method: RequestMethod.ALL }, { path: 'health/live', method: RequestMethod.ALL }, { path: 'health/ready', method: RequestMethod.ALL },
  ] });
  app.useGlobalFilters(new SafeExceptionFilter());
  // Classify the handler selected by Nest, never a string copy of its path. Express can
  // match trailing slashes/case variants; these must retain the same write protections.
  app.useGlobalGuards({ canActivate: async context => {
    if (context.getClass() === HealthController || context.getClass() === PublicMediaController) return true;
    if (context.getClass() === AccountController) {
      const req = context.switchToHttp().getRequest<Request>();
      const res = context.switchToHttp().getResponse<Response>();
      if (deps.accounts && req.headers.origin && deps.config.origins.includes(req.headers.origin)) res.setHeader('Access-Control-Allow-Credentials', 'true');
      return true;
    }
    const handler = context.getHandler();
    const req = context.switchToHttp().getRequest<ApiRequest>();
    const isReport = handler === ApiController.prototype.report;
    if (isReport && (!req.headers.origin || !deps.config.origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site')) throw invalid();
    const group = isReport ? 'report' : handler === ApiController.prototype.geocode ? 'geocode' : handler === ApiController.prototype.route ? 'route' : 'read';
    await deps.limiter.consume(req.ip ?? req.socket.remoteAddress ?? 'unknown', group);
    return true;
  } });
  await app.init();
  const server = app.getHttpServer() as import('node:http').Server;
  server.requestTimeout = 10_000; server.headersTimeout = 10_000; server.keepAliveTimeout = 5000;
  return app;
}
