// Hook/lifecycle contract checks with minimal React and ServiceWorker mocks.
// These do not replace a real-browser install/update/keyboard test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../PwaRegistration.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

function harness(options = {}) {
  const values = [];
  const effects = [];
  const timers = new Map();
  let cursor = 0;
  let firstRender = true;
  let clean;
  let reloads = 0;
  const calls = [];
  const messages = [];
  const waiting = Object.assign(new EventTarget(), { state: "installed", postMessage: (message) => messages.push(message) });
  const registration = Object.assign(new EventTarget(), { waiting, installing: null, update: async () => {} });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: options.controlled === false ? null : {},
    register: async (...args) => { calls.push(args); return registration; },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const react = {
    useRef: (initial) => { const index = cursor++; if (firstRender) values[index] = { current: initial }; return values[index]; },
    useState: (initial) => {
      const index = cursor++;
      if (firstRender) values[index] = initial;
      return [values[index], (value) => { values[index] = value; }];
    },
    useEffect: (effect) => { cursor++; if (firstRender) effects.push(effect); },
  };
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, document, navigator: options.unsupported ? {} : { serviceWorker },
    window: { isSecureContext: options.secure ?? true, location: { hostname: options.hostname ?? "ryadom.example", protocol: options.protocol ?? "https:", reload: () => { reloads++; } } },
    process: { env: { NODE_ENV: options.environment ?? "production" } },
    setTimeout: (callback) => { const id = {}; timers.set(id, callback); return id; },
    clearTimeout: (id) => timers.delete(id),
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "./install-state") return { useInstallState: () => {} };
      if (name === "./pwa.module.css") return { default: {} };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  const render = () => {
    cursor = 0;
    const view = exports.PwaRegistration();
    firstRender = false;
    return view;
  };
  render();
  const start = async () => { clean = effects[0](); await Promise.resolve(); await Promise.resolve(); };
  function button(text, node = render()) {
    if (!node) return undefined;
    if (node.type === "button" && node.props.children === text) return node;
    const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
    for (const child of children) {
      if (child && typeof child === "object") {
        const match = button(text, child);
        if (match) return match;
      }
    }
  }
  return { render, start, button, calls, messages, serviceWorker, registration, waiting, timers,
    unmount: () => clean?.(), reloads: () => reloads,
    controllerChange: () => serviceWorker.dispatchEvent(new Event("controllerchange")),
  };
}

test("registers production SW with exact scope and revalidation after effect, without implicit reload", async () => {
  const h = harness();
  assert.equal(h.calls.length, 0, "render must not register before hydration effect");
  await h.start();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], "/sw.js");
  assert.equal(h.calls[0][1].scope, "/");
  assert.equal(h.calls[0][1].updateViaCache, "none");
  assert.ok(h.button("Обновить"));
  h.controllerChange();
  assert.equal(h.reloads(), 0);
  h.unmount();
});

for (const options of [{ environment: "development" }, { secure: false }, { protocol: "http:" }, { unsupported: true }]) {
  test(`registration guard: ${JSON.stringify(options)}`, async () => {
    const h = harness(options);
    await h.start();
    assert.equal(h.calls.length, 0);
    assert.equal(h.render(), null);
  });
}

test("production localhost secure exception is supported", async () => {
  const h = harness({ protocol: "http:", hostname: "localhost" });
  await h.start();
  assert.equal(h.calls.length, 1);
  h.unmount();
});

test("update sends activation only on click, then reloads once despite repeated controllerchange", async () => {
  const h = harness();
  await h.start();
  assert.equal(h.messages.length, 0);
  h.button("Обновить").props.onClick();
  assert.equal(h.messages[0].type, "SKIP_WAITING");
  assert.equal(h.button("Обновляем…").props.disabled, true);
  h.controllerChange();
  h.controllerChange();
  assert.equal(h.reloads(), 1);
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test("Later dismisses without activation or reload", async () => {
  const h = harness();
  await h.start();
  h.button("Позже").props.onClick();
  assert.equal(h.render(), null);
  h.controllerChange();
  assert.equal(h.messages.length, 0);
  assert.equal(h.reloads(), 0);
  h.unmount();
});

test("timeout allows retry and a late activation does not unexpectedly reload", async () => {
  const h = harness();
  await h.start();
  h.button("Обновить").props.onClick();
  for (const callback of h.timers.values()) callback();
  assert.ok(h.button("Обновить"));
  h.controllerChange();
  assert.equal(h.reloads(), 0);
  h.unmount();
});

test("worker already activated by another tab reloads only on explicit click", async () => {
  const h = harness();
  await h.start();
  h.waiting.state = "activated";
  h.controllerChange();
  assert.equal(h.reloads(), 0);
  h.button("Обновить").props.onClick();
  assert.equal(h.reloads(), 1);
  assert.equal(h.messages.length, 0);
  h.unmount();
});

test("unmount cancels reload intent, timers and listeners", async () => {
  const h = harness();
  await h.start();
  h.button("Обновить").props.onClick();
  h.unmount();
  h.controllerChange();
  assert.equal(h.reloads(), 0);
  assert.equal(h.timers.size, 0);
});

test("first activation has no update toast", async () => {
  const h = harness({ controlled: false });
  await h.start();
  assert.equal(h.render(), null);
  h.controllerChange();
  assert.equal(h.reloads(), 0);
  h.unmount();
});
