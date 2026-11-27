import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approvedAsset, documentOf, loadContent } from './content';
const uuid = '00000000-0000-4000-8000-000000000001';
const meta = { requestId: uuid, generatedAt: '2026-11-27T00:00:00Z' };
const content = { key: 'homepage', revisionId: uuid, version: 1, publishedAt: meta.generatedAt, document: { kind: 'section', title: 'Опубликовано & «Рядом»', blocks: [] } };
describe('public CMS publication boundary', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock); vi.stubEnv('API_URL', 'http://127.0.0.1:3001'); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it('reads only published projection without credentials or persistent cache', async () => {
    fetchMock.mockResolvedValue(Response.json({ data: content, meta }));
    const result = await loadContent('homepage');
    expect(documentOf(result, 'section')?.title).toBe(content.document.title);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3001/api/v1/content/homepage', expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error', signal: expect.any(AbortSignal) }));
  });
  it('missing published content returns fallback, never fetches admin drafts', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    const result = await loadContent('homepage');
    expect(result).toEqual({ status: 'missing' }); expect(documentOf(result, 'section')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('accepts the authoritative typed hero slots with fixed CTA targets', async () => {
    const homepageHero = { heading: 'Город рядом', subheading: 'Найдите нужное место', primaryCta: { label: 'Найти', href: '#quick-search' }, secondaryCta: { label: 'Карта', href: '/map' } };
    fetchMock.mockResolvedValue(Response.json({ data: { ...content, document: { ...content.document, homepageHero } }, meta }));
    expect(documentOf(await loadContent('homepage'), 'section')?.homepageHero).toEqual(homepageHero);
  });
  const invalidPayloads: unknown[] = [
    { ...content, publishedAt: null },
    { ...content, state: 'draft' },
    { ...content, key: 'about' },
    { ...content, document: { kind: 'section', title: '<script>alert(1)</script>', blocks: [] } },
    { ...content, document: { kind: 'section', title: 'Title', blocks: [{ kind: 'link', link: { label: 'x', url: 'javascript:alert(1)' } }] } },
    { ...content, document: { kind: 'section', title: 'Title', blocks: [], constructor: {} } },
  ];
  invalidPayloads.forEach((data, index) => it(`rejects invalid public projection ${index + 1}`, async () => {
    fetchMock.mockResolvedValue(Response.json({ data, meta }));
    expect(await loadContent('homepage')).toEqual({ status: 'unavailable' });
  }));
  it('keeps outage separate from an absent document', async () => {
    fetchMock.mockRejectedValue(new Error('private infrastructure detail'));
    expect(await loadContent('brand')).toEqual({ status: 'unavailable' });
  });
  it('times out bounded requests and preserves caller cancellation', async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => { const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal; });
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
    const pending = loadContent('brand'); await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toEqual({ status: 'unavailable' });
    const controller = new AbortController(); const cancelled = loadContent('brand', controller.signal); const check = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' }); controller.abort(); await check;
    timeout.mockRestore(); vi.useRealTimers();
  });
  it('matches media ID with the exact local WebP URL and accepts immutable supplied assets', () => {
    expect(approvedAsset({ source: 'uploaded', mediaId: uuid, url: `/media/${uuid}.webp`, alt: 'Логотип' })).not.toBeNull();
    expect(approvedAsset({ source: 'uploaded', mediaId: uuid, url: '/media/00000000-0000-4000-8000-000000000002.webp', alt: 'x' })).toBeNull();
    expect(approvedAsset({ source: 'supplied', url: '/assets/brand/logo-horizontal.svg', alt: 'Рядом' })).not.toBeNull();
    expect(approvedAsset(null)).toBeNull();
  });
});
