/**
 * Verification for sight.js — run with:
 *   node boondock/src/shared/sight.test.mjs
 *
 * The DEM is injected, so every expectation here is solvable independently of
 * the code under test:
 *   A. flat plain from a height — the crossing distance has a closed form
 *      (quadratic in d once the curvature term is written out), solved here
 *      separately and compared against the march.
 *   B. a wall at a known range — the hit must land on its face.
 *   C. a ray aimed above everything — no hit, full coverage.
 *   D. missing tiles — coverage drops and the gap is flagged, because a
 *      missing tile could hide the ridge that was actually sighted.
 *   E. the uncertainty fan — corners must sit where destination() puts them,
 *      and the ±3° bearing spread at ~3 km must match 2·d·tan 3°.
 *   F. directionAngles — the inverse of the AR view's projection frame:
 *      east/north/up vectors map to the compass directions they are.
 */

import { sightRay, sightFix, directionAngles } from './sight.js'
import { destination } from './sun.js'

const RAD = Math.PI / 180
let failures = 0
const check = (name, got, want, tol) => {
  if (Number.isFinite(got) && Math.abs(got - want) <= tol) return
  failures++
  console.error(`FAIL ${name}: got ${got}, want ${want} ±${tol}`)
}
const assert = (name, cond) => {
  if (cond) return
  failures++
  console.error(`FAIL ${name}`)
}

const OBS = { lat: 44.0, lng: -121.0 }
// Ground distance from OBS, equirectangular on the same sphere destination()
// uses — the near-grazing case (E2) amplifies any geodesy mismatch between
// the sampler's idea of distance and the march's
const M_PER_DEG = 6371008.8 * RAD
const meters = (lng, lat) => {
  const dx = (lng - OBS.lng) * M_PER_DEG * Math.cos(OBS.lat * RAD)
  const dy = (lat - OBS.lat) * M_PER_DEG
  return Math.hypot(dx, dy)
}

// ── A. flat plain from 100 m up, pitch −2° ─────────────────────────────────
{
  const flat = async () => 0
  const eye = 100 + 1.7
  const tanP = Math.tan(-2 * RAD)
  // Crossing: −c·d² = eye + d·tanP with c = (1−0.13)/(2R); smaller root
  const c = (1 - 0.13) / (2 * 6371008.8)
  const disc = Math.sqrt(tanP * tanP - 4 * c * eye)
  const expected = (-tanP - disc) / (2 * c)

  const r = await sightRay({ ...OBS, azimuth: 90, pitch: -2, eyeHeight: eye, sample: flat })
  assert('A hit exists', r.hit != null)
  check('A distance', r.hit.distance, expected, 20)
  check('A coverage', r.coverage, 1, 1e-9)
  assert('A no gaps', !r.gapBeforeHit)
  // The march went east; the hit must sit due east of the observer
  check('A hit lat', r.hit.lat, OBS.lat, 0.01)
  assert('A hit east of observer', r.hit.lng > OBS.lng)
}

// ── B. a 500 m wall starting 3 km out ──────────────────────────────────────
const wall = async (lng, lat) => (meters(lng, lat) > 3000 ? 500 : 0)
{
  const r = await sightRay({ ...OBS, azimuth: 0, pitch: 0, sample: wall })
  assert('B hit exists', r.hit != null)
  check('B distance', r.hit.distance, 3000, 60)
  check('B elevation', r.hit.elevation, 500, 1e-9)
}

// ── C. aimed above everything ──────────────────────────────────────────────
{
  const r = await sightRay({ ...OBS, azimuth: 0, pitch: 10, sample: wall, maxDistance: 20000 })
  assert('C no hit', r.hit == null)
  check('C coverage', r.coverage, 1, 1e-9)
}

// ── D. missing tiles beyond 1 km ───────────────────────────────────────────
{
  const gappy = async (lng, lat) => (meters(lng, lat) > 1000 ? null : 0)
  const r = await sightRay({ ...OBS, azimuth: 0, pitch: 0.5, sample: gappy })
  assert('D no hit', r.hit == null)
  assert('D gap flagged', r.gapBeforeHit)
  assert('D coverage below 1', r.coverage < 0.2)
}

// ── E. the uncertainty fan on the wall ─────────────────────────────────────
{
  // Sighted from a 100 m rise: all three pitch rays (0, ±1°) then meet the
  // wall face rather than the flat foreground, so the fix must come back
  // tight. (From ground level a −1° ray really does land ~100 m out — that
  // case is E2's territory, not a bug.)
  const f = await sightFix({ ...OBS, azimuth: 0, pitch: 0, eyeHeight: 101.7, sample: wall, azSigma: 3, pitchSigma: 1 })
  assert('E hit exists', f.hit != null)
  assert('E fan exists', Array.isArray(f.fan) && f.fan.length === 5)
  assert('E fan closes', f.fan[0][0] === f.fan[4][0] && f.fan[0][1] === f.fan[4][1])
  assert('E not open-ended', !f.openEnded)     // the +1° ray still meets the wall

  // Near corners must be destination() at (az ± 3°, near); check one exactly
  const c0 = destination(OBS.lat, OBS.lng, -3, f.near)
  check('E corner lng', f.fan[0][0], c0.lng, 1e-9)
  check('E corner lat', f.fan[0][1], c0.lat, 1e-9)

  // ±3° of bearing at the hit range must spread the corners by 2·d·tan 3°
  const dx = (f.fan[1][0] - f.fan[0][0]) * M_PER_DEG * Math.cos(OBS.lat * RAD)
  const dy = (f.fan[1][1] - f.fan[0][1]) * M_PER_DEG
  check('E bearing spread', Math.hypot(dx, dy), 2 * f.near * Math.tan(3 * RAD), 6)

  // Pitch ±1° against a vertical wall: every ray stops at the face, so the
  // fix is tight and not grazing
  assert('E not grazing', !f.grazing)
}

// ── E2. grazing geometry: a 1% up-slope sighted almost along it ────────────
{
  // Terrain rises 1 m per 100 m; the ray at +0.5° climbs ~0.87. The slope
  // overtakes the eye height ~1.4 km out (solved below), but 1° of pitch
  // swings the crossing from ~90 m to never — the definition of a grazing
  // fix, and exactly what the flags must say.
  const slope = async (lng, lat) => meters(lng, lat) * 0.01
  const f = await sightFix({ ...OBS, azimuth: 0, pitch: 0.5, sample: slope, pitchSigma: 1, maxDistance: 20000 })
  assert('E2 hit exists', f.hit != null)
  // Crossing: slope·d − c·d² = 1.7 + d·tan 0.5°, solved independently
  const c = (1 - 0.13) / (2 * 6371008.8)
  const m = 0.01 - Math.tan(0.5 * RAD)
  const d2 = (m - Math.sqrt(m * m - 4 * c * 1.7)) / (2 * c)
  check('E2 distance', f.hit.distance, d2, d2 * 0.02 + 30)
  assert('E2 grazing flagged', f.grazing)
  assert('E2 open-ended', f.openEnded)    // +1.5° outclimbs a 1% slope for good
}

// ── F. directionAngles inverts the east/north/up frame ─────────────────────
{
  const north = directionAngles([0, 1, 0])
  check('F north az', north.azimuth, 0, 1e-9)
  check('F north pitch', north.pitch, 0, 1e-9)
  const east = directionAngles([1, 0, 0])
  check('F east az', east.azimuth, 90, 1e-9)
  const sw = directionAngles([-Math.SQRT1_2, -Math.SQRT1_2, 0])
  check('F southwest az', sw.azimuth, 225, 1e-9)
  const up30 = directionAngles([0, Math.cos(30 * RAD), Math.sin(30 * RAD)])
  check('F pitch 30', up30.pitch, 30, 1e-9)
  check('F pitch 30 az', up30.azimuth, 0, 1e-9)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('sight.js: march, bisection, curvature, gaps, fan geometry, grazing flag, and frame inversion all agree with independent solutions')
