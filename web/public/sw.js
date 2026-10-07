// Rivet Technician PWA Service Worker (Public SW)
// Caches the app shell, offline assets, and provides Background Sync hooks

const CACHE_NAME = 'rivet-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/tech',
  '/control',
  '/portal',
  '/gate',
  '/verify',
  '/manifest.json',
];

// Install: Cache app shell and immediately skip waiting
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed caching asset: ${url}`, err);
          })
        )
      );
    })
  );
});

// Activate: Claim clients immediately so this SW controls the page from the start
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      ),
    ])
  );
});

// Fetch: Network-first for API, Cache-first for assets, Stale-while-revalidate for navigation
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests and non-http(s)
  if (req.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Google Fonts fallback
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('gstatic.com')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).catch(() => new Response('/* offline font fallback */', {
          headers: { 'Content-Type': 'text/css' },
        }));
      })
    );
    return;
  }

  // API endpoints are handled by app queue directly (or network)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/devices/')) {
    return;
  }

  // Navigation requests: try network, save clone to cache, fallback to cache on offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const match = await cache.match(req);
          if (match) return match;
          const cachedTech = await cache.match('/tech');
          if (cachedTech) return cachedTech;
          const cachedRoot = await cache.match('/');
          if (cachedRoot) return cachedRoot;
          return new Response('Offline - Rivet App Shell Cached', {
            headers: { 'Content-Type': 'text/html' },
          });
        })
    );
    return;
  }

  // Static assets (scripts, styles, etc): Cache-first, then network with background cache put
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((response) => {
          if (response.status === 200 && (req.url.startsWith(self.location.origin) || req.url.includes('_next'))) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const match = await cache.match(req, { ignoreSearch: true });
          if (match) return match;
          // Graceful fallback to avoid halting page execution with a 408
          return new Response('', { status: 200 });
        });
    })
  );
});

// Android Background Sync event handler
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-commands' || event.tag === 'rivet-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'RIVET_BACKGROUND_SYNC' });
        });
      })
    );
  }
});
