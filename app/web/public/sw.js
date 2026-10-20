/*
 * PlayLab Shop service worker: keeps the catalogue browsable offline.
 *  - app shell (navigations, /assets/*): cache first, network fallback
 *  - catalogue (/api/v1/products*, /api/v1/categories, /img/*): network first, cache fallback
 *  - everything else (cart, orders, auth, SSE, WebSocket, /test, /pay): not touched
 * Responses served from the cache carry `X-SW-Cache: hit`.
 * Bug mode `offline-stale-prices` (passed as ?bugs=...) makes the catalogue cache-first, so prices go stale.
 */
const CACHE = 'playlab-v1';
const SHELL = ['/', '/favicon.svg'];
const BUGS = (new URL(self.location.href).searchParams.get('bugs') || '').split(',');
const STALE_PRICES = BUGS.includes('offline-stale-prices');

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function markCached(response) {
  const headers = new Headers(response.headers);
  headers.set('X-SW-Cache', 'hit');
  return response.blob().then((body) => new Response(body, { status: response.status, statusText: response.statusText, headers }));
}

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackKey || request, response.clone());
    return response;
  } catch (err) {
    const cached = (await cache.match(request)) || (fallbackKey && (await cache.match(fallbackKey)));
    if (cached) return markCached(cached);
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return markCached(cached);
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (path.startsWith('/api/v1/products') || path === '/api/v1/categories') {
    if (path.includes('/reviews')) return;
    event.respondWith(STALE_PRICES ? cacheFirst(request) : networkFirst(request));
  } else if (path.startsWith('/img/')) {
    event.respondWith(networkFirst(request));
  } else if (path.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate' && !path.startsWith('/api') && !path.startsWith('/test') && !path.startsWith('/pay')) {
    // Single-page app: every route is index.html, cached under "/".
    event.respondWith(networkFirst(request, '/'));
  }
});
