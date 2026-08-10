/**
 * Boondock Map service worker — offline app shell.
 *
 * Navigations are network-first so new deploys land on the next load,
 * falling back to cache when offline. Hashed assets are cached
 * stale-while-revalidate. Cross-origin requests (map tiles, Nominatim,
 * Overpass) pass straight through — offline map packs are handled by the
 * app's own tile store, not this worker.
 */

const CACHE = 'boondock-shell-v3'

// Precache the shell at install. Without this the shell was only cached once
// the worker had *already* claimed a navigation — so someone who opened the
// map once and then lost signal got the browser's error page, not the app
// (verified 2026-08-09 by killing the origin server: title "localhost", no
// canvas). The first visit is exactly the visit that needs to survive.
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .catch(() => {})   // a missing entry must not block activation
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          // 206 is `ok`, but Cache.put rejects on a partial response — and the
          // .pmtiles road layers are fetched entirely by HTTP range, so this
          // fired a TypeError on every tile read before it was guarded.
          // Storing byte ranges needs the app's own tile store, not this
          // cache (VISION row 123).
          if (res.ok && res.status !== 206) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
