/* Рядом PWA. Bump VERSION whenever the offline shell or cache policy changes. */
"use strict";
const VERSION = "2026-11-27.1";
const PREFIX = "ryadom-pwa-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const ASSET_CACHE = `${PREFIX}assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_ASSETS = 64;
const OFFLINE_CSP = "default-src 'none'; style-src 'sha256-yAy2cLjNEYdw48m5anAS6l9E01UXvGNcTCy2prsSUew='; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PUBLIC_ROUTES = new Set(["/", "/map", "/categories", "/about", "/business", "/business/pricing"]);
// Only content-hashed Next production JS/CSS. No photos, maps, fonts or API data.
const VERSIONED_ASSET = /^\/_next\/static\/(?:chunks|css)\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]*[a-f0-9]{8,}[a-zA-Z0-9_.-]*\.(?:js|css)$/;

function cacheable(response, url, requireImmutable) {
  const control = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  return response.status === 200 && response.type === "basic" && !response.redirected &&
    response.url === url && !/\b(?:private|no-store|no-cache)\b/i.test(control) &&
    !/(?:\*|cookie|authorization)/i.test(vary) && !response.headers.has("set-cookie") &&
    (!requireImmutable || (/\bpublic\b/i.test(control) && /\bimmutable\b/i.test(control)));
}

self.addEventListener("install", (event) => {
  // Install must fail if the one genuinely offline document cannot be saved.
  event.waitUntil((async () => {
    const url = new URL(OFFLINE_URL, self.location.origin).href;
    const response = await fetch(new Request(url, { credentials: "omit", cache: "reload", redirect: "error" }));
    if (!cacheable(response, url, false) || !response.headers.get("content-type")?.includes("text/html")) {
      throw new Error("Offline shell unavailable or not safe to cache");
    }
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(OFFLINE_URL, response);
    // No skipWaiting here: an existing session chooses when to update.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(PREFIX) && name !== SHELL_CACHE && name !== ASSET_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  // Only an actual same-origin window within this registration may request activation.
  const source = event.source;
  if (event.data?.type !== "SKIP_WAITING" || !source || source.type !== "window") return;
  const url = new URL(source.url);
  if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
    event.waitUntil(self.skipWaiting());
  }
});

async function navigate(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    // Never store navigations, including public HTML that could contain a session.
    const response = await fetch(request, { signal: controller.signal, cache: "no-store" });
    if (response.status < 500) return response;
  } catch {
    // A network failure is the only reason to use the standalone offline document.
  } finally {
    clearTimeout(timeout);
  }
  let offline;
  try {
    const cache = await caches.open(SHELL_CACHE);
    offline = await cache.match(OFFLINE_URL);
  } catch { /* Storage can be unavailable in restricted browser sessions. */ }
  return new Response(offline ? await offline.text() : "Нет соединения. Подключитесь к интернету и повторите попытку.", {
    status: 503,
    headers: {
      "Content-Type": offline ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Cache-Control": "no-store", "Retry-After": "30", "Content-Security-Policy": OFFLINE_CSP,
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
    },
  });
}

async function versionedAsset(request) {
  let cache;
  let cached;
  try {
    cache = await caches.open(ASSET_CACHE);
    cached = await cache.match(request.url);
  } catch { /* Network delivery still works when browser storage is blocked. */ }
  if (cached) return cached;
  // Static assets must not receive cookies or authorization, even on same origin.
  const response = await fetch(new Request(request.url, { credentials: "omit", redirect: "error", cache: "no-cache" }));
  if (cache && cacheable(response, request.url, true) && /^(?:text\/css|(?:application|text)\/javascript)(?:;|$)/i.test(response.headers.get("content-type") || "")) {
    const copy = response.clone();
    try {
      await cache.put(request.url, copy);
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
    } catch { /* Quota failure must not break an otherwise valid response. */ }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.search ||
      request.headers.has("authorization") || request.headers.has("range") || request.cache === "no-store") return;
  if (request.mode === "navigate" && PUBLIC_ROUTES.has(url.pathname)) {
    event.respondWith(navigate(request));
  } else if (VERSIONED_ASSET.test(url.pathname) && (request.destination === "script" || request.destination === "style")) {
    event.respondWith(versionedAsset(request));
  }
});
