import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repository = path.resolve(directory, '../../../../..');
const cache = new Map();

// In-memory compilation only; never writes generated JS into the shared checkout.
function load(filename) {
  if (filename.endsWith('.css')) return new Proxy({}, { get: (_target, key) => key === '__esModule' ? false : String(key) });
  if (!path.extname(filename)) filename += fs.existsSync(`${filename}.tsx`) ? '.tsx' : '.ts';
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name)) : require(name);
  new Function('module', 'exports', 'require', outputText)(module, module.exports, localRequire);
  return module.exports;
}

const { MapDemoScene } = load(path.join(directory, 'MapDemoScene.tsx'));
const { MapDemoArtwork } = load(path.join(directory, 'MapDemoArtwork.tsx'));
const html = renderToStaticMarkup(React.createElement(MapDemoScene));
assert.match(html, /Демонстрация интерфейса · не навигационная карта/);
assert.match(html, /aria-hidden="true"/);
assert.equal((html.match(/<li\b/g) ?? []).length, 4);
assert.equal((html.match(/src="\/assets\/markers\/cafe.svg"/g) ?? []).length, 3);
assert.doesNotMatch(html, /aria-live|aria-current|tabindex|<button|<a\s|opacity:\s*0/);
assert.match(html, /width="720" height="410"/);

// Compare every static street/building/river attribute with the supplied immutable SVG.
function geometryTags(markup) {
  return [...markup.matchAll(/<(rect|g|path)\b([^>]*)>/g)].map(([, tag, attributes]) => ({
    tag,
    attributes: [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]).sort(([a], [b]) => a.localeCompare(b)),
  }));
}
const original = fs.readFileSync(path.join(repository, 'ryadom-digital-city/assets/illustrations/map-demo.svg'), 'utf8');
const base = original.slice(0, original.indexOf('<path d="M155'));
assert.ok(base.length > 1000, 'source SVG boundary must be explicit');
const rendered = renderToStaticMarkup(React.createElement(MapDemoArtwork, { className: 'map' }));
assert.deepEqual(geometryTags(rendered), geometryTags(base));

const clientFiles = ['DigitalCityMotion.tsx', 'controller.ts', 'motion-state.ts'];
const compiled = clientFiles.map(file => ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true },
}).outputText).join('\n');
assert.doesNotMatch(compiled, /MapDemoArtwork|MapDemoScene|maplibre|framer|gsap|fetch\(/i);
console.log(`SSR + ${geometryTags(rendered).length} original SVG geometry elements: PASS`);
console.log(`Motion-only transpiled client source (not production bundle): ${Buffer.byteLength(compiled)} bytes, gzip ${gzipSync(compiled).length} bytes; only external import: react.`);
