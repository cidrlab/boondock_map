/**
 * offlineTiles — offline map packs for desktop and web.
 *
 * Tiles for a user-chosen area download into IndexedDB (works in both the
 * Electron renderer and the browser/PWA). A custom MapLibre protocol,
 * boondock://tile/<layerId>/{z}/{x}/{y}, serves every map source pack-first
 * with network fallback, so the same map works online and offline on all
 * platforms. User-drawn packs live here; prebuilt regional PMTiles packs are
 * a later phase (VISION.md).
 */

import { BASE_LAYERS, OVERLAY_LAYERS, PACK_LAYERS } from './layers'

const DB_NAME = 'boondock-tiles'
const PACKS = 'packs'
const TILES = 'tiles'
// Tile keys are `${packId}/${z}/${x}/${y}`; pack ids are UUIDs (no '/'),
// so a [id + '/', id + '0'] range covers exactly one pack's tiles.

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(PACKS, { keyPath: 'id' })
        req.result.createObjectStore(TILES)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
  })
}

// ── Tile math ────────────────────────────────────────────────────────────────
export function lonLatToTile(lon, lat, z) {
  const n = Math.pow(2, z)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  const clamp = (v) => Math.max(0, Math.min(n - 1, v))
  return { x: clamp(x), y: clamp(y) }
}

export function tilesInBbox(bbox, minZoom, maxZoom) {
  const [minLon, minLat, maxLon, maxLat] = bbox
  const list = []
  for (let z = minZoom; z <= maxZoom; z++) {
    const tl = lonLatToTile(minLon, maxLat, z)
    const br = lonLatToTile(maxLon, minLat, z)
    for (let x = tl.x; x <= br.x; x++) {
      for (let y = tl.y; y <= br.y; y++) list.push({ z, x, y })
    }
  }
  return list
}

// ── Layer registry: id → remote URL template ────────────────────────────────
// direct-render layers (bbox templates) can't go through the tile protocol
const TEMPLATES = {}
for (const [id, l] of Object.entries({ ...BASE_LAYERS, ...OVERLAY_LAYERS, ...PACK_LAYERS })) {
  if (l.tileUrl && !l.direct) TEMPLATES[id] = { template: l.tileUrl, subdomains: l.subdomains }
}
// Legacy pack layerIds from the pre-v3 layer model keep rendering
TEMPLATES['esri-satellite'] = TEMPLATES['satellite']

function remoteUrl(layerId, z, x, y) {
  const t = TEMPLATES[layerId]
  if (!t) throw new Error(`unknown layer ${layerId}`)
  let url = t.template.replace('{z}', z).replace('{x}', x).replace('{y}', y)
  if (t.subdomains) url = url.replace('{s}', t.subdomains[(x + y) % t.subdomains.length])
  return url
}

export function toProtocolUrl(layerId) {
  return `boondock://tile/${layerId}/{z}/{x}/{y}`
}

// ── Pack store ───────────────────────────────────────────────────────────────
// Pack list is cached; the channel invalidates it across tabs/windows.
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('boondock-packs') : null
let packsCache = null
channel?.addEventListener('message', () => { packsCache = null })

function packsChanged() {
  packsCache = null
  channel?.postMessage('changed')
  // BroadcastChannel skips the posting context; cover same-tab listeners too
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('boondock-packs-changed'))
}

export async function listPacks() {
  if (packsCache) return packsCache
  const db = await openDb()
  const all = await tx(db, PACKS, 'readonly', (s) => s.getAll())
  packsCache = (all || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return packsCache
}

export async function deletePack(id) {
  const db = await openDb()
  await tx(db, TILES, 'readwrite', (s) => s.delete(IDBKeyRange.bound(id + '/', id + '0')))
  await tx(db, PACKS, 'readwrite', (s) => s.delete(id))
  packsChanged()
}

export async function getTile(layerId, z, x, y) {
  const packs = await listPacks()
  const db = await openDb()
  for (const p of packs) {
    if (p.layerId !== layerId || z < p.minZoom || z > p.maxZoom) continue
    const blob = await tx(db, TILES, 'readonly', (s) => s.get(`${p.id}/${z}/${x}/${y}`))
    if (blob) return blob
  }
  return null
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null
  const { usage, quota } = await navigator.storage.estimate()
  return { usage, quota }
}

// ── Downloader ───────────────────────────────────────────────────────────────
const CONCURRENCY = 5

/**
 * Download a pack. onProgress({done, total, bytes}) fires as tiles land.
 * opts.signal (AbortSignal) cancels; a canceled pack is removed.
 * Resolves {id, count, bytes, failed}.
 */
export async function downloadPack({ name, layerId, bbox, minZoom, maxZoom, signal }, onProgress) {
  const tiles = tilesInBbox(bbox, minZoom, maxZoom)
  const id = crypto.randomUUID()
  const db = await openDb()
  let done = 0
  let bytes = 0
  let failed = 0

  // Ask the browser to protect this data from eviction (matters on iOS)
  navigator.storage?.persist?.().catch(() => {})

  const queue = [...tiles]
  async function worker() {
    while (queue.length) {
      if (signal?.aborted) return
      const t = queue.shift()
      try {
        const res = await fetch(remoteUrl(layerId, t.z, t.x, t.y), { signal })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        bytes += blob.size
        await tx(db, TILES, 'readwrite', (s) => s.put(blob, `${id}/${t.z}/${t.x}/${t.y}`))
      } catch (e) {
        if (signal?.aborted) return
        failed++
      }
      done++
      if (done % 10 === 0 || done === tiles.length) onProgress?.({ done, total: tiles.length, bytes })
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  if (signal?.aborted) {
    await deletePack(id)
    const err = new Error('canceled')
    err.canceled = true
    throw err
  }

  const pack = {
    id, name, layerId, bbox, minZoom, maxZoom,
    count: tiles.length - failed, failed, bytes,
    createdAt: new Date().toISOString(),
  }
  await tx(db, PACKS, 'readwrite', (s) => s.put(pack))
  packsChanged()
  return pack
}

// ── MapLibre protocol ────────────────────────────────────────────────────────
let installed = false
let emptyTile = null

// Tile servers (USFS especially) 404 where a layer simply has no data;
// render those as transparent rather than surfacing per-tile errors
async function transparentTile() {
  if (!emptyTile) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))
    emptyTile = await blob.arrayBuffer()
  }
  return emptyTile
}

export function installProtocol(maplibregl) {
  if (installed) return
  installed = true
  maplibregl.addProtocol('boondock', async ({ url }, abortController) => {
    // boondock://tile/<layerId>/<z>/<x>/<y>
    const [, , , layerId, z, x, y] = url.split('/')
    const local = await getTile(layerId, +z, +x, +y)
    if (local) return { data: await local.arrayBuffer() }
    const res = await fetch(remoteUrl(layerId, +z, +x, +y), { signal: abortController?.signal })
    if (res.status === 404) return { data: await transparentTile() }
    if (!res.ok) throw new Error(`tile ${layerId}/${z}/${x}/${y}: HTTP ${res.status}`)
    return { data: await res.arrayBuffer() }
  })
}

// Debug/probe handle (also handy in the devtools console)
if (typeof window !== 'undefined') {
  window.boondockOffline = { listPacks, deletePack, downloadPack, getTile, tilesInBbox, storageEstimate }
}
