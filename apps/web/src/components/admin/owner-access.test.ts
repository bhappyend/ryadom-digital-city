import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const module = { exports: {} as { OwnerAccess: React.ComponentType<any> } };
const code = ts.transpileModule(readFileSync(new URL('./owner-access.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const replacements: Record<string, unknown> = { '@/lib/admin/api': {}, './dialog': { Drawer: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children) }, './forms': { Reason: () => React.createElement('textarea', { name: 'reason' }) } };
new Function('require', 'module', 'exports', code)((name: string) => replacements[name] ?? require(name), module, module.exports);

for (const accountId of [null, '00000000-0000-4000-8000-000000000001']) it(`renders individual ${accountId ? 'reset' : 'creation'} with no stored or returned credential`, () => {
  const html = renderToStaticMarkup(React.createElement(module.exports.OwnerAccess, { owner: { displayName: 'Actual owner', accountId, version: 3 }, close: () => {}, done: () => {}, stepUp: () => {} }));
  expect(html).toContain(accountId ? 'Сменить пароль владельца' : 'Создать доступ');
  expect(html).toContain('type="email"'); expect(html).toContain('type="password"');
  expect(html).toContain('autoComplete="new-password"');
  expect(html).toContain('Показать новый пароль'); expect(html).toContain('minLength="12"');
  expect(html).not.toContain('value="');
  expect(html).not.toContain('emailVerified'); expect(html).not.toContain('roles');
  if (accountId) expect(html).toContain('отзовёт прежние сессии');
});
