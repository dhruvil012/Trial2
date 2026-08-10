// CivilCalc improved service worker — safer install and cache update
const CACHE_NAME = 'civilcalc-v73-20260810-complete';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Helper: try to add a single resource to cache and return result
async function addToCacheSafely(cache, url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await cache.put(url, res.clone());
    return { url, ok: true };
  } catch (err) {
    // swallow the error but report it
    console.warn('[sw] cache add failed:', url, err && err.message ? err.message : err);
    return { url, ok: false, error: String(err) };
  }
}

self.addEventListener('install', (event) => {
  // Install should not fail completely if one resource is missing.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const results = await Promise.all(CORE_ASSETS.map((u) => addToCacheSafely(cache, u)));
      const failed = results.filter(r => !r.ok);
      if (failed.length) {
        // Keep install but log the missing items — this prevents being stuck on old SW
        console.warn('[sw] Some core assets failed to cache during install:', failed);
      } else {
        console.log('[sw] All core assets cached during install.');
      }
      // Activate new SW immediately
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove old caches except the current one
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      );
      // Take control immediately
      await self.clients.claim();
      console.log('[sw] Activated and old caches cleaned.');
    })()
  );
});

// Navigation: try network first for fresh HTML, fallback to cached index.html
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = new URL(request.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkResp = await fetch(request);
          // Update cached index.html for offline fallback
          if (networkResp && networkResp.ok) {
            const cache = await caches.open(CACHE_NAME);
            // store as ./index.html (relative) so matches our CORE_ASSETS cache key
            await cache.put('./index.html', networkResp.clone());
          }
          return networkResp;
        } catch (err) {
          // Network failed — fallback to cache
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          // last resort: return a basic Response
          return new Response('<!doctype html><meta charset="utf-8"><title>Offline</title><body>Offline</body>', {
            headers: { 'Content-Type': 'text/html' }
          });
        }
      })()
    );
    return;
  }

  // For other resources: cache-first, then network; update cache in background
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        // Kick off a network update but don't block response
        event.waitUntil(
          (async () => {
            try {
              const networkResp = await fetch(request);
              if (networkResp && networkResp.ok) {
                await cache.put(request, networkResp.clone());
              }
            } catch (err) {
              // ignore network update errors
              console.warn('[sw] Background update failed for', request.url, err && err.message ? err.message : err);
            }
          })()
        );
        return cached;
      }

      // No cached entry — try network then cache if successful
      try {
        const networkResp = await fetch(request);
        if (networkResp && networkResp.ok) {
          // store a copy for later
          await cache.put(request, networkResp.clone());
        }
        return networkResp;
      } catch (err) {
        // network failed and no cache -> return a fallback for images/resources if desired
        // For now return a 404-like Response so caller knows
        return new Response('', { status: 404, statusText: 'Not Found' });
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data === 'SKIP_WAITING' || (event.data && event.data.type === 'SKIP_WAITING')) {
    self.skipWaiting().then(() => {
      console.log('[sw] skipWaiting executed via message.');
    });
  }
});
