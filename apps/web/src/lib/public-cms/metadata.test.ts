import { expect, it } from 'vitest';
import type { Metadata } from 'next';
import { publishedPageMetadata } from './metadata';
import type { ContentResult } from './content';
const base: Metadata = { title: { absolute: 'Исходный заголовок' }, description: 'Исходное описание', alternates: { canonical: 'https://ryadom.ru/' }, robots: { index: false, follow: false }, openGraph: { type: 'website', title: 'Исходный заголовок' } };
const published: ContentResult = { status: 'published', content: { key: 'site-settings', revisionId: '00000000-0000-4000-8000-000000000001', version: 1, publishedAt: '2026-11-27T00:00:00Z', document: { kind: 'settings', siteTitle: 'Опубликованный Рядом', description: 'Опубликованное описание', indexingEnabled: true } } };
it('overlays published title/description without changing canonical or enabling deployment indexing', () => {
  const value = publishedPageMetadata(base, published);
  expect(value.title).toEqual({ absolute: 'Опубликованный Рядом' });
  expect(value.description).toBe('Опубликованное описание');
  expect(value.openGraph?.title).toBe('Опубликованный Рядом');
  expect(value.alternates).toEqual(base.alternates); expect(value.robots).toEqual(base.robots);
});
it.each(['missing', 'unavailable'] as const)('preserves static metadata for %s CMS', status => {
  expect(publishedPageMetadata(base, { status })).toBe(base);
});
it('lets published CMS disable indexing', () => {
  if (published.status !== 'published' || published.content.document.kind !== 'settings') throw new Error('fixture');
  const value = publishedPageMetadata({ robots: { index: true, follow: true } }, { ...published, content: { ...published.content, document: { ...published.content.document, indexingEnabled: false } } });
  expect(value.robots).toMatchObject({ index: false, follow: false });
});
