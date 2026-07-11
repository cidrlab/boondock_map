/**
 * Boondock Map service worker — offline app shell.
 *
 * Same-origin GET requests are cached stale-while-revalidate so the app
 * opens with no signal after the first visit. Cross-origin requests (map
 * tiles, Nominatim, Overpass) pass straight through — offline map packs
 * are Phase 2 (VISION.md).
 */

const CACHE = 'boondock-shell-v1'

self.addEventListener('install', () => self.skipWaiting())

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

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
