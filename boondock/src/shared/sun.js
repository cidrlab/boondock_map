/**
 * sun — where the sun is now, where it will track across the sky on any day,
 * and what the ridgeline around a camp does to it (VISION row 132).
 *
 * Position comes from the NOAA General Solar Position Calculations, which are
 * Meeus's low-precision solar formulae (Astronomical Algorithms, ch. 25/28).
 * They are good to roughly 0.01°, an order of magnitude better than any phone
 * magnetometer, so in the AR overlay the compass is always the weak link and
 * never the ephemeris.
 *
 * Everything downstream of `sunPosition` is derived numerically: the day is
 * sampled minute by minute and threshold crossings are bisected. That leaves
 * one position function to get right instead of a second set of closed-form
 * sunrise equations to get subtly wrong, and it means a sunrise blocked by a
 * ridge comes out of the same code path as an ordinary one — the threshold is
 * just a function of azimuth instead of a constant.
 *
 * Verified by `sun.test.mjs`: cross-checked against an independent ephemeris
 * (the Astronomical Almanac's low-precision formulae, a different series and
 * a different sidereal-time route) and against the physical invariants —
 * solstice declination, equinox day length, transit azimuth, equation-of-time
 * extremes, midnight sun.
 */

import { elevationAt } from './elevation.js'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const DAY_MS = 86400000
const R_EARTH = 6371008.8      // mean radius, metres

const mod360 = (d) => ((d % 360) + 360) % 360
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Julian day for an instant. 2440587.5 is the Unix epoch expressed in JD. */
export function julianDay(date) { return date.getTime() / DAY_MS + 2440587.5 }

/**
 * Apparent declination and the equation of time for an instant, plus the
 * intermediates worth exposing for tests. Angles in degrees, eqTime in
 * minutes (the amount a sundial runs ahead of the clock).
 */
export function solarCoords(date) {
  const T = (julianDay(date) - 2451545) / 36525          // Julian centuries from J2000
  const L0 = mod360(280.46646 + T * (36000.76983 + T * 0.0003032))   // geometric mean longitude
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T)            // geometric mean anomaly
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T)       // orbital eccentricity
  const C = Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T)
    + Math.sin(3 * M * RAD) * 0.000289                                // equation of centre
  const omega = 125.04 - 1934.136 * T                                 // lunar node, for nutation
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD)   // apparent longitude
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD)                  // corrected obliquity
  const declination = Math.asin(clamp(Math.sin(eps * RAD) * Math.sin(lambda * RAD), -1, 1)) * DEG

  const y = Math.tan(eps / 2 * RAD) ** 2
  const eqTime = 4 * DEG * (
    y * Math.sin(2 * L0 * RAD)
    - 2 * e * Math.sin(M * RAD)
    + 4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD)
    - 0.5 * y * y * Math.sin(4 * L0 * RAD)
    - 1.25 * e * e * Math.sin(2 * M * RAD)
  )
  return { declination, eqTime, apparentLong: mod360(lambda), obliquity: eps, meanAnomaly: mod360(M) }
}

/**
 * Atmospheric refraction in degrees to add to a geometric altitude, from the
 * NOAA calculator's piecewise fit. About 34' at the horizon, nothing at the
 * zenith. Only ever a display correction here — every threshold in this file
 * is stated in geometric altitude the way the standard definitions are.
 */
export function refraction(altDeg) {
  if (altDeg > 85) return 0
  const t = Math.tan(altDeg * RAD)
  let arcsec
  if (altDeg > 5) arcsec = 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5
  else if (altDeg > -0.575) arcsec = 1735 + altDeg * (-518.2 + altDeg * (103.4 + altDeg * (-12.79 + altDeg * 0.711)))
  else arcsec = -20.772 / t
  return arcsec / 3600
}

/**
 * Sun azimuth (degrees clockwise from true north) and altitude (degrees above
 * the true horizon) at an instant. `altitude` is geometric; `apparent` adds
 * refraction and is what you actually see, which is what the AR overlay draws.
 */
export function sunPosition(date, lat, lng) {
  const { declination, eqTime } = solarCoords(date)
  // True solar time in minutes: clock minutes past UTC midnight, corrected by
  // the equation of time and by 4 minutes of longitude per degree east.
  const utcMin = (date.getTime() / 60000) % 1440
  const tst = utcMin + eqTime + 4 * lng
  const ha = ((tst / 4 - 180) % 360 + 540) % 360 - 180   // hour angle, −180..180, 0 at transit

  const latR = lat * RAD, decR = declination * RAD, haR = ha * RAD
  const sinAlt = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR)
  const altitude = Math.asin(clamp(sinAlt, -1, 1)) * DEG
  // atan2 form measures azimuth from due south, positive toward the west; the
  // +180 puts it on the compass. It stays well behaved near the pole and past
  // the zenith, where the cosine form NOAA publishes needs a sign branch.
  const azimuth = mod360(Math.atan2(
    Math.sin(haR),
    Math.cos(haR) * Math.sin(latR) - Math.tan(decR) * Math.cos(latR),
  ) * DEG + 180)

  return { azimuth, altitude, apparent: altitude + refraction(altitude), declination, eqTime, hourAngle: ha }
}

/** Unit vector toward a sky point in the local east/north/up frame. */
export function skyVector(azimuthDeg, altitudeDeg) {
  const a = azimuthDeg * RAD, h = altitudeDeg * RAD
  return [Math.cos(h) * Math.sin(a), Math.cos(h) * Math.cos(a), Math.sin(h)]
}

// ── The day, sampled ────────────────────────────────────────────────────────

/** Local midnight starting the calendar day `date` falls in, device time zone. */
export function localMidnight(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * The sun's track across one local day. One sample per `stepMin`, inclusive of
 * both midnights so a crossing at either end is still bracketed.
 */
export function sunTrack(date, lat, lng, { stepMin = 2, start = null, spanMin = 1440 } = {}) {
  const t0 = start != null ? +start : localMidnight(date).getTime()
  const out = []
  for (let m = 0; m <= spanMin; m += stepMin) {
    const t = t0 + m * 60000
    const p = sunPosition(new Date(t), lat, lng)
    out.push({ t, minutes: m, azimuth: p.azimuth, altitude: p.altitude, apparent: p.apparent })
  }
  return out
}

/**
 * Standard altitude thresholds, in geometric degrees. `horizon` is the usual
 * −0.833°, which is refraction plus the sun's own radius — the moment the
 * upper limb touches a flat sea horizon. Golden and blue hour have no single
 * agreed definition; these are the common ones and the UI states them.
 */
export const ALT = {
  astronomical: -18,
  nautical: -12,
  civil: -6,
  blue: -4,
  horizon: -0.833,
  golden: 6,
}

/**
 * Instants where `valueOf(sample)` crosses zero over the day, refined by
 * bisection to the second. Returns [{t, rising}] in time order.
 */
function crossings(track, lat, lng, valueOf) {
  const found = []
  const at = (t) => {
    const p = sunPosition(new Date(t), lat, lng)
    return valueOf({ t, azimuth: p.azimuth, altitude: p.altitude, apparent: p.apparent })
  }
  for (let i = 1; i < track.length; i++) {
    const a = valueOf(track[i - 1]), b = valueOf(track[i])
    if (a === 0 || (a < 0) === (b < 0)) continue
    let lo = track[i - 1].t, hi = track[i].t
    for (let k = 0; k < 12; k++) {          // 2 min bracket → well under a second
      const mid = (lo + hi) / 2
      if ((at(lo) < 0) === (at(mid) < 0)) lo = mid
      else hi = mid
    }
    found.push({ t: Math.round((lo + hi) / 2), rising: b > a })
  }
  return found
}

/**
 * Sun events for one local day at a point: rise, set, transit, twilights, and
 * — when a horizon profile is supplied — the times the sun actually clears and
 * loses the ridgeline, which at a campsite in a canyon is the only pair of
 * numbers that matters.
 *
 * `polar` is set when the sun never crosses a threshold at all, which is the
 * honest answer above the Arctic and Antarctic circles rather than a missing
 * time rendered as a dash.
 */
export function sunTimes(date, lat, lng, { horizon = null } = {}) {
  // Find the day's transit first, then hang the whole 24 h window off it.
  // Scanning the local calendar day instead would pair a sunrise with the
  // *previous* night's sunset anywhere the clock runs far from solar time —
  // the western edge of a time zone, or anywhere on summer time.
  const coarse = sunTrack(date, lat, lng, { stepMin: 10 })
  const peak = coarse.reduce((m, s) => (s.altitude > m.altitude ? s : m), coarse[0])
  const solarNoon = refineExtreme(peak, lat, lng, 10)
  const noonAltitude = sunPosition(new Date(solarNoon), lat, lng).altitude

  const t = sunTrack(date, lat, lng, { stepMin: 2, start: solarNoon - 12 * 3600000, spanMin: 1440 })
  const low = t.reduce((m, s) => (s.altitude < m.altitude ? s : m), t[0])

  const pair = (thresh) => {
    const cs = crossings(t, lat, lng, (s) => s.altitude - thresh)
    const up = cs.find(c => c.rising), down = [...cs].reverse().find(c => !c.rising)
    if (up || down) return { up: up?.t ?? null, down: down?.t ?? null, polar: null }
    return { up: null, down: null, polar: low.altitude > thresh ? 'above' : 'below' }
  }

  const day = pair(ALT.horizon)
  const civil = pair(ALT.civil)
  const nautical = pair(ALT.nautical)
  const astro = pair(ALT.astronomical)
  const blue = pair(ALT.blue)
  const golden = pair(ALT.golden)

  const out = {
    solarNoon,
    noonAltitude,
    sunrise: day.up, sunset: day.down, polar: day.polar,
    dayMinutes: day.up != null && day.down != null ? (day.down - day.up) / 60000
      : day.polar === 'above' ? 1440 : day.polar === 'below' ? 0 : null,
    civilDawn: civil.up, civilDusk: civil.down,
    nauticalDawn: nautical.up, nauticalDusk: nautical.down,
    astronomicalDawn: astro.up, astronomicalDusk: astro.down,
    // Golden hour runs from the −4° blue-hour boundary up to +6°, morning and
    // evening; blue hour is the −6°..−4° band below it.
    goldenMorning: [blue.up, golden.up],
    goldenEvening: [golden.down, blue.down],
    blueMorning: [civil.up, blue.up],
    blueEvening: [blue.down, civil.down],
  }

  if (horizon) {
    // The ridge threshold moves with azimuth, so the same bisection runs
    // against a function instead of a constant. Apparent altitude here: what
    // clears the ridge is the sun you can see, refraction included. The disc's
    // own 0.27° radius is ignored — first light beats full disc by well under
    // a minute at any realistic ridge angle.
    const cs = crossings(t, lat, lng, (s) => s.apparent - horizonAt(horizon, s.azimuth))
    const up = cs.find(c => c.rising), down = [...cs].reverse().find(c => !c.rising)
    let minutes = 0
    for (let i = 1; i < t.length; i++) {
      const lit = t[i].apparent > horizonAt(horizon, t[i].azimuth)
      if (lit) minutes += (t[i].t - t[i - 1].t) / 60000
    }
    out.terrainRise = up?.t ?? null
    out.terrainSet = down?.t ?? null
    out.terrainMinutes = Math.round(minutes)
  }
  return out
}

/** Golden-section-ish refine of a sampled extreme, to the minute. */
function refineExtreme(peak, lat, lng, spanMin) {
  let lo = peak.t - spanMin * 60000, hi = peak.t + spanMin * 60000
  const alt = (t) => sunPosition(new Date(t), lat, lng).altitude
  for (let k = 0; k < 24; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
    if (alt(m1) < alt(m2)) lo = m1; else hi = m2
  }
  return Math.round((lo + hi) / 2)
}

// ── The ridgeline ───────────────────────────────────────────────────────────

/**
 * Skyline angle by compass direction, read out of the DEM the hillshade
 * already draws. For each azimuth a ray marches outward and keeps the largest
 * elevation angle it sees, which is the horizon in that direction.
 *
 * Distances thicken with range — a 20 km ray sampled every 150 m would be
 * thousands of lookups for detail that only matters in the first kilometre or
 * two, where a nearby bank blocks more sky than a distant peak.
 *
 * Costs DEM tiles, so it is never run on its own: the viewer asks for it.
 */
export async function horizonProfile(lat, lng, { azimuthStep = 5, eyeHeight = 1.5, onProgress } = {}) {
  const base = await elevationAt(lng, lat)
  if (base == null) return null
  const eye = base + eyeHeight

  const ranges = []
  for (let d = 150; d <= 3000; d += 150) ranges.push(d)
  for (let d = 3400; d <= 8000; d += 400) ranges.push(d)
  for (let d = 9000; d <= 20000; d += 1000) ranges.push(d)

  const azimuths = []
  for (let a = 0; a < 360; a += azimuthStep) azimuths.push(a)

  const angles = new Array(azimuths.length).fill(0)
  const peaks = new Array(azimuths.length).fill(null)
  let read = 0, missed = 0
  for (let i = 0; i < azimuths.length; i++) {
    const az = azimuths[i]
    const pts = await Promise.all(ranges.map(d => {
      const p = destination(lat, lng, az, d)
      return elevationAt(p.lng, p.lat).catch(() => null)
    }))
    for (let j = 0; j < pts.length; j++) {
      const h = pts[j]
      // A tile that fails to load silently *lowers* the skyline, which would
      // read as a sunnier site than it is. Count the misses so the view can
      // say the scan is partial instead of quietly under-reporting the ridge.
      if (h == null) { missed++; continue }
      read++
      const d = ranges[j]
      // Curvature drop with the standard 0.13 refraction coefficient: a ridge
      // 20 km out sits about 27 m lower than flat geometry would put it.
      const drop = (1 - 0.13) * d * d / (2 * R_EARTH)
      const ang = Math.atan2(h - eye - drop, d) * DEG
      if (ang > angles[i]) { angles[i] = ang; peaks[i] = { distance: d, elevation: h } }
    }
    onProgress?.((i + 1) / azimuths.length)
  }
  return { lat, lng, base, eyeHeight, azimuthStep, azimuths, angles, peaks, coverage: read / (read + missed) }
}

/** Horizon angle at any azimuth, linearly interpolated between rays. */
export function horizonAt(profile, azimuthDeg) {
  if (!profile) return 0
  const step = profile.azimuthStep
  const x = mod360(azimuthDeg) / step
  const i = Math.floor(x) % profile.angles.length
  const j = (i + 1) % profile.angles.length
  const f = x - Math.floor(x)
  return profile.angles[i] * (1 - f) + profile.angles[j] * f
}

/** Point `metres` away from lat/lng along a compass bearing, on a sphere. */
export function destination(lat, lng, bearingDeg, metres) {
  const d = metres / R_EARTH
  const br = bearingDeg * RAD, p1 = lat * RAD, l1 = lng * RAD
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br))
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2))
  return { lat: p2 * DEG, lng: ((l2 * DEG + 540) % 360) - 180 }
}

// ── Solar collection ────────────────────────────────────────────────────────

/**
 * Clear-sky direct-beam irradiance, normalised to 1.0 outside the atmosphere.
 * Air mass by Kasten & Young (1989); attenuation by the Meinel form
 * 0.7^(AM^0.678), the standard back-of-envelope clear-sky model. It ignores
 * cloud, aerosol, altitude and diffuse light, so treat the numbers it feeds as
 * *relative* — good for comparing two pull-offs or two panel angles on the
 * same day, not for predicting amp-hours.
 */
export function beamIrradiance(altitudeDeg) {
  if (altitudeDeg <= 0) return 0
  const am = 1 / (Math.sin(altitudeDeg * RAD) + 0.50572 * (altitudeDeg + 6.07995) ** -1.6364)
  return 0.7 ** (am ** 0.678)
}

/** Cosine of the angle between the beam and a panel's normal. */
export function panelCosine(sunAz, sunAlt, tiltDeg, faceDeg) {
  const s = skyVector(sunAz, sunAlt)
  const n = skyVector(faceDeg, 90 - tiltDeg)      // a tilt of 0 points straight up
  return s[0] * n[0] + s[1] * n[1] + s[2] * n[2]
}

/**
 * How much of the day's sun a site actually gets, and where to point a panel.
 *
 * Integrates clear-sky beam irradiance over the day for a grid of panel angles
 * and keeps the best, with the ridgeline shading the sun out when it is behind
 * it. `openSky` repeats the sum with no terrain, so `shadedPct` says what the
 * canyon walls cost — the number that decides whether to park here or 100 m up
 * the road.
 */
export function solarDay(date, lat, lng, { horizon = null, stepMin = 5 } = {}) {
  const track = sunTrack(date, lat, lng, { stepMin })
  const lit = track.map(s => ({
    ...s,
    blocked: horizon ? s.apparent <= horizonAt(horizon, s.azimuth) : false,
    beam: beamIrradiance(s.apparent),
  }))
  const hours = stepMin / 60

  let openSky = 0, flat = 0, sunMinutes = 0
  for (const s of lit) {
    if (s.beam <= 0) continue
    openSky += s.beam * Math.sin(s.apparent * RAD) * hours
    if (s.blocked) continue
    sunMinutes += stepMin
    flat += s.beam * Math.sin(s.apparent * RAD) * hours
  }

  const score = (tilt, face, withTerrain = true) => {
    let sum = 0
    for (const s of lit) {
      if (s.beam <= 0 || (withTerrain && s.blocked)) continue
      const c = panelCosine(s.azimuth, s.apparent, tilt, face)
      if (c > 0) sum += s.beam * c * hours
    }
    return sum
  }

  // Coarse sweep then a 1° refine. The optimum is broad and single-peaked, so
  // a local refine off the coarse winner lands on it. Run twice: once against
  // the ridge as it stands, and once as if the site were open, because the
  // number that decides where to park is what the terrain costs a panel that
  // was aimed as well as it could be in either case.
  const sweep = (withTerrain) => {
    let best = { tilt: 0, face: lat >= 0 ? 180 : 0, energy: -1 }
    for (let tilt = 0; tilt <= 90; tilt += 5) {
      for (let face = 0; face < 360; face += 10) {
        const energy = score(tilt, face, withTerrain)
        if (energy > best.energy) best = { tilt, face, energy }
        if (tilt === 0) break      // a flat panel faces nowhere
      }
    }
    for (let tilt = Math.max(0, best.tilt - 5); tilt <= Math.min(90, best.tilt + 5); tilt += 1) {
      for (let face = best.face - 10; face <= best.face + 10; face += 2) {
        const energy = score(tilt, mod360(face), withTerrain)
        if (energy > best.energy) best = { tilt, face: mod360(face), energy }
      }
    }
    return best
  }
  const best = sweep(true)
  const openBest = horizon ? sweep(false) : best

  return {
    sunMinutes,
    openSkyMinutes: Math.round(lit.filter(s => s.beam > 0).length * stepMin),
    // What the ridge costs a well-aimed panel against an open site — the
    // comparison a boondocker is actually making between two pull-offs.
    shadedPct: openBest.energy > 0 ? Math.round(100 * (1 - best.energy / openBest.energy)) : null,
    // And on a horizontal surface, which is the roof most rigs already have
    flatShadedPct: openSky > 0 ? Math.round(100 * (1 - flat / openSky)) : null,
    flat,
    best,
    openBest,
    // What tilting buys over a panel lying flat on the roof, today, here.
    gainPct: flat > 0 ? Math.round(100 * (best.energy / flat - 1)) : null,
  }
}
