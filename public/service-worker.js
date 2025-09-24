const CACHE_NAME = 'ble-pwa-v1';
const urlsToCache = ['/', '/index.html'];

// Install
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching initial URLs:', urlsToCache);
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch
self.addEventListener('fetch', (event) => {
  console.log('[SW] Fetch event for:', event.request.url);

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        console.log('[SW] Cache hit:', event.request.url);
        return cachedResponse;
      }
      console.log('[SW] Cache miss, fetching from network:', event.request.url);
      return fetch(event.request).catch((err) => {
        console.error('[SW] Network fetch failed:', event.request.url, err);
        // Optionally return a fallback response instead of crashing
        return new Response('⚠️ Offline or fetch failed', {
          status: 503,
          statusText: 'Service Unavailable',
        });
      });
    })
  );
});

// Activate (cleanup old caches)
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
});
