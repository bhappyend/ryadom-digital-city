import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { approvedAsset } from '../../lib/public-cms/content';
// Next preserves JSX for its own compiler; compile these isolated render subjects
// with the installed TS compiler so ordinary workspace Vitest needs no config change.
const nativeRequire = createRequire(import.meta.url);
function renderModule(name: string, replacements: Record<string, unknown>) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  new Function('require', 'module', 'exports', code)((id: string) => replacements[id] ?? nativeRequire(id), module, module.exports);
  return module.exports;
}
const media = renderModule('./media.tsx', { '@ryadom/ui': { Brand: () => React.createElement('svg', { 'aria-label': 'Рядом by Patchvale' }) }, '../../lib/public-cms/content': { approvedAsset } });
const CmsBrand = media.CmsBrand!;
const CmsDocumentBody = renderModule('./document.tsx', { './media': media }).CmsDocumentBody!;
afterEach(() => vi.unstubAllGlobals());
it('renders approved plain text as escaped React nodes and retains image captions', () => {
  vi.stubGlobal('React', React);
  const html = renderToStaticMarkup(React.createElement(CmsDocumentBody, { document: { kind: 'section', title: 'Title', blocks: [
    { kind: 'paragraph', text: 'Кофе & «Рядом»' },
    { kind: 'link', link: { label: 'Контакт & помощь', url: 'https://t.me/desktopcoder' } },
    { kind: 'image', asset: { source: 'supplied', url: '/assets/backgrounds/hero-city.webp', alt: 'Художественный город' }, caption: 'Иллюстрация, не фотография организации' },
  ] } }));
  expect(html).toContain('Кофе &amp; «Рядом»');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('alt="Художественный город"');
  expect(html).toContain('<figcaption>Иллюстрация, не фотография организации</figcaption>');
  expect(html).not.toContain('<script');
});
it('keeps the original vector brand when no published asset is provided', () => {
  vi.stubGlobal('React', React);
  expect(renderToStaticMarkup(React.createElement(CmsBrand, {}))).toContain('aria-label="Рядом by Patchvale"');
});
it('renders FAQ as keyboard-native disclosure and legal version visibly', () => {
  vi.stubGlobal('React', React);
  expect(renderToStaticMarkup(React.createElement(CmsDocumentBody, { document: { kind: 'faq', items: [{ question: 'Нужен аккаунт?', answer: 'Поиск доступен без регистрации.' }] } }))).toContain('<details><summary>Нужен аккаунт?</summary>');
  expect(renderToStaticMarkup(React.createElement(CmsDocumentBody, { document: { kind: 'legal', title: 'Условия', documentVersion: 'v1', paragraphs: ['Условия пилота'] } }))).toContain('Версия документа: v1');
});
