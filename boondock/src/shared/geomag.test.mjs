/**
 * Verification for geomag.js — run with:
 *   node boondock/src/shared/geomag.test.mjs
 *
 * The rows below are the official WMM2025 test values published with the
 * model (WMM2025_TEST_VALUES.txt, https://www.ncei.noaa.gov/products/
 * world-magnetic-model, fetched 2026-09-03), embedded so the check runs
 * offline. They cover both epochs the secular terms matter for (2025.0 and
 * 2027.5 — today's dates fall between them), two heights, and latitudes
 * 80/0/−80. Values are printed to 0.1 nT and 0.01°, so agreement is asserted
 * at that precision: an implementation slip in the Legendre normalisation,
 * a sign, or the geodetic rotation moves these numbers by far more.
 *
 * Columns: date heightKm lat lng → X Y Z H F incl decl (nT, nT, …, deg).
 */

import { magneticField, declination, decimalYear } from './geomag.js'

let failures = 0
const check = (name, got, want, tol) => {
  if (Math.abs(got - want) <= tol) return
  failures++
  console.error(`FAIL ${name}: got ${got}, want ${want} ±${tol}`)
}

const ROWS = [
  // date     h     lat    lng        X         Y         Z         H         F      incl   decl
  [2025.0,   0.0,  80.0,   0.0,   6521.6,    145.9,  54791.5,   6523.2,  55178.5,  83.21,  1.28],
  [2025.0,   0.0,   0.0, 120.0,  39677.8,   -109.6, -10580.2,  39677.9,  41064.3, -14.93, -0.16],
  [2025.0,   0.0, -80.0, 240.0,   6117.5,  15751.9, -52022.5,  16898.1,  54698.2, -72.00,  68.78],
  [2025.0, 100.0,  80.0,   0.0,   6216.0,     92.4,  52598.8,   6216.7,  52964.9,  83.26,  0.85],
  [2025.0, 100.0,   0.0, 120.0,  37688.6,    -96.2, -10152.1,  37688.7,  39032.1, -15.08, -0.15],
  [2025.0, 100.0, -80.0, 240.0,   5907.6,  14780.3, -49540.7,  15917.1,  52035.0, -72.19,  68.21],
  [2027.5,   0.0,  80.0,   0.0,   6500.8,    294.5,  54869.4,   6507.5,  55253.9,  83.24,  2.59],
  [2027.5,   0.0,   0.0, 120.0,  39701.6,   -167.4, -10381.8,  39702.0,  41036.9, -14.65, -0.24],
  [2027.5,   0.0, -80.0, 240.0,   6200.7,  15730.3, -51783.7,  16908.3,  54474.2, -71.92,  68.49],
  [2027.5, 100.0,  80.0,   0.0,   6196.7,    233.8,  52670.5,   6201.1,  53034.3,  83.29,  2.16],
  [2027.5, 100.0,   0.0, 120.0,  37711.5,   -148.7,  -9969.8,  37711.8,  39007.4, -14.81, -0.23],
  [2027.5, 100.0, -80.0, 240.0,   5984.0,  14760.1, -49317.7,  15927.0,  51825.7, -72.10,  67.93],
]

// A date whose decimalYear lands exactly on the test epoch
const dateFor = (year) => {
  const y = Math.floor(year)
  const start = Date.UTC(y, 0, 1)
  return new Date(start + (year - y) * (Date.UTC(y + 1, 0, 1) - start))
}

for (const [yr, h, lat, lng, X, Y, Z, H, F, incl, decl] of ROWS) {
  const d = dateFor(yr)
  check(`decimalYear(${yr})`, decimalYear(d), yr, 1e-9)
  const f = magneticField(lat, lng, d, h)
  const tag = `${yr} h${h} (${lat},${lng})`
  check(`${tag} X`, f.X, X, 0.1)
  check(`${tag} Y`, f.Y, Y, 0.1)
  check(`${tag} Z`, f.Z, Z, 0.1)
  check(`${tag} H`, f.H, H, 0.1)
  check(`${tag} F`, f.F, F, 0.1)
  check(`${tag} incl`, f.inclination, incl, 0.01)
  check(`${tag} decl`, f.declination, decl, 0.01)
  if (f.clamped) { failures++; console.error(`FAIL ${tag}: clamped inside the validity window`) }
}

// The convenience wrapper returns the same declination as the full field
{
  const d = dateFor(2027.5)
  check('declination() wrapper', declination(-80, 240, d), magneticField(-80, 240, d).declination, 0)
}

// Dates outside 2025.0–2030.0 pin to the window edge and say so
{
  const past = magneticField(45, -120, new Date(Date.UTC(2020, 5, 1)))
  const edge = magneticField(45, -120, dateFor(2025.0))
  if (!past.clamped) { failures++; console.error('FAIL clamp: 2020 date not flagged') }
  check('clamp pins to epoch', past.declination, edge.declination, 1e-9)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log(`geomag.js agrees with all ${ROWS.length} official WMM2025 test rows (X Y Z H F to 0.1 nT, angles to 0.01°)`)
