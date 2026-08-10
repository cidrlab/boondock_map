/**
 * boondock-web — browser implementation of the window.boondock API
 *
 * The desktop app exposes this API from Electron's preload (IPC → iCloud
 * files). Here the same interface is backed by IndexedDB, so the React app
 * and all components run unmodified. Cross-tab updates ride BroadcastChannel,
 * mirroring the desktop's iCloud file-watcher semantics.
 */

const DB_NAME = 'boondock'
const STORE = 'kv'

// Ask the browser to treat this data as persistent (VISION row 114).
//
// Everything the user owns — waypoints, tracks, prefs — lives in IndexedDB on
// the web build, and by default that is *evictable*: browsers are free to clear
// it under storage pressure, and Safari's tracking prevention clears
// script-writable storage for sites you haven't opened in a while. Someone who
// saved a season of camping spots and then didn't open the map for a few weeks
// could come back to nothing, with no warning and no way to recover it.
//
// A granted persist() exempts the origin from that. It is not a guarantee — the
// user can still clear site data deliberately, and the grant depends on
// engagement heuristics (installing to the home screen makes it far more
// likely) — so it is a floor, not a backup. The real backup is GPX export.
// Fire and forget: a refusal changes nothing about how the app behaves.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function kvGet(key) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function kvSet(key, value) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve({ ok: true })
    tx.onerror = () => reject(tx.error)
  })
}

// ── GPX (same output shape as the desktop main process) ─────────────────────
function escapeXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildGPX({ waypoints = [], tracks = [] }) {
  const wptXml = waypoints.map(w => `
  <wpt lat="${w.lat}" lon="${w.lng}">
    ${w.elev_ft != null ? `<ele>${(w.elev_ft / 3.28084).toFixed(1)}</ele>` : ''}
    <name>${escapeXml(w.name)}</name>
    <desc>${escapeXml(w.notes || '')}</desc>
    <sym>${escapeXml(w.icon || 'Flag, Blue')}</sym>
    ${w.status || w.favorite ? `<type>${escapeXml([w.status, w.favorite ? 'fav' : null].filter(Boolean).join('-'))}</type>` : ''}
    <time>${w.createdAt || ''}</time>
  </wpt>`).join('')

  const trkXml = tracks.map(t => `
  <trk>
    <name>${escapeXml(t.name)}</name>
    <trkseg>
      ${t.points.map(p => `<trkpt lat="${p.lat}" lon="${p.lng}"><ele>${p.ele || 0}</ele><time>${p.time || ''}</time></trkpt>`).join('\n      ')}
    </trkseg>
  </trk>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BoondockMap" xmlns="http://www.topografix.com/GPX/1/1">
${wptXml}
${trkXml}
</gpx>`
}

// ── Cross-tab live updates (desktop equivalent: iCloud file watcher) ─────────
const channel = 'BroadcastChannel' in window ? new BroadcastChannel('boondock-waypoints') : null

window.boondock = {
  // Waypoints
  loadWaypoints: async () => (await kvGet('waypoints')) || [],
  saveWaypoints: async (wps) => {
    const res = await kvSet('waypoints', wps)
    channel?.postMessage(wps)
    return res
  },
  getSyncPath: async () => 'this browser (IndexedDB)',
  onRemoteWaypointUpdate: (cb) => {
    channel?.addEventListener('message', (e) => cb(e.data))
  },

  // Tracks
  loadTracks: async () => (await kvGet('tracks')) || [],
  saveTracks: (tracks) => kvSet('tracks', tracks),

  // Offline tiles — web packs arrive in Phase 2 (see VISION.md)
  listTilePacks: async () => [],
  getTilesDir: async () => '',
  downloadTiles: async () => {
    throw new Error('Offline map packs are not available in the web version yet — the desktop app can download them today.')
  },
  onTileProgress: () => {},

  // Import / Export
  exportGPX: async (data) => {
    const blob = new Blob([buildGPX(data)], { type: 'application/gpx+xml' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'boondock-export.gpx'
    a.click()
    URL.revokeObjectURL(a.href)
    return { ok: true }
  },
  importGPX: () => new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.gpx,application/gpx+xml'
    input.multiple = true
    input.onchange = async () => {
      const files = await Promise.all(
        Array.from(input.files).map(async f => ({ name: f.name, content: await f.text() }))
      )
      resolve({ ok: files.length > 0, files })
    }
    input.oncancel = () => resolve({ ok: false, files: [] })
    input.click()
  }),

  // Preferences
  loadPrefs: () => kvGet('prefs'),
  savePrefs: (prefs) => kvSet('prefs', prefs),

  // Search history
  loadSearchHistory: async () => (await kvGet('searchHistory')) || [],
  saveSearchHistory: (history) => kvSet('searchHistory', (history || []).slice(0, 50)),

  // Desktop opens the iCloud folder; the web equivalent is a GPX backup hint
  openSyncFolder: () => {
    window.alert('Web data lives in this browser. Use Export GPX (toolbar) to back up or move it.')
  },
}
