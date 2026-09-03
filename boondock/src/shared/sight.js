/**
 * sight — turn one sighting (a position, a true bearing, a pitch) into the
 * point on the ground it lands on, by marching the ray through the same
 * terrarium DEM the hillshade draws (VISION row 139).
 *
 * The geometry is the fire lookout's: an Osborne Firefinder gave azimuth and
 * vertical angle from a known tower, and two towers crossed bearings to fix
 * the distance. The DEM is the second tower — the ray is walked outward,
 * dropping terrain by the same curvature-with-refraction correction
 * `horizonProfile` uses, until it first passes below the ground.
 *
 * Everything here is honest about its blind spots: a DEM tile that fails to
 * load could hide the ridge the user actually sighted, so gaps are counted
 * and reported rather than skipped over; and `sightFix` re-marches the ray at
 * the edges of the stated sensor uncertainty, so the error on the map is the
 * real geometry (a fan that stretches for miles on a grazing ray) rather than
 * a cosmetic circle.
 */

import { elevationAt } from './elevation.js'
import { destination } from './sun.js'

const RAD = Math.PI / 180
const R_EARTH = 6371008.8        // mean radius, metres — the value sun.js uses
const K_REFRACTION = 0.13        // optical refraction, as in horizonProfile

// How far a sighting reaches (row 140): 100 km ≈ 62 mi. Mountain sightlines
// genuinely run this far on a clear day, and the march stops at first strike,
// so only a sky-aim or the far uncertainty ray ever walks the whole length.
// Exported so the view's copy is computed from the engine, not retyped.
export const MAX_SIGHT_M = 100000

/** Effective terrain height at range d: curvature sinks distant ground. */
const dropAt = (d) => (1 - K_REFRACTION) * d * d / (2 * R_EARTH)

/**
 * Compass direction and pitch of a camera-forward vector expressed in the
 * local east/north/up frame (`attitudeBasis(...).forward`).
 */
export function directionAngles(forward) {
  const az = Math.atan2(forward[0], forward[1]) / RAD
  return {
    azimuth: ((az % 360) + 360) % 360,
    pitch: Math.asin(Math.max(-1, Math.min(1, forward[2]))) / RAD,
  }
}

/**
 * March a ray from (lat, lng) along a *true* bearing at `pitch` degrees until
 * it meets the terrain. Steps thicken with range like the ridgeline scan, but
 * start finer (the DEM pixel is ~40–75 m at its z11) because here the answer
 * is a position, not just an angle; the crossing is then bisected to ~15 m,
 * which is already inside one DEM pixel. Beyond 12 km the step (150–250 m)
 * can stride over a spine narrower than the step, so a distant thin ridge
 * can be overshot — a limit worth stating out loud rather than hiding.
 *
 * Resolves to:
 *   { hit: {lat, lng, distance, elevation} | null, coverage, gapBeforeHit }
 * `coverage` is the fraction of samples with elevation data. `gapBeforeHit`
 * is set when samples were missing *before* the reported hit (or before the
 * ray ran out) — the sighted ridge could then be nearer than reported.
 * `sample` is injectable for tests; callers use the app DEM by default.
 */
export async function sightRay({
  lat, lng, azimuth, pitch,
  eyeHeight = 1.7, maxDistance = MAX_SIGHT_M,
  sample = (lo, la) => elevationAt(lo, la),
  onProgress,
} = {}) {
  const base = await sample(lng, lat).catch(() => null)
  if (base == null) return { hit: null, coverage: 0, gapBeforeHit: false, noBase: true }
  const eye = base + eyeHeight
  const tanP = Math.tan(pitch * RAD)

  const steps = []
  for (let d = 50; d <= Math.min(5000, maxDistance); d += 50) steps.push(d)
  for (let d = 5100; d <= Math.min(12000, maxDistance); d += 100) steps.push(d)
  for (let d = 12150; d <= Math.min(40000, maxDistance); d += 150) steps.push(d)
  for (let d = 40250; d <= maxDistance; d += 250) steps.push(d)

  // Above the ray by this much; terrain crosses when it goes non-negative
  const standoff = async (d) => {
    const p = destination(lat, lng, azimuth, d)
    const h = await sample(p.lng, p.lat).catch(() => null)
    return h == null ? null : (h - dropAt(d)) - (eye + d * tanP)
  }

  let read = 0, missed = 0, gapBeforeHit = false
  let prevGood = 0                 // last distance known to be clear
  for (let i = 0; i < steps.length; i++) {
    const d = steps[i]
    const s = await standoff(d)
    onProgress?.((i + 1) / steps.length)
    if (s == null) { missed++; gapBeforeHit = true; continue }
    read++
    if (s >= 0) {
      // Crossed between prevGood and d — bisect down to ~15 m. The point
      // reported is `hi`, the nearest sample *confirmed* at-or-below the ray:
      // at a cliff face the bracket midpoint can sit on open ground just in
      // front of the wall, which would report the wrong ground entirely.
      let lo = prevGood, hi = d
      while (hi - lo > 15) {
        const mid = (lo + hi) / 2
        const sm = await standoff(mid)
        if (sm == null) break                  // a gap inside the bracket: keep the bracket
        if (sm >= 0) hi = mid; else lo = mid
      }
      const p = destination(lat, lng, azimuth, hi)
      const elevation = await sample(p.lng, p.lat).catch(() => null)
      return {
        hit: { lat: p.lat, lng: p.lng, distance: hi, elevation },
        coverage: read / (read + missed),
        gapBeforeHit,
      }
    }
    prevGood = d
  }
  return { hit: null, coverage: read ? read / (read + missed) : 0, gapBeforeHit }
}

/**
 * A sighting with its honest uncertainty: the centre ray plus four more at
 * the stated sensor error bounds. Aiming lower lands nearer, higher lands
 * farther (or clears everything), left/right sweep the bearing — so the four
 * edge hits bound a ground quadrilateral that *is* the error, grazing rays
 * and all.
 *
 * Resolves to { hit, coverage, gapBeforeHit, fan, near, far, openEnded,
 * grazing } — `fan` a closed [lng,lat] ring for the map (null when the centre
 * ray hits nothing), `openEnded` when even maxDistance doesn't stop the
 * high-pitch ray, `grazing` when the pitch error alone stretches the fix by
 * more than half its distance.
 */
export async function sightFix({ azSigma = 3, pitchSigma = 1, ...ray } = {}) {
  const centre = await sightRay(ray)
  if (!centre.hit) return { ...centre, fan: null, openEnded: false, grazing: false }

  const quiet = { ...ray, onProgress: undefined }
  const [nearR, farR, leftR, rightR] = await Promise.all([
    sightRay({ ...quiet, pitch: ray.pitch - pitchSigma }),
    sightRay({ ...quiet, pitch: ray.pitch + pitchSigma }),
    sightRay({ ...quiet, azimuth: ray.azimuth - azSigma }),
    sightRay({ ...quiet, azimuth: ray.azimuth + azSigma }),
  ])

  const d0 = centre.hit.distance
  // A face-on wall can put all three pitch rays at the same range; keep the
  // fan at least a sliver deep so it still draws
  const near = Math.min(nearR.hit?.distance ?? d0, d0 - 20)
  const openEnded = !farR.hit
  const far = Math.max(farR.hit?.distance ?? (ray.maxDistance ?? MAX_SIGHT_M), d0 + 20)

  const { lat, lng, azimuth } = ray
  const corner = (azOff, d) => {
    const p = destination(lat, lng, azimuth + azOff, d)
    return [p.lng, p.lat]
  }
  const fan = [
    corner(-azSigma, near), corner(azSigma, near),
    corner(azSigma, far), corner(-azSigma, far),
    corner(-azSigma, near),
  ]

  return {
    ...centre,
    coverage: Math.min(centre.coverage, nearR.coverage, farR.coverage, leftR.coverage, rightR.coverage),
    sideHits: { left: leftR.hit, right: rightR.hit },
    fan, near, far, openEnded,
    grazing: (far - near) / d0 > 0.5,
  }
}
