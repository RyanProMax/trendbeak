const CACHE_NAME = "trendbeak-shell-v2-logo11";
const PRECACHE = [
  "/offline",
  "/manifest.webmanifest?v=11",
  "/favicon.svg?v=11",
  "/trendbeak-wordmark.svg?v=11",
  "/apple-touch-icon.png?v=11",
  "/app-icon-192.png?v=11",
  "/app-icon-512.png?v=11",
  "/app-icon-maskable-512.png?v=11",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

const DATA_VERSION = "bars-v1";
const migrating = new Set();
async function upgradeClient(client) {
  if (!client || migrating.has(client.id)) return;
  const url = new URL(client.url);
  if (url.origin !== self.location.origin || url.pathname !== "/") return;
  const channel = new MessageChannel();
  const version = await new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 300);
    channel.port1.onmessage = event => { clearTimeout(timer); resolve(event.data); };
    try { client.postMessage({ type: "trendbeak:data-version" }, [channel.port2]); }
    catch { clearTimeout(timer); resolve(null); }
  });
  channel.port1.close(); channel.port2.close();
  if (typeof version === "string" && /^bars-v\d{1,3}$/.test(version)) return;
  migrating.add(client.id);
  // Do not await navigation inside activate: the new document can wait for activation.
  try { void client.navigate(client.url).catch(() => {}); } catch { /* Browser may defer navigation. */ }
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith("trendbeak-") || key.startsWith("stock-daily-")) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then(clients => Promise.all(clients.map(upgradeClient))),
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

  // Existing open clients need no user hard refresh after this worker activates.
  if (/^\/api\/markets(?:\/(?:CN|US))?$/.test(url.pathname) && !request.headers.has("X-Trendbeak-Data")) {
    event.respondWith(Promise.resolve(new Response(JSON.stringify({ error: "页面版本已更新，请重新打开页面", retryable: false }), { status: 426, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Trendbeak-Data": DATA_VERSION } })));
    event.waitUntil(self.clients.get(event.clientId).then(upgradeClient));
    return;
  }

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
