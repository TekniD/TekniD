/*
 * Job Card service worker (hand-written, no build plugin needed).
 *
 *  - App shell ("/") is pre-cached so the form opens with no network.
 *  - /_next/static/* is content-hashed, so it is cache-first forever.
 *  - Pages are network-first with the cached shell as fallback.
 *  - /api/* is never cached: clients/products live in IndexedDB instead, and
 *    sync calls must hit the server.
 *  - Background Sync wakes any open page to flush the pending_syncs queue.
 *
 * Bump VERSION to force old caches out after a breaking change.
 */
const VERSION = "v1";
const SHELL_CACHE = `job-card-shell-${VERSION}`;
const STATIC_CACHE = `job-card-static-${VERSION}`;
const SHELL_URLS = ["/", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png", "/vendor/browser-image-compression.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("job-card-") && k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always network

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network-first, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && url.pathname === "/") {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match("/")) || Response.error()),
    );
    return;
  }

  // Everything else (icons, manifest, RSC payloads): stale-while-revalidate.
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || network;
    }),
  );
});

// Background Sync (Chrome on Android): tell open pages to flush the queue.
self.addEventListener("sync", (event) => {
  if (event.tag !== "job-card-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: "SYNC" }));
    }),
  );
});
