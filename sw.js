/**
 * Zaya Service Worker
 *
 * Strategy:
 *  - Precache the app shell on install (best effort: one missing file must not block install).
 *  - Same-origin static assets: stale-while-revalidate (fast repeat loads, background refresh).
 *  - HTML navigations: network-first with cache fallback (so deploys are picked up immediately).
 *  - Everything else (PDFs, CDNs, YouTube, APIs) goes straight to the network and is never cached.
 *  - Cache name carries the app version so a deploy invalidates the old cache on activate.
 */

const VERSION = '6.0.0';
const CACHE_NAME = `zaya-assets-v${VERSION}`;
const MAX_ENTRIES = 300;

const PRECACHE = [
  './',
  './index.html',
  './changelog.html',
  './lib/css/style.css',
  './lib/js/app.js',
  './assets/zaya.svg',
  './lib/fonts/themify.woff'
];

const STATIC_DESTINATIONS = new Set(['script', 'style', 'font', 'image', 'worker']);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch((err) => {
        console.warn('[SW] Could not precache', url, err && err.message);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldCache(request, url) {
  if (!isSameOrigin(url)) return false;
  if (url.searchParams.has('t')) return false; // legacy cache-busted URLs must never pile up
  if (/\.pdf($|\?)/i.test(url.pathname)) return false;
  return STATIC_DESTINATIONS.has(request.destination) || /\.(js|mjs|css|woff2?|ttf|eot|svg|png|jpe?g|gif|json|mp3)$/i.test(url.pathname);
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => cache.delete(k)));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request).then((response) => {
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).then(() => trimCache(cache)).catch(() => {});
    }
    return response;
  }).catch(() => null);
  return cached || (await refresh) || Response.error();
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request) || await cache.match('./index.html');
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (request.mode === 'navigate' && isSameOrigin(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (shouldCache(request, url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Anything else: default browser behaviour (no interception).
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;
  const reply = (msg) => {
    if (event.ports && event.ports[0]) event.ports[0].postMessage(msg);
    else if (event.source && event.source.postMessage) event.source.postMessage(msg);
  };

  switch (data.type) {
    case 'GET_VERSION':
      reply({ type: 'VERSION', version: VERSION });
      break;
    case 'GET_CACHE_SIZE':
      caches.open(CACHE_NAME)
        .then((cache) => cache.keys())
        .then((keys) => reply({ type: 'CACHE_STATUS', cacheSize: keys.length }))
        .catch((err) => reply({ type: 'CACHE_ERROR', error: String(err) }));
      break;
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME)
        .then((ok) => reply({ type: 'CACHE_STATUS', cleared: ok }))
        .catch((err) => reply({ type: 'CACHE_ERROR', error: String(err) }));
      break;
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    default:
      break;
  }
});
