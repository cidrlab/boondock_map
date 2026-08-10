/**
 * Regression tests for parseCoords — run with: node boondock/src/shared/parseCoords.test.mjs
 *
 * This file exists because of one bug worth never repeating: a pasted
 * "48.88844, -122.00262" parsed as **+**122.00262, silently relocating a
 * campsite in Washington State to western China, and the coordinate card
 * displayed the wrong number with complete confidence (reported 2026-08-09).
 * A parser that fails loudly is fine; one that quietly mirrors you across the
 * planet is not, so the sign cases are pinned here.
 */

import { parseCoords } from './parseCoords.js'

const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-4

const CASES = [
  // [input, expected lat, expected lng]
  ['48.88844, -122.00262', 48.88844, -122.00262],   // the reported bug
  ['48.88844,-122.00262', 48.88844, -122.00262],    // Google Maps paste, no space
  ['48.41711 -121.81849', 48.41711, -121.81849],    // space separated
  ['  48.41711 , -121.81849  ', 48.41711, -121.81849],
  ['-33.8688, 151.2093', -33.8688, 151.2093],       // southern + eastern
  ['-33.8688, -70.6693', -33.8688, -70.6693],       // both negative
  ['0, 0', 0, 0],
  ['+48.5, +121.5', 48.5, 121.5],
  ['N48.41711 W121.81849', 48.41711, -121.81849],
  ['48.41711N 121.81849W', 48.41711, -121.81849],
  ['S33.8688 E151.2093', -33.8688, 151.2093],
  // DMS / DDM still work
  ["48°25'01.6\"N 121°49'6.6\"W", 48.417111, -121.818500],
  ['48 25.027N 121 49.109W', 48.417117, -121.818483],
  ["N48°25'01.6\" W121°49'06.6\"", 48.417111, -121.818500],
  ['48° 25.027\' N, 121° 49.109\' W', 48.417117, -121.818483],
  // Signed DMS keeps its hemisphere
  ["-121° 49.109'", null, null],   // single coordinate — not a pair
]

const REJECT = ['', 'ab', 'hello world', '91.5, 10', '10, 181', 'Seattle, WA']

let pass = 0, fail = 0
for (const [input, lat, lng] of CASES) {
  const got = parseCoords(input)
  const ok = lat === null ? got === null : (got && near(got.lat, lat) && near(got.lng, lng))
  if (ok) pass++
  else { fail++; console.log(`FAIL  ${JSON.stringify(input)} → ${JSON.stringify(got)}, expected ${lat}, ${lng}`) }
}
for (const input of REJECT) {
  const got = parseCoords(input)
  if (got === null) pass++
  else { fail++; console.log(`FAIL  ${JSON.stringify(input)} should be rejected, got ${JSON.stringify(got)}`) }
}

console.log(`${pass}/${pass + fail} passed`)
process.exit(fail ? 1 : 0)
