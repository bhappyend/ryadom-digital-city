// SSR contract checks, after the coordinator installs workspace dependencies.
// TSX is compiled in memory; no application pages, build files or files outside UI are written.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const cache = new Map();
function load(path) {
  if (cache.has(path)) return cache.get(path).exports;
  const module = { exports: {} };
  cache.set(path, module);
  const { outputText, diagnostics } = ts.transpileModule(readFileSync(path, 'utf8'), {
    fileName: path, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  });
  assert.equal(diagnostics?.length ?? 0, 0);
  const localRequire = name => {
    if (!name.startsWith('.')) return require(name);
    const base = resolve(dirname(path), name);
    const target = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync);
    assert.ok(target, name);
    return load(target);
  };
  new Function('require', 'module', 'exports', outputText)(localRequire, module, module.exports);
  return module.exports;
}
const ui = load(resolve(source, 'index.ts'));
const html = (Component, props, children) => renderToStaticMarkup(React.createElement(Component, props, children));
const button = html(ui.Button, { loading: true }, 'Найти');
assert.match(button, /type="button"/);
assert.match(button, /disabled=""/);
assert.match(button, /aria-busy="true"/);
assert.match(button, /Найти/);
assert.match(html(ui.Button, { type: 'submit', 'aria-label': 'Отправить', size: 'icon' }), /type="submit"/);
assert.match(html(ui.Icon, { name: 'cafe' }), /stroke="currentColor"/);
assert.match(html(ui.Icon, { name: 'cafe' }), /aria-hidden="true"/);
const namedIcon = html(ui.Icon, { name: 'map', label: 'Карта' });
assert.match(namedIcon, /role="img"/);
assert.match(namedIcon, /aria-label="Карта"/);
assert.doesNotMatch(namedIcon, /aria-hidden/);
const field = html(ui.Field, { id: 'address', label: 'Адрес', hint: 'Смоленск', error: 'Укажите адрес', 'aria-describedby': 'external', required: true });
assert.match(field, /for="address"/);
assert.match(field, /id="address"/);
assert.match(field, /aria-describedby="external address-hint address-error"/);
assert.match(field, /aria-invalid="true"/);
assert.match(field, /id="address-hint"/);
assert.match(field, /id="address-error"/);
const generated = html(ui.Field, { label: 'Поиск' });
assert.equal(generated.match(/for="([^"]+)"/)?.[1], generated.match(/<input[^>]*id="([^"]+)"/)?.[1]);
assert.match(html(ui.CategoryTile, { category: 'cafe', label: 'Кафе', selected: true }), /aria-pressed="true"/);
assert.match(html(ui.CategoryTile, { category: 'cafe', label: 'Кафе' }), /src="\/assets\/icons\/tile-cafe.svg"/);
assert.doesNotMatch(html(ui.CategoryTile, { category: 'cafe', label: 'Кафе' }), /aria-pressed/);
assert.match(html(ui.Brand, {}), /рядом\./);
assert.match(html(ui.Brand, {}), /by Patchvale/);
assert.match(html(ui.Brand, { variant: 'mark' }), /viewBox="0 0 64 64"/);
assert.match(html(ui.Badge, { tone: 'warning' }, 'Не настроено'), /dc-badge--warning/);
assert.match(html(ui.Badge, { tone: 'warning' }, 'Не настроено'), /Не настроено/);
assert.doesNotMatch(html(ui.ProviderNotice, { title: 'Карта недоступна', description: 'Повторите позже' }), /role="status"/);
assert.match(html(ui.ProviderNotice, { title: 'Карта недоступна', description: 'Повторите позже', announce: true }), /role="status"/);
assert.match(html(ui.EmptyState, { title: '<script>alert(1)</script>', description: 'Нет результатов' }), /&lt;script&gt;/);
assert.doesNotMatch(html(ui.EmptyState, { title: '<script>alert(1)</script>', description: 'Нет результатов' }), /<script>/);
console.log('PASS: SSR contracts for all 8 component families (buttons, icons, brand, category, badge, field, empty state, provider notice)');
