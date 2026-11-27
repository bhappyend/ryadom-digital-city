// Dependency-free SW contract tests. Explicit entry point; no browser claims.
// Run: node --test apps/web/src/components/pwa/tests/verify-pwa.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createHash } from "node:crypto";

const publicRoot = new URL("../../../../public/", import.meta.url);
const source = await readFile(new URL("sw.js", publicRoot), "utf8");
const origin = "https://ryadom.example";
const full = (path) => new URL(path, origin).href;
const asset = "/_next/static/chunks/app/page-a1b2c3d4e5f67890.js";

function response(body = "content", url = full("/offline.html"), options = {}) {
  const settings = { headers: { "content-type": "text/html", "cache-control": "public, max-age=0" }, ...options };
  const result = new Response(body, settings);
  Object.defineProperties(result, {
    type: { value: options.type ?? "basic" },
    url: { value: url },
    redirected: { value: options.redirected ?? false },
    clone: { value: () => response(body, url, options) },
  });
  return result;
}

function harness() {
  const handlers = new Map();
  const storage = new Map();
  const calls = [];
  let skipped = 0;
  let claimed = 0;
  let network = (request) => Promise.resolve(response("content", request.url));
  const key = (request) => typeof request === "string" ? full(request) : request.url;
  const caches = {
    async open(name) {
      if (!storage.has(name)) storage.set(name, new Map());
      const entries = storage.get(name);
      return {
        async put(request, value) { entries.set(key(request), value.clone()); },
        async match(request) { return entries.get(key(request))?.clone(); },
        async keys() { return [...entries.keys()].map((url) => new Request(url)); },
        async delete(request) { return entries.delete(key(request)); },
      };
    },
    async keys() { return [...storage.keys()]; },
    async delete(name) { return storage.delete(name); },
  };
  const context = vm.createContext({
    URL, Request, Response, AbortController, setTimeout, clearTimeout, caches,
    fetch: (request, options) => { calls.push({ request, options }); return network(request, options); },
    self: {
      location: { origin }, registration: { scope: full("/") },
      addEventListener: (type, handler) => handlers.set(type, handler),
      skipWaiting: async () => { skipped += 1; },
      clients: { claim: async () => { claimed += 1; } },
    },
  });
  vm.runInContext(source, context, { filename: "sw.js" });
  async function dispatch(type, properties = {}) {
    const pending = [];
    let result;
    handlers.get(type)({ ...properties, waitUntil: (promise) => pending.push(promise), respondWith: (promise) => { result = promise; } });
    const value = result ? await result : undefined;
    await Promise.all(pending);
    return value;
  }
  function fetchPath(path, overrides = {}) {
    return dispatch("fetch", { request: { url: full(path), method: "GET", mode: "navigate", headers: new Headers(), cache: "default", destination: "document", ...overrides } });
  }
  return { dispatch, fetchPath, caches, storage, calls, setNetwork: (fn) => { network = fn; }, skipped: () => skipped, claimed: () => claimed };
}

test("installation stores only offline HTML, omits credentials, never automatically skips waiting", async () => {
  const h = harness();
  await h.dispatch("install");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].request.url, full("/offline.html"));
  assert.equal(h.calls[0].request.credentials, "omit");
  assert.equal(h.calls[0].request.redirect, "error");
  assert.equal(h.skipped(), 0);
  assert.deepEqual([...h.storage.values()].flatMap((entries) => [...entries.keys()]), [full("/offline.html")]);
});

for (const options of [
  { type: "opaque" }, { redirected: true }, { status: 500 },
  { headers: { "content-type": "text/html", "cache-control": "private" } },
  { headers: { "content-type": "text/html", "cache-control": "no-store" } },
  { headers: { "content-type": "application/json" } },
  { headers: { "content-type": "text/html", vary: "Cookie" } },
]) {
  test(`installation rejects unsafe offline shell: ${JSON.stringify(options)}`, async () => {
    const h = harness();
    h.setNetwork((request) => response("x", request.url, options));
    await assert.rejects(h.dispatch("install"), /Offline shell/);
    assert.equal(h.storage.size, 0);
  });
}

test("activation removes only old own caches and claims clients", async () => {
  const h = harness();
  await h.dispatch("install");
  const active = [...h.storage.keys()][0];
  await h.caches.open("ryadom-pwa-shell-old");
  await h.caches.open("ryadom-pwa-assets-old");
  await h.caches.open("another-app-assets");
  await h.dispatch("activate");
  assert.deepEqual([...h.storage.keys()].sort(), [active, "another-app-assets"].sort());
  assert.equal(h.claimed(), 1);
});

test("activation message requires same-origin window and exact command", async () => {
  const h = harness();
  for (const source of [undefined, { type: "window", url: "https://ryadom.example.evil/" }, { type: "worker", url: full("/") }]) {
    await h.dispatch("message", { data: { type: "SKIP_WAITING" }, source });
  }
  await h.dispatch("message", { data: { type: "OTHER" }, source: { type: "window", url: full("/") } });
  assert.equal(h.skipped(), 0);
  await h.dispatch("message", { data: { type: "SKIP_WAITING" }, source: { type: "window", url: full("/map") } });
  assert.equal(h.skipped(), 1);
});

test("public navigation is network-first, never stores HTML, handles 404 without offline substitution", async () => {
  const h = harness();
  await h.dispatch("install");
  h.setNetwork((request) => response("live", request.url));
  assert.equal(await (await h.fetchPath("/")).text(), "live");
  assert.equal(h.calls.at(-1).options.cache, "no-store");
  h.setNetwork((request) => response("missing", request.url, { status: 404 }));
  assert.equal((await h.fetchPath("/map")).status, 404);
  assert.equal([...h.storage.values()].reduce((count, entries) => count + entries.size, 0), 1);
});

test("offline and upstream 503 return self-contained 503 fallback with no-store", async () => {
  const h = harness();
  h.setNetwork((request) => response("<h1>offline</h1>", request.url));
  await h.dispatch("install");
  h.setNetwork(() => { throw new TypeError("offline"); });
  const offline = await h.fetchPath("/map");
  assert.equal(offline.status, 503);
  assert.equal(offline.headers.get("cache-control"), "no-store");
  assert.match(offline.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.equal(offline.headers.get("x-content-type-options"), "nosniff");
  assert.match(await offline.text(), /offline/);
  h.setNetwork((request) => response("down", request.url, { status: 503 }));
  assert.equal((await h.fetchPath("/")).status, 503);
});

test("network timeout aborts navigation and delivers offline response", async () => {
  const h = harness();
  await h.dispatch("install");
  h.setNetwork((_request, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  }));
  // Use VM's real timeout; verifies bounded network wait, not a synthetic success.
  assert.equal((await h.fetchPath("/")).status, 503);
});

const blocked = ["/api/v1/places/near", "/api", "/auth", "/login", "/account", "/admin", "/admin/users", "/business/dashboard", "/private", "/location", "/places/test", "/photos/a.jpg", "/assets/brand/icon-192.png", "/_next/image?url=/photo.jpg", "/map?lat=54&lon=32", "/?q=address", "/map?", "/map/?lat=54"];
// URL normalizes a bare '?', which has no query data; it is not private.
for (const path of blocked.filter((path) => path !== "/map?")) {
  test(`bypasses sensitive/unapproved request without touching network or cache: ${path}`, async () => {
    const h = harness();
    assert.equal(await h.fetchPath(path), undefined);
    assert.equal(h.storage.size, 0);
    assert.equal(h.calls.length, 0);
  });
}

test("bypasses non-GET, cross-origin including lookalikes, authorization, ranges and no-store", async () => {
  const h = harness();
  for (const overrides of [
    { method: "POST" }, { url: "https://ryadom.example.evil/" }, { url: "http://ryadom.example/" },
    { headers: new Headers({ authorization: "Bearer secret" }) },
    { headers: new Headers({ range: "bytes=0-9" }) }, { cache: "no-store" },
  ]) assert.equal(await h.fetchPath("/", overrides), undefined);
  assert.equal(h.storage.size, 0);
  assert.equal(h.calls.length, 0);
});

const scriptHeaders = { "content-type": "application/javascript", "cache-control": "public, max-age=31536000, immutable" };
test("only versioned immutable JS/CSS is cached and requested without credentials", async () => {
  const h = harness();
  h.setNetwork((request) => response("script", request.url, { headers: scriptHeaders }));
  const options = { mode: "cors", destination: "script" };
  assert.equal(await (await h.fetchPath(asset, options)).text(), "script");
  assert.equal(h.calls[0].request.credentials, "omit");
  assert.equal(h.calls[0].request.redirect, "error");
  h.setNetwork(() => { throw new Error("offline"); });
  assert.equal(await (await h.fetchPath(asset, options)).text(), "script");
  assert.equal(h.calls.length, 1);
  assert.equal(await h.fetchPath("/_next/static/chunks/webpack.js", options), undefined);
  assert.equal(await h.fetchPath(`${asset}?lat=54`, options), undefined);
  assert.equal(await h.fetchPath(asset, { mode: "cors", destination: "image" }), undefined);
});

for (const options of [
  { type: "opaque" }, { redirected: true }, { status: 404 },
  { headers: { ...scriptHeaders, "cache-control": "private, immutable" } },
  { headers: { ...scriptHeaders, "cache-control": "public, no-store, immutable" } },
  { headers: { ...scriptHeaders, "cache-control": "public, max-age=0" } },
  { headers: { ...scriptHeaders, vary: "Authorization" } },
  { headers: { ...scriptHeaders, vary: "*" } },
  { headers: { ...scriptHeaders, "set-cookie": "token=secret" } },
  { headers: { ...scriptHeaders, "content-type": "text/html" } },
]) {
  test(`rejects unsafe asset response: ${JSON.stringify(options)}`, async () => {
    const h = harness();
    h.setNetwork((request) => response("private", request.url, { headers: scriptHeaders, ...options }));
    await h.fetchPath(asset, { mode: "cors", destination: "script" });
    assert.equal([...h.storage.values()].reduce((count, entries) => count + entries.size, 0), 0);
  });
}

test("asset cache has a 64-entry bound", async () => {
  const h = harness();
  h.setNetwork((request) => response("script", request.url, { headers: scriptHeaders }));
  for (let index = 0; index < 66; index += 1) {
    await h.fetchPath(`/_next/static/chunks/${index}-a1b2c3d4e5f67890.js`, { mode: "cors", destination: "script" });
  }
  const entries = [...h.storage.values()][0];
  assert.equal(entries.size, 64);
  assert.equal(entries.has(full("/_next/static/chunks/0-a1b2c3d4e5f67890.js")), false);
});

test("storage failures preserve network assets and a minimal offline error", async () => {
  const h = harness();
  h.caches.open = async () => { throw new Error("storage blocked"); };
  h.setNetwork((request) => response("script", request.url, { headers: scriptHeaders }));
  assert.equal(await (await h.fetchPath(asset, { mode: "cors", destination: "script" })).text(), "script");
  h.setNetwork(() => { throw new Error("offline"); });
  const result = await h.fetchPath("/");
  assert.equal(result.status, 503);
  assert.match(await result.text(), /Нет соединения/);
});

test("manifest references original icons with actual PNG dimensions, distinct any/maskable purpose and Apple icon", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.webmanifest", publicRoot), "utf8"));
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((icon) => `${icon.purpose}:${icon.sizes}`).sort(), ["any:192x192", "any:512x512", "maskable:192x192", "maskable:512x512"]);
  for (const icon of [...manifest.icons, { src: "/assets/brand/apple-touch-icon.png", sizes: "180x180" }]) {
    const png = await readFile(new URL(`.${icon.src}`, publicRoot));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
    const original = await readFile(new URL(`../../../../../../ryadom-digital-city${icon.src}`, import.meta.url));
    assert.deepEqual(png, original);
  }
});

test("offline document has Russian language, local inline styling, truthful limits and no network dependencies", async () => {
  const html = await readFile(new URL("offline.html", publicRoot), "utf8");
  assert.match(html, /<html lang="ru">/);
  assert.match(html, /<style>/);
  assert.match(html, /нужен интернет/);
  assert.match(html, /focus-visible/);
  assert.doesNotMatch(html, /<(?:script|link|img|iframe|video|audio)\b|@import|url\(/i);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]), ["/"]);
});

test("offline CSP hash matches the actual inline style in both HTML and worker response policy", async () => {
  const html = await readFile(new URL("offline.html", publicRoot), "utf8");
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const digest = createHash("sha256").update(style).digest("base64");
  assert.ok(html.includes(`style-src 'sha256-${digest}'`));
  assert.ok(source.includes(`style-src 'sha256-${digest}'`));
});
