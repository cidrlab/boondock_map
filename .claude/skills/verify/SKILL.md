---
name: verify
description: Verify Boondock Map changes by driving the real app — vite dev server + headless Brave via puppeteer-core
---

# Verify — Boondock Map

Compile check: `npm --prefix web run build` — the web build compiles all of
`boondock/src/` (renderer + shared) via the vite alias, so it covers the
desktop app's source too.

Drive the real app (recipe verified 2026-07-27):

1. `npm --prefix web run dev -- --port 5199 --strictPort` in the background.
   Dev mode skips the service worker (registration is PROD-only), so no
   stale-cache surprises.
2. No Chrome on this Mac — **Brave** is the CDP browser. `npm i
   puppeteer-core` in the scratchpad, then
   `executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'`,
   `headless: 'new'`. WebGL renders fine headless.
3. Sensor stubs go in **before app code** with `page.evaluateOnNewDocument`
   (e.g. replace `navigator.geolocation.watchPosition` and keep the callback
   on `window` to feed fixes). Compass paths take real events:
   `window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',
   { alpha, beta: 0, gamma: 0, absolute: true }))`.
4. Offline simulation: `page.setRequestInterception(true)` and abort by host
   (e.g. `s3.amazonaws.com` for the DEM). Interception also disables the
   HTTP cache, which is what you want for "tile not cached" cases.
5. Theme spot-checks without touching app state:
   `document.documentElement.setAttribute('data-theme', 'light' | 'red')`
   restyles all chrome via the CSS variables — screenshot each.

Gotchas:

- React StrictMode double-mounts effects in dev: sensor watch/clear counters
  read (n, n−1) while mounted, balanced after unmount. Not a leak.
- MapLibre **prepends** controls in the bottom corners: a later
  `addControl(..., 'bottom-right')` renders *higher* in the stack, not lower.
- `puppeteer.launch` flags that suffice: `['--no-first-run']`. Brave shields
  did not block localhost or the tile hosts in headless runs.
