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

  // Decimal degrees first. This order matters and used to be the other way
  // round, which silently put people on the wrong side of the planet: the DMS
  // reader's number token is `[\d.]+`, which cannot match a minus sign, so
  // "48.88844, -122.00262" parsed as 48.88844, **+**122.00262 — Washington
  // State became western China, and the card looked perfectly confident about
  // it (reported 2026-08-09). A signed decimal pair is unambiguous, so it is
  // read first, and tryDMS now refuses anything without real DMS marks.
  const ddResult = tryDD(s)
  if (ddResult) return ddResult

  const dmsResult = tryDMS(s)
  if (dmsResult) return dmsResult

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
  // Only claim input that actually carries degree/minute/second marks or a
  // hemisphere letter. Without this guard the reader below happily "parses"
  // any pair of numbers, dropping their signs on the way through — which is
  // how a plain decimal paste ended up mirrored across the prime meridian.
  if (!/[°'"′″]|[NSEWnsew]\s*\d|\d\s*[NSEWnsew]/.test(s)) return null

  // Hemisphere letters, in order, pulled out *before* anything else. They are
  // read separately from the numbers because a letter sitting between two
  // coordinates is genuinely ambiguous — the W in "48°…N 121°…W" suffixes its
  // own coordinate, the W in "N48°… W121°…" prefixes the next one — and any
  // rule deciding from position alone gets one of the two forms wrong. Taken
  // in order they map 1:1 onto the coordinates either way.
  // (S is also the seconds marker once upper-cased, which is exactly why the
  // markers below are reduced to spaces rather than to letters.)
  const dirs = (s.toUpperCase().match(/[NSEW]/g) || [])

  const norm = s
    .replace(/[\u00b0'\u2018\u2019\u2032"\u201c\u201d\u2033]/g, ' ')
    .replace(/[NSEWnsew]/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // What is left is numbers: degrees [minutes [seconds]] per coordinate. Split
  // them evenly; an odd count means the two halves disagree about format,
  // which is not something to guess at.
  const nums = (norm.match(/[+-]?\d+(?:\.\d+)?/g) || []).map(Number)
  if (nums.length < 2 || nums.length % 2 !== 0 || nums.length > 6) return null
  const per = nums.length / 2

  const toDD = (parts) => {
    const [deg, min = 0, sec = 0] = parts
    if (!Number.isFinite(deg)) return NaN
    // Minutes and seconds are magnitudes; the degree carries the sign
    return Math.sign(deg || 1) * (Math.abs(deg) + min / 60 + sec / 3600)
  }
  const chunks = [
    { dd: toDD(nums.slice(0, per)), dir: dirs[0] || '' },
    { dd: toDD(nums.slice(per)), dir: dirs[1] || '' },
  ]

  let lat = chunks[0].dd
  let lng = chunks[1].dd

  // A hemisphere letter is the authority when present — take the magnitude and
  // let the letter decide the sign, so "48 25.027 S" cannot come out positive
  // and "-121 49.109 W" cannot double-negate back to the east.
  if (chunks[0].dir) lat = Math.abs(lat) * (chunks[0].dir === 'S' ? -1 : 1)
  if (chunks[1].dir) lng = Math.abs(lng) * (chunks[1].dir === 'W' ? -1 : 1)

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
