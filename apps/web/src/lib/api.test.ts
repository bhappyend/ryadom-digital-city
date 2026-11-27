import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CitiesResponseSchema } from '@ryadom/types';
import { api, ServiceError } from './api';
const meta={requestId:'00000000-0000-4000-8000-000000000001',generatedAt:'2026-11-27T00:00:00Z'};
describe('frontend API boundary',()=>{
  const fetchMock=vi.fn<typeof fetch>();
  beforeEach(()=>{vi.stubGlobal('fetch',fetchMock);vi.stubEnv('API_URL','http://127.0.0.1:3001');});
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
  it('uses server-only origin and validates the complete envelope without caching',async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({data:[],meta}));
    await expect(api('/cities',CitiesResponseSchema)).resolves.toEqual({data:[],meta});
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3001/api/v1/cities',expect.objectContaining({cache:'no-store',redirect:'error'}));
  });
  it.each(['https://evil.test/x','//evil.test/cities','/../cities','/cities#bad'])('rejects non-API paths: %s',async path=>{
    await expect(api(path,CitiesResponseSchema)).rejects.toBeInstanceOf(ServiceError);expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects invalid success payload rather than showing it as real catalog data',async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({data:[{name:'Fake'}],meta}));
    await expect(api('/cities',CitiesResponseSchema)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  });
  it('provides honest unavailable text without exposing infrastructure errors',async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({error:{code:'PROVIDER_UNAVAILABLE',message:'internal-host:5432 secret',provider:{status:'unavailable',provider:'router',reason:'not_configured',message:'private-host'}},meta},{status:503}));
    await expect(api('/routes',CitiesResponseSchema)).rejects.toMatchObject({status:503,message:'Построение маршрутов пока недоступно. Попробуйте позже.'});
  });
  it('retains explicit cancellation for superseded requests',async()=>{
    const controller=new AbortController();const abort=new DOMException('Aborted','AbortError');controller.abort();fetchMock.mockRejectedValueOnce(abort);
    await expect(api('/cities',CitiesResponseSchema,{signal:controller.signal})).rejects.toBe(abort);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it('normalizes network errors and non-JSON failures',async()=>{
    fetchMock.mockRejectedValueOnce(new TypeError('private upstream'));await expect(api('/cities',CitiesResponseSchema)).rejects.toMatchObject({code:'NETWORK_ERROR'});
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>',{status:502}));await expect(api('/cities',CitiesResponseSchema)).rejects.toMatchObject({status:502});
  });
});
