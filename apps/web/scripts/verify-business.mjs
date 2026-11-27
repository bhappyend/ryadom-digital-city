import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const navigation = { notFound: () => { throw Error('404'); }, redirect: path => { throw Error('REDIRECT:' + path); } };
const mocks = {
 'next/link': { __esModule: true, default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) },
 'next/navigation': navigation,
 '@ryadom/ui': { Badge: ({ children }) => React.createElement('span', null, children), Icon: () => null },
 '@/lib/admin/api': {},
 './account.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
};
function load(path) {
 const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 const module = { exports: {} };
 new Function('require', 'module', 'exports', code)(name => mocks[name] ?? require(name), module, module.exports);
 return module.exports;
}
mocks['@/components/business/sign-in'] = load('../src/components/business/sign-in.tsx');
const business = load('../src/app/business/[[...section]]/page.tsx');
const props = section => ({ params: Promise.resolve({ section }), searchParams: Promise.resolve({}) });
const login = renderToStaticMarkup(await business.default(props([])));
for (const text of ['Вход для бизнеса', '<form', 'type="email"', 'type="password"', 'Войти в кабинет', 'выданные администратором', 'https://t.me/desktopcoder', 'https://vk.ru/desktopcoder']) assert.ok(login.includes(text), text);
for (const text of ['Создать аккаунт', '/auth/register', 'new-password', 'name="terms"', 'name="privacy"']) assert.ok(!login.includes(text), text);
const pricing = renderToStaticMarkup(await business.default(props(['pricing'])));
for (const text of ['Ежемесячное размещение', 'https://t.me/desktopcoder', 'https://vk.ru/desktopcoder', 'Автосписаний нет', 'Цена ежемесячного размещения — по согласованию']) assert.ok(pricing.includes(text), text);
for (const text of ['<form', '/auth/register', '990', '2490']) assert.ok(!pricing.includes(text), text);
await assert.rejects(business.default(props(['add'])), /REDIRECT:\/business$/);
await assert.rejects(business.default(props(['dashboard'])), /REDIRECT:\/auth\/business$/);
assert.equal(fs.existsSync(new URL('../src/app/auth/register/page.tsx', import.meta.url)), false, 'No registration route is shipped');
for (const path of ['../src/app/auth/sign-in/page.tsx', '../src/app/login/page.tsx']) assert.throws(() => load(path).default(), /REDIRECT:\/business$/);
console.log('PASS: actual business login; closed public signup; monthly pricing; canonical and legacy routes.');
