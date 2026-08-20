/**
 * Verification for sun.js — run with:
 *   TZ=UTC node boondock/src/shared/sun.test.mjs
 *
 * TZ=UTC because the day-boundary logic keys off the device's calendar day,
 * and the third-party cross-check below reports events for the UTC day.
 *
 * An AR overlay that draws the sun in the wrong place is worse than one that
 * refuses to draw it, so the ephemeris is pinned three independent ways:
 *
 *   A. against a second ephemeris written from a different source — the
 *      Astronomical Almanac's low-precision solar formulae, with a different
 *      series for the sun's longitude and a sidereal-time route instead of an
 *      equation of time. A transcription slip in either shows up as drift;
 *      agreement at the arcminute level does not happen by accident.
 *   B. against physical invariants that do not depend on any implementation:
 *      solstice declination, equinox day length, transit azimuth, the
 *      equation-of-time extremes, midnight sun inside the Arctic Circle.
 *   C. against sunrise-sunset.org, a third-party service, for real places on
 *      real dates. Needs network; skipped with a loud note when offline.
 */

import {
  sunPosition, solarCoords, sunTimes, sunTrack, refraction,
  horizonAt, destination, beamIrradiance, panelCosine, solarDay,
} from './sun.js'

const RAD = Math.PI / 180, DEG = 180 / Math.PI
const mod360 = (d) => ((d % 360) + 360) % 360
let failures = 0
const ok = (cond, label, detail = '') => {
  if (!cond) { failures++; console.log(`FAIL  ${label}${detail ? '  — ' + detail : ''}`) }
  else console.log(`ok    ${label}${detail ? '  — ' + detail : ''}`)
}
const near = (a, b, tol) => Math.abs(a - b) <= tol

// ── A. independent ephemeris ────────────────────────────────────────────────
// Astronomical Almanac, "Low precision formulae for the Sun", plus the USNO
// expression for Greenwich mean sidereal time. Deliberately not sharing a line
// of code with sun.js beyond the Julian day.
function almanacSun(date, lat, lng) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0
  const L = mod360(280.460 + 0.9856474 * n)
  const g = mod360(357.528 + 0.9856003 * n) * RAD
  const lam = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * DEG
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * DEG
  const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24
  const lst = gmst * 15 + lng
  const H = (((lst - ra) % 360) + 540) % 360 - 180
  const p = lat * RAD, d = dec * RAD, h = H * RAD
  const alt = Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)) * DEG
  const az = mod360(Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(p) - Math.tan(d) * Math.cos(p)) * DEG + 180)
  return { altitude: alt, azimuth: az, declination: dec }
}

// A fixed pseudo-random walk, so a failure is reproducible
let seed = 20260819
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

let maxAlt = 0, maxAz = 0, maxDec = 0
for (let i = 0; i < 500; i++) {
  const t = new Date(Date.UTC(2020, 0, 1) + rnd() * 12 * 365.25 * 86400000)
  const lat = (rnd() * 150) - 75          // −75..+75, away from the pole
  const lng = (rnd() * 360) - 180
  const a = sunPosition(t, lat, lng)
  const b = almanacSun(t, lat, lng)
  maxDec = Math.max(maxDec, Math.abs(a.declination - b.declination))
  maxAlt = Math.max(maxAlt, Math.abs(a.altitude - b.altitude))
  // Azimuth is ill-conditioned near the zenith, where a hair of altitude error
  // swings it a long way; skip the last few degrees rather than pretend
  if (Math.abs(a.altitude) < 85) {
    let d = Math.abs(a.azimuth - b.azimuth)
    if (d > 180) d = 360 - d
    maxAz = Math.max(maxAz, d)
  }
}
ok(maxDec < 0.02, 'declination matches the almanac series', `max Δ ${maxDec.toFixed(4)}°`)
ok(maxAlt < 0.05, 'altitude matches the almanac series', `max Δ ${maxAlt.toFixed(4)}°`)
ok(maxAz < 0.10, 'azimuth matches the almanac series', `max Δ ${maxAz.toFixed(4)}°`)

// ── B. physical invariants ──────────────────────────────────────────────────

// Solstice declination is the obliquity of the ecliptic, ±23.44°
const junDec = Math.max(...Array.from({ length: 48 }, (_, i) =>
  solarCoords(new Date(Date.UTC(2026, 5, 20, i))).declination))
const decDec = Math.min(...Array.from({ length: 48 }, (_, i) =>
  solarCoords(new Date(Date.UTC(2026, 11, 20, i))).declination))
ok(near(junDec, 23.44, 0.03), 'June solstice declination is +23.44°', `${junDec.toFixed(3)}°`)
ok(near(decDec, -23.44, 0.03), 'December solstice declination is −23.44°', `${decDec.toFixed(3)}°`)

// Equinox: declination passes through zero within a few hours of the almanac
// date, and the day is a touch over 12 h everywhere (refraction and the sun's
// own radius buy a few minutes at each end)
for (const [label, lat] of [['equator', 0], ['Seattle', 47.6], ['Ushuaia', -54.8]]) {
  const tm = sunTimes(new Date(Date.UTC(2026, 2, 20, 12)), lat, 0)
  const h = tm.dayMinutes / 60
  ok(h > 12.0 && h < 12.35, `equinox day length just over 12 h at ${label}`, `${h.toFixed(3)} h`)
}

// Transit: due south from the northern mid-latitudes, due north from the
// southern ones, and the noon altitude is 90° − |latitude − declination|
for (const [label, lat, lng, expectAz] of [
  ['Seattle', 47.6, -122.3, 180], ['Sydney', -33.9, 151.2, 0], ['Anchorage', 61.2, -149.9, 180],
]) {
  const tm = sunTimes(new Date(Date.UTC(2026, 7, 19, 12)), lat, lng)
  const p = sunPosition(new Date(tm.solarNoon), lat, lng)
  const azErr = Math.min(mod360(p.azimuth - expectAz), mod360(expectAz - p.azimuth))
  ok(azErr < 0.2, `transit is due ${expectAz === 180 ? 'south' : 'north'} at ${label}`, `az ${p.azimuth.toFixed(2)}°`)
  const geom = 90 - Math.abs(lat - p.declination)
  ok(near(tm.noonAltitude, geom, 0.05), `noon altitude = 90 − |lat − dec| at ${label}`,
    `${tm.noonAltitude.toFixed(3)}° vs ${geom.toFixed(3)}°`)
}

// Equation of time: two maxima and two minima a year, the big ones being
// about −14 min in February and +16 min in early November
let eqMin = { v: 99 }, eqMax = { v: -99 }
for (let d = 0; d < 365; d++) {
  const t = new Date(Date.UTC(2026, 0, 1, 12) + d * 86400000)
  const v = solarCoords(t).eqTime
  if (v < eqMin.v) eqMin = { v, t }
  if (v > eqMax.v) eqMax = { v, t }
}
ok(eqMin.v > -15 && eqMin.v < -13.5 && eqMin.t.getUTCMonth() === 1,
  'equation of time bottoms near −14 min in February',
  `${eqMin.v.toFixed(2)} min on ${eqMin.t.toISOString().slice(0, 10)}`)
ok(eqMax.v > 16 && eqMax.v < 17 && eqMax.t.getUTCMonth() === 10,
  'equation of time peaks near +16 min in early November',
  `${eqMax.v.toFixed(2)} min on ${eqMax.t.toISOString().slice(0, 10)}`)

// Midnight sun and polar night, reported as such rather than as a missing time
const utqiagvikJun = sunTimes(new Date(Date.UTC(2026, 5, 21, 12)), 71.29, -156.79)
const utqiagvikDec = sunTimes(new Date(Date.UTC(2026, 11, 21, 12)), 71.29, -156.79)
ok(utqiagvikJun.polar === 'above' && utqiagvikJun.dayMinutes === 1440,
  'midnight sun at Utqiagvik in June', `polar=${utqiagvikJun.polar}`)
ok(utqiagvikDec.polar === 'below' && utqiagvikDec.dayMinutes === 0,
  'polar night at Utqiagvik in December', `polar=${utqiagvikDec.polar}`)

// Equinox sunrise is due east and sunset due west, anywhere
const eq = sunTimes(new Date(Date.UTC(2026, 2, 20, 12)), 40, -105)
const eqRise = sunPosition(new Date(eq.sunrise), 40, -105).azimuth
const eqSet = sunPosition(new Date(eq.sunset), 40, -105).azimuth
ok(near(eqRise, 90, 1.5), 'equinox sunrise is due east', `${eqRise.toFixed(2)}°`)
ok(near(eqSet, 270, 1.5), 'equinox sunset is due west', `${eqSet.toFixed(2)}°`)

// Refraction: nothing overhead, about half a degree at the horizon
ok(refraction(90) === 0, 'no refraction at the zenith')
ok(near(refraction(-0.575), 0.575, 0.05), 'about 34′ of refraction at the apparent horizon',
  `${(refraction(-0.575) * 60).toFixed(1)}′`)

// Sunrise and sunset straddle the transit, near-symmetrically
const sym = sunTimes(new Date(Date.UTC(2026, 7, 19, 12)), 47.6, -122.3)
const skew = Math.abs((sym.sunrise + sym.sunset) / 2 - sym.solarNoon) / 60000
ok(skew < 2, 'the transit sits at the midpoint of sunrise and sunset', `${skew.toFixed(2)} min off`)

// Twilights nest in the right order
const nest = [sym.astronomicalDawn, sym.nauticalDawn, sym.civilDawn, sym.sunrise,
  sym.solarNoon, sym.sunset, sym.civilDusk, sym.nauticalDusk, sym.astronomicalDusk]
ok(nest.every((v, i) => i === 0 || v > nest[i - 1]), 'twilights nest in order')

// ── geometry helpers ────────────────────────────────────────────────────────
const dest = destination(47.6, -122.3, 90, 1000)
ok(near(dest.lat, 47.6, 1e-4) && dest.lng > -122.3, 'due-east destination stays on its parallel',
  `${dest.lat.toFixed(5)}, ${dest.lng.toFixed(5)}`)
const prof = { azimuthStep: 90, angles: [10, 0, 0, 0], azimuths: [0, 90, 180, 270] }
ok(near(horizonAt(prof, 0), 10, 1e-9) && near(horizonAt(prof, 45), 5, 1e-9),
  'horizon interpolates between rays')
ok(beamIrradiance(-1) === 0 && beamIrradiance(90) > beamIrradiance(20),
  'beam irradiance is zero below the horizon and strongest overhead')
ok(near(panelCosine(180, 40, 50, 180), 1, 1e-9),
  'a panel square to the sun sees a cosine of 1')

// A ridge to the east delays first light and costs part of the day
const ridge = { azimuthStep: 10, azimuths: Array.from({ length: 36 }, (_, i) => i * 10),
  angles: Array.from({ length: 36 }, (_, i) => (i * 10 >= 45 && i * 10 <= 135 ? 20 : 0)) }
const open = sunTimes(new Date(Date.UTC(2026, 7, 19, 12)), 47.6, -122.3)
const walled = sunTimes(new Date(Date.UTC(2026, 7, 19, 12)), 47.6, -122.3, { horizon: ridge })
ok(walled.terrainRise > open.sunrise, 'a 20° ridge to the east pushes first light later',
  `${new Date(open.sunrise).toISOString().slice(11, 16)}Z → ${new Date(walled.terrainRise).toISOString().slice(11, 16)}Z`)
ok(walled.terrainMinutes < open.dayMinutes, 'and shortens the sunlit day',
  `${walled.terrainMinutes} min vs ${Math.round(open.dayMinutes)} min`)
const shaded = solarDay(new Date(Date.UTC(2026, 7, 19, 12)), 47.6, -122.3, { horizon: ridge })
ok(shaded.shadedPct > 0 && shaded.best.tilt >= 0 && shaded.best.tilt <= 90,
  'the ridge costs measurable collection and the panel aim stays in range',
  `${shaded.shadedPct}% lost, best ${shaded.best.tilt}° toward ${Math.round(shaded.best.face)}°`)

// ── C. third-party cross-check ──────────────────────────────────────────────
// MET Norway's sunrise API and the US Naval Observatory's rise/set/transit
// service, both authoritative and independently implemented. Needs network;
// skipped with a loud note when offline.
//
// Worth recording, because the first pass through this section reported a
// false failure: **sunrise-sunset.org disagrees with both of them** by 1–3
// minutes on rise and set while matching to the second on the twilights and
// the transit. Measured against this file's ephemeris, its rise/set land at a
// geometric altitude of about −1.08° rather than the standard −0.833°, so it
// is using a deeper horizon, not a different sun. It is not used here.
const PLACES = [
  ['Seattle', 47.6062, -122.3321, '2026-08-19'],
  ['Tucson', 32.2226, -110.9747, '2026-12-21'],
  ['Sydney', -33.8688, 151.2093, '2026-06-21'],
  ['Reykjavik', 64.1466, -21.9426, '2026-03-20'],
]
const UA = { 'User-Agent': 'boondock-map/0.1 verification (timthomas@berkeley.edu)' }
const hhmm = (ms) => new Date(ms).toISOString().slice(11, 16)
const minutesApart = (a, b) => Math.abs(a - b) / 60000

try {
  if (new Date().getTimezoneOffset() !== 0) throw new Error('run with TZ=UTC for the service comparison')
  for (const [name, lat, lng, date] of PLACES) {
    const mine = sunTimes(new Date(`${date}T12:00:00Z`), lat, lng)

    // MET Norway — same solar-day convention as sunTimes, and it reports the
    // rise/set azimuths and the transit altitude, so the geometry gets checked
    // and not just the clock.
    const met = await (await fetch(
      `https://api.met.no/weatherapi/sunrise/3.0/sun?lat=${lat}&lon=${lng}&date=${date}&offset=+00:00`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json()
    const mp = met.properties
    // MET truncates to the minute, so anything under 1.2 min is agreement
    for (const [key, theirs] of [['sunrise', mp.sunrise?.time], ['sunset', mp.sunset?.time], ['solarNoon', mp.solarnoon?.time]]) {
      if (!theirs) continue
      const d = minutesApart(mine[key], Date.parse(theirs))
      ok(d < 1.2, `${name} ${date} ${key} matches MET Norway`, `${hhmm(mine[key])} vs ${theirs.slice(11, 16)}`)
    }
    for (const [key, theirs] of [['sunrise', mp.sunrise?.azimuth], ['sunset', mp.sunset?.azimuth]]) {
      if (theirs == null || mine[key] == null) continue
      const az = sunPosition(new Date(mine[key]), lat, lng).azimuth
      ok(Math.abs(az - theirs) < 0.5, `${name} ${date} ${key} azimuth matches MET Norway`,
        `${az.toFixed(2)}° vs ${theirs}°`)
    }
    if (mp.solarnoon?.disc_centre_elevation != null) {
      ok(Math.abs(mine.noonAltitude - mp.solarnoon.disc_centre_elevation) < 0.02,
        `${name} ${date} transit altitude matches MET Norway`,
        `${mine.noonAltitude.toFixed(3)}° vs ${mp.solarnoon.disc_centre_elevation}°`)
    }

    // USNO lists whatever falls inside a UTC day, so each event is looked up
    // in the UTC day it actually lands in — the trap that made the Seattle
    // sunset look 2 minutes off until it turned out to be the *previous*
    // evening's sunset being compared.
    for (const [key, phen] of [['sunrise', 'Rise'], ['sunset', 'Set'], ['solarNoon', 'Upper Transit']]) {
      if (mine[key] == null) continue
      const day = new Date(mine[key]).toISOString().slice(0, 10)
      const usno = await (await fetch(
        `https://aa.usno.navy.mil/api/rstt/oneday?date=${day}&coords=${lat},${lng}&tz=0`,
        { headers: UA, signal: AbortSignal.timeout(20000) })).json()
      const hits = (usno.properties?.data?.sundata || []).filter(e => e.phen === phen)
      if (!hits.length) { console.log(`SKIP  ${name} ${key} — USNO lists no ${phen} on ${day}`); continue }
      const best = hits.map(e => Date.parse(`${day}T${e.time}:00Z`))
        .reduce((a, b) => (minutesApart(mine[key], b) < minutesApart(mine[key], a) ? b : a))
      const d = minutesApart(mine[key], best)
      ok(d < 1.2, `${name} ${date} ${key} matches USNO`, `${hhmm(mine[key])} vs ${hhmm(best)}`)
    }
  }
} catch (e) {
  console.log(`SKIP  third-party cross-check — ${e.message}`)
}

console.log(failures === 0 ? '\nAll sun.js checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
