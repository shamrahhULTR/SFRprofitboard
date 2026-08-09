/* Profit Board — Square Foot Roofing
   Cache the shell + the CDN runtime so the dashboard opens offline after the
   first visit. No controllerchange reload handler here on purpose: forcing a
   reload when a new worker takes over causes the double-reload we hit on the
   roof planner. */

const CACHE = 'sfr-profit-board-v3';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './favicon.png?v=2',
  './apple-touch-icon.png?v=2',
  './sfr-logo.png',
  './sfr-logo-reversed.png'
];

// Third-party runtime (React, Babel, Tailwind, fonts) — cached on first use.
const RUNTIME_HOSTS = [
  'unpkg.com',
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing; cache individually so one 404 can't sink install.
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isRuntime = RUNTIME_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isRuntime) return;

  // config.js carries the Supabase URL + key. If it were cached, editing it
  // would look like it did nothing — the old copy would keep being served.
  // Always go to the network, falling back to cache only when offline.
  if (sameOrigin && url.pathname.endsWith('/config.js')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Never let Supabase auth/API traffic touch the cache.
  if (!sameOrigin && /supabase\.(co|in)$/.test(url.hostname)) return;

  // Navigations: network first so a redeploy is picked up, cache as the fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else: cache first, then fill the cache in the background.
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
