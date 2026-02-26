const CACHE_NAME = 'leakify-v16';
// NOTE: '/' (the HTML page) is intentionally excluded — it is a Jinja template
// containing a per-session CSRF token.  Caching it would serve a stale token and
// break login after the session is reset.  Only pure static assets are cached.
const STATIC_ASSETS = [
  '/static/style.css',
  '/static/script.js',
  '/static/manifest.json',
  '/static/icon-192.png',
  '/static/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Always network-only:
  //  • HTML navigation requests — contains Jinja / CSRF tokens, must stay fresh
  //  • Audio, video, API endpoints — never stale-cache auth
  if (
    event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    url.includes('/play/') ||
    url.includes('/video/') ||
    url.includes('/static/videos/') ||
    url.includes('/splash') ||
    url.includes('/api/')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for static assets, but only store genuine 200 OK responses
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const toCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache));
        }
        return response;
      });
    })
  );
});
