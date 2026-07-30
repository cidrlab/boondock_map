// Small great-circle helpers for compass navigation (VISION rows 90/95).
// Distances are straight-line ("as the crow flies"), which is exactly what
// beeline guidance promises — not road distance.

const R_MILES = 3958.7613

// Initial bearing from → to, degrees clockwise from true north (0–360)
export function bearingTo(from, to) {
  const p1 = from.lat * Math.PI / 180
  const p2 = to.lat * Math.PI / 180
  const dl = (to.lng - from.lng) * Math.PI / 180
  const y = Math.sin(dl) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

// Great-circle distance in miles (haversine)
export function distanceMiles(from, to) {
  const p1 = from.lat * Math.PI / 180
  const p2 = to.lat * Math.PI / 180
  const dp = (to.lat - from.lat) * Math.PI / 180
  const dl = (to.lng - from.lng) * Math.PI / 180
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Shortest signed turn (−180…180) from current heading to a target bearing:
// negative = turn left, positive = turn right
export function relativeTurn(heading, targetBearing) {
  let d = ((targetBearing - heading + 540) % 360) - 180
  if (d === -180) d = 180
  return d
}

// Human distance: feet under ~0.19 mi, else miles with sensible precision
export function formatDistance(mi) {
  if (mi == null || !Number.isFinite(mi)) return '—'
  if (mi < 0.19) return `${Math.round(mi * 5280).toLocaleString()} ft`
  if (mi < 10) return `${mi.toFixed(1)} mi`
  return `${Math.round(mi).toLocaleString()} mi`
}
