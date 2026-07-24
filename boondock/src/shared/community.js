/**
 * Community reports — client for the boondock-community Worker and the
 * published community.geojson layer (design: VISION row 12).
 *
 * Reads are static: the merge pipeline publishes approved reports nightly
 * into data/community.geojson and the app just fetches it with the state
 * files. Writes (report / check-in / flag) go to the Worker, anonymous and
 * filtered server-side; see worker/README.md.
 *
 * A spot you just reported appears immediately as a local "pending" pin
 * (localStorage) and is dropped once the published layer carries its id —
 * or after 45 days, in case it was rejected in review.
 */

// Paste the deployed Worker URL here (worker/README.md prints it). Empty
// hides every community write control; the published layer still renders.
const DEFAULT_COMMUNITY_API = ''

export const COMMUNITY_API =
  (import.meta.env?.VITE_COMMUNITY_API || DEFAULT_COMMUNITY_API).replace(/\/+$/, '')

export const communityEnabled = () => Boolean(COMMUNITY_API)

async function post(path, body) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(COMMUNITY_API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('No connection to the community service')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

// → {ok, id, held}
export const submitSpot = ({ kind, name, desc, lng, lat }) =>
  post('/submit', { kind, name, desc, lng, lat })

// → {ok, held}
export const submitCheckin = (spotId, ok, comment) =>
  post('/checkin', { spot: spotId, ok, comment })

export const flagSpot = (spotId, reason) => post('/flag', { spot: spotId, reason })

// Published community layer; absent file (first deploy) → empty
export async function loadCommunityFeatures(baseUrl) {
  try {
    const res = await fetch(baseUrl + 'data/community.geojson')
    if (!res.ok) return []
    const fc = await res.json()
    return fc.features || []
  } catch {
    return []
  }
}

// ── Local pending pins ──────────────────────────────────────────────────────

const PENDING_KEY = 'boondock-pending-reports'
const PENDING_MAX_AGE_MS = 45 * 24 * 3600 * 1000

function readPending() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY)) || []
  } catch {
    return []
  }
}

export function pendingFeature({ id, kind, name, desc, lng, lat }) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id, kind, name, src: 'community', status: 'pending',
      reported: new Date().toISOString().slice(0, 10),
      checkins: [],
      ...(desc && { desc }),
    },
  }
}

export function addPendingReport(feature) {
  const list = readPending()
  list.push({ savedAt: Date.now(), feature })
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch {
    // storage full/blocked — the pin just won't survive a reload
  }
}

// Drop pending pins that got published (id now in the layer) or aged out;
// returns the features still worth drawing
export function prunePendingReports(publishedIds) {
  const now = Date.now()
  const keep = readPending().filter(
    (p) => now - p.savedAt < PENDING_MAX_AGE_MS && !publishedIds.has(p.feature?.properties?.id)
  )
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(keep))
  } catch {
    /* best effort */
  }
  return keep.map((p) => p.feature)
}
