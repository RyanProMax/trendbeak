const CACHE_NAME = "stock-daily-shell-v9";
const PRECACHE = [
  "/offline",
  "/manifest.webmanifest?v=9",
  "/favicon.svg?v=9",
  "/stockdaily-wordmark.svg?v=9",
  "/apple-touch-icon.png?v=9",
  "/app-icon-192.png?v=9",
  "/app-icon-512.png?v=9",
  "/app-icon-maskable-512.png?v=9",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const PRECACHE_PATHS = new Set(PRECACHE.map((path) => path.split("?")[0]));

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }

  if (url.pathname.startsWith("/static/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (PRECACHE_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
