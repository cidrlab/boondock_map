/**
 * parseCoords(input) → { lat, lng } | null
 *
 * Handles all common coordinate formats:
 *
 * Decimal degrees (DD):
 *   48.41711, -121.81849
 *   48.41711 -121.81849
 *   N48.41711 W121.81849
 *   48.41711N 121.81849W
 *
 * Degrees Decimal Minutes (DDM):
 *   48° 25.027' N, 121° 49.109' W
 *   48 25.027N 121 49.109W
 *
 * Degrees Minutes Seconds (DMS):
 *   48°25'01.6"N 121°49'6.6"W
 *   48 25 1.6 N 121 49 6.6 W
 *   N48°25'01.6" W121°49'06.6"
 *
 * Google Maps paste (lat,lng with no space):
 *   48.41711,-121.81849
 */

export function parseCoords(raw) {
  if (!raw || raw.trim().length < 3) return null
  const s = raw.trim()

  // ── Try DMS / DDM first (contains degree symbols or d/m/s letters) ──────
  const dmsResult = tryDMS(s)
  if (dmsResult) return dmsResult

  // ── Try plain decimal degrees ─────────────────────────────────────────
  const ddResult = tryDD(s)
  if (ddResult) return ddResult

  return null
}

// ── Decimal Degrees ──────────────────────────────────────────────────────────
function tryDD(s) {
  // Strip common prefixes/suffixes and separators
  // Handles: "48.41711, -121.81849", "N48.41711 W121.81849", "48.41711N 121.81849W"
  const patterns = [
    // signed decimal with comma or space separator (most common paste format)
    /^([+-]?\d{1,3}(?:\.\d+)?)[°\s]*[,;\s]+([+-]?\d{1,3}(?:\.\d+)?)[°\s]*$/,
    // N/S prefix before lat, E/W prefix before lng
    /^[Nn]\s*(\d{1,3}(?:\.\d+)?)[°\s]*[,;\s]+[EeWw]\s*(\d{1,3}(?:\.\d+)?)/,
    // lat with N/S suffix, lng with E/W suffix
    /^(\d{1,3}(?:\.\d+)?)\s*([NnSs])[°\s,;\s]+(\d{1,3}(?:\.\d+)?)\s*([EeWw])/,
  ]

  // Pattern 1: signed decimals
  let m = s.match(/^([+-]?\d{1,3}(?:\.\d+)?)\s*[°]?\s*[,;\s]+\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[°]?\s*$/)
  if (m) {
    const lat = parseFloat(m[1])
    const lng = parseFloat(m[2])
    return validateLatLng(lat, lng)
  }

  // Pattern 2: N/S+E/W prefix  e.g. N48.417 W121.818
  m = s.match(/^[Nn]\s*(\d{1,3}(?:\.\d+)?)[°\s]*[,;\s]*[Ww]\s*(\d{1,3}(?:\.\d+)?)/)
  if (m) return validateLatLng(parseFloat(m[1]), -parseFloat(m[2]))

  m = s.match(/^[Nn]\s*(\d{1,3}(?:\.\d+)?)[°\s]*[,;\s]*[Ee]\s*(\d{1,3}(?:\.\d+)?)/)
  if (m) return validateLatLng(parseFloat(m[1]), parseFloat(m[2]))

  m = s.match(/^[Ss]\s*(\d{1,3}(?:\.\d+)?)[°\s]*[,;\s]*[Ww]\s*(\d{1,3}(?:\.\d+)?)/)
  if (m) return validateLatLng(-parseFloat(m[1]), -parseFloat(m[2]))

  // Pattern 3: suffix  e.g. 48.417N 121.818W
  m = s.match(/^(\d{1,3}(?:\.\d+)?)\s*([NnSs])\s*[,;\s]*\s*(\d{1,3}(?:\.\d+)?)\s*([EeWw])/)
  if (m) {
    const lat = parseFloat(m[1]) * (m[2].toUpperCase() === 'S' ? -1 : 1)
    const lng = parseFloat(m[3]) * (m[4].toUpperCase() === 'W' ? -1 : 1)
    return validateLatLng(lat, lng)
  }

  return null
}

// ── DMS / DDM ────────────────────────────────────────────────────────────────
function tryDMS(s) {
  // Normalize: replace degree/minute/second symbols with space-separated tokens
  const norm = s
    .replace(/°/g, ' d ')
    .replace(/['''′]/g, ' m ')
    .replace(/["""″]/g, ' s ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()

  // Pull out two coordinate chunks (lat and lng)
  // Each chunk: digits + direction letter
  const chunkRe = /([NSEW])?\s*([\d.]+)\s*[Dd]?\s*([\d.]+)?\s*[Mm]?\s*([\d.]+)?\s*[Ss]?\s*([NSEW])?/g
  const chunks = []
  let match
  while ((match = chunkRe.exec(norm)) !== null && chunks.length < 2) {
    const dir = (match[1] || match[5] || '').toUpperCase()
    const deg = parseFloat(match[2] || 0)
    const min = parseFloat(match[3] || 0)
    const sec = parseFloat(match[4] || 0)
    if (isNaN(deg)) continue
    const dd = deg + min / 60 + sec / 3600
    chunks.push({ dd, dir })
  }

  if (chunks.length < 2) return null

  let lat = chunks[0].dd
  let lng = chunks[1].dd

  // Apply hemisphere
  if (chunks[0].dir === 'S') lat = -lat
  if (chunks[1].dir === 'W') lng = -lng
  // If no dir given and lng looks like it should be negative (US/Canada)
  if (!chunks[1].dir && lng > 0 && lng < 180 && lat > 0 && lat < 90) {
    // Ambiguous — leave as-is; user can add W if needed
  }

  return validateLatLng(lat, lng)
}

function validateLatLng(lat, lng) {
  if (isNaN(lat) || isNaN(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 }
}

/**
 * Format a {lat, lng} as a clean decimal degrees string
 */
export function formatCoords(lat, lng, precision = 5) {
  const latStr = `${Math.abs(lat).toFixed(precision)}°${lat >= 0 ? 'N' : 'S'}`
  const lngStr = `${Math.abs(lng).toFixed(precision)}°${lng >= 0 ? 'E' : 'W'}`
  return `${latStr}  ${lngStr}`
}
