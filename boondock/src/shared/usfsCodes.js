/**
 * Code tables for the self-hosted USFS vector layers (VISION row 83).
 *
 * The tilesets deliberately carry codes rather than prose — `surf: "NAT"`,
 * `sym: 3`, `veh: 31` — because a vector tile pools attribute values per tile,
 * so a short repeated code costs almost nothing while the spelled-out sentence
 * would be carried on every road in the country. This module is the other half
 * of that bargain: it turns the codes back into something a person can read.
 *
 * Every table here was read off the real data by
 * `data-pipeline/build_road_pmtiles.py --inspect` on 2026-08-09, not from
 * memory or from the USFS data dictionary. If the build's projection changes,
 * these change with it — the two files are a pair.
 */

// Bit order must match the `veh` expression in build_road_pmtiles.py. Both the
// roads and the motorized-trails datasets carry the same nine columns, so one
// decoder serves both.
export const VEHICLE_BITS = [
  [1, 'Passenger car'],
  [2, 'High-clearance'],
  [4, 'Truck'],
  [8, 'Bus'],
  [16, 'Motorhome'],
  [32, '4WD over 50"'],
  [64, '2WD over 50"'],
  [128, 'ATV'],
  [256, 'Motorcycle'],
]

/** Vehicle classes a route is open to, widest first. */
export function vehicleList(veh) {
  const n = Number(veh) || 0
  return VEHICLE_BITS.filter(([bit]) => n & bit).map(([, label]) => label)
}

// MVUM road symbology (S_USA.Road_MVUM.SYMBOL). Verified counts across the
// 151,021 roads with geometry: 1 is over half the network, 11/12 are rare.
export const MVUM_ROAD_SYMBOL = {
  1: { label: 'Open to all vehicles', seasonal: false, kind: 'all' },
  2: { label: 'Open to all vehicles', seasonal: true, kind: 'all' },
  3: { label: 'Highway-legal vehicles only', seasonal: false, kind: 'highway' },
  4: { label: 'Highway-legal vehicles only', seasonal: true, kind: 'highway' },
  11: { label: 'Special designation', seasonal: false, kind: 'special' },
  12: { label: 'Special designation', seasonal: true, kind: 'special' },
}

// MVUM motorized-trail symbology (S_USA.Trail_MVUM.SYMBOL) — a different code
// set from the roads above, which is exactly the sort of thing that silently
// mislabels a layer if you assume the two match.
export const MVUM_TRAIL_SYMBOL = {
  5: { label: 'Open to all vehicles', seasonal: false, kind: 'all' },
  6: { label: 'Open to all vehicles', seasonal: true, kind: 'all' },
  7: { label: 'Vehicles 50" or less', seasonal: false, kind: 'narrow' },
  8: { label: 'Vehicles 50" or less', seasonal: true, kind: 'narrow' },
  9: { label: 'Motorcycles only', seasonal: false, kind: 'moto' },
  10: { label: 'Motorcycles only', seasonal: true, kind: 'moto' },
  11: { label: 'Special designation', seasonal: false, kind: 'special' },
  12: { label: 'Special designation', seasonal: true, kind: 'special' },
  16: { label: 'Wheeled OHV under 50"', seasonal: false, kind: 'narrow' },
  17: { label: 'Wheeled OHV under 50"', seasonal: true, kind: 'narrow' },
}

// SURFACETYP, minus the description the code already implies
export const SURFACE_CODES = {
  NAT: 'Native material',
  IMP: 'Improved native material',
  AGG: 'Gravel or crushed aggregate',
  AC: 'Asphalt',
  P: 'Paved',
  PCC: 'Concrete',
  BST: 'Bituminous surface treatment',
  PIT: 'Pit run / shot rock',
  CSOIL: 'Compacted soil',
  SOD: 'Grass',
  OTHER: 'Other',
}

// Operational maintenance level (OPERATIONA). Level 1 is the one that matters:
// it means closed, and RoadCore leans on the same scale.
export const MAINT_LEVELS = {
  1: 'Basic custodial care (closed)',
  2: 'High-clearance vehicles',
  3: 'Suitable for passenger cars',
  4: 'Moderate comfort',
  5: 'High comfort',
}

// TA_SYMBOL — what the road is actually like underfoot, independent of who may
// legally drive it
export const ROAD_CHARACTER = {
  2: 'Highway',
  3: 'Paved road',
  4: 'Gravel road, passenger car',
  5: 'Dirt road, passenger car',
  6: 'Not maintained for passenger cars',
}

// ALLOWED_TE on the trail-system layer: a digit string of managed uses. The
// meaning of each digit was confirmed against the per-use season columns
// rather than assumed — rows reading '6321' populate only FOURWD_MAN and
// '5321' only ATV_MANAGE, which pins 6 and 5 on their own.
export const TRAIL_USE_DIGITS = {
  1: 'Hiking',
  2: 'Pack and saddle',
  3: 'Bicycle',
  4: 'Motorcycle',
  5: 'ATV',
  6: '4WD over 50"',
}

const MOTORIZED_DIGITS = new Set(['4', '5', '6'])

/** Managed uses for a trail, from the ALLOWED_TE digit string. */
export function trailUses(uses) {
  const s = String(uses ?? '')
  if (!s || s === 'N/A') return []
  return [...s]
    .filter(c => TRAIL_USE_DIGITS[c])
    .sort()
    .map(c => TRAIL_USE_DIGITS[c])
}

/** Whether a trail is managed for any motor vehicle. */
export function trailIsMotorized(uses, moto) {
  if (moto === 'Y') return true
  if (moto === 'N') return false
  return [...String(uses ?? '')].some(c => MOTORIZED_DIGITS.has(c))
}

export const TRAIL_CLASS = {
  1: 'Minimally developed',
  2: 'Moderately developed',
  3: 'Developed',
  4: 'Highly developed',
  5: 'Fully developed',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A season window as USFS writes it ("05/15-09/15") in plain words.
 * "01/01-12/31" is the overwhelming majority and means no seasonal limit at
 * all, so it says so rather than making the reader decode a date range.
 */
export function formatSeason(season) {
  const s = String(season ?? '').trim()
  if (!s || s === 'N/A') return ''
  if (s === '01/01-12/31') return 'Open year-round'
  const m = s.match(/^(\d{2})\/(\d{2})\s*-\s*(\d{2})\/(\d{2})$/)
  if (!m) return s
  const [, m1, d1, m2, d2] = m
  const part = (mm, dd) => `${MONTHS[Number(mm) - 1] || mm} ${Number(dd)}`
  return `Open ${part(m1, d1)} to ${part(m2, d2)}`
}

/** Strip the "NAT - " style prefix off a raw USFS code string. */
export function describeCode(table, value) {
  if (value == null || value === '') return ''
  const key = String(value).trim()
  return table[key] || table[Number(key)] || key
}
