/**
 * Verification for attitudeBasis — run with:
 *   node boondock/src/shared/attitude.test.mjs
 *
 * The AR overlay's whole claim is that the sun it draws is where the sun is.
 * That rests on one 3×3 rotation, and a sign error in it fails quietly: the
 * overlay still looks plausible, just points at the wrong ridge. The device
 * poses below are the ones that can be reasoned about without a phone in hand,
 * so they are pinned here; what they cannot settle — whether iOS reports its
 * fused compass the same way in an upright pose as in a flat one — is left to
 * on-device confirmation and to the overlay's own drag-to-align.
 */

import { attitudeBasis } from './useDeviceHeading.js'

let failures = 0
const ok = (cond, label, detail = '') => {
  if (!cond) { failures++; console.log(`FAIL  ${label}${detail ? '  — ' + detail : ''}`) }
  else console.log(`ok    ${label}${detail ? '  — ' + detail : ''}`)
}
const vnear = (v, w, tol = 1e-9) => v.every((x, i) => Math.abs(x - w[i]) <= tol)
const fmt = (v) => `[${v.map(x => x.toFixed(3)).join(', ')}]`
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

// Axes are east, north, up
const E = [1, 0, 0], N = [0, 1, 0], U = [0, 0, 1]
const W = [-1, 0, 0], S = [0, -1, 0], D = [0, 0, -1]

// Flat on the table, top edge north: the camera stares at the table
let b = attitudeBasis(0, 0, 0, 0)
ok(vnear(b.right, E) && vnear(b.up, N) && vnear(b.forward, D),
  'flat, facing north: screen axes are east/north, camera points down', fmt(b.forward))

// Held upright, top edge to the sky, back of the phone facing north
b = attitudeBasis(0, 90, 0, 0)
ok(vnear(b.right, E) && vnear(b.up, U) && vnear(b.forward, N),
  'upright: screen up is the zenith and the camera looks north', fmt(b.forward))

// Same pose, turned a quarter turn: alpha runs anticlockwise, so the camera
// swings to the west
b = attitudeBasis(90, 90, 0, 0)
ok(vnear(b.forward, W, 1e-9), 'upright at alpha 90: the camera looks west', fmt(b.forward))
b = attitudeBasis(270, 90, 0, 0)
ok(vnear(b.forward, E, 1e-9), 'upright at alpha 270: the camera looks east', fmt(b.forward))

// Lying on its back, tipped past vertical: the camera looks at the sky
b = attitudeBasis(0, 180, 0, 0)
ok(vnear(b.forward, U, 1e-9), 'screen face down: the camera looks at the zenith', fmt(b.forward))

// Screen rotation rolls the frame around the glass without moving the camera
b = attitudeBasis(0, 0, 0, 90)
ok(vnear(b.right, S) && vnear(b.up, E) && vnear(b.forward, D),
  'landscape at 90°: screen up points east, the camera still looks down',
  `${fmt(b.right)} ${fmt(b.up)}`)

// Gamma turns the phone about its *own* y axis — the screen's long axis —
// not about the line of sight, because the spec composes the angles Z-X'-Y''
// and gamma is applied first. Standing the flat phone up on its left edge
// therefore swings the camera from the table to the west, and doing the same
// to an already-upright phone yaws it the same quarter turn. Both cases would
// come out differently under a Z-Y'-X'' reading, which is the mistake this
// pins against.
b = attitudeBasis(0, 0, 90, 0)
ok(vnear(b.forward, W, 1e-9), 'flat, rolled onto its edge: the camera looks west', fmt(b.forward))
b = attitudeBasis(0, 90, 90, 0)
ok(vnear(b.forward, W, 1e-9), 'upright, gamma 90: the camera swings west', fmt(b.forward))

// Orthonormality over the whole range, including the tilt-flip region
let worst = 0
for (let a = 0; a < 360; a += 37) {
  for (let bb = -180; bb <= 180; bb += 31) {
    for (let g = -90; g <= 90; g += 23) {
      for (const t of [0, 90, 180, 270]) {
        const m = attitudeBasis(a, bb, g, t)
        const lens = [m.right, m.up, m.forward].map(v => Math.abs(Math.hypot(...v) - 1))
        const orth = [Math.abs(dot(m.right, m.up)), Math.abs(dot(m.right, m.forward)), Math.abs(dot(m.up, m.forward))]
        // right × up = −forward: the camera looks out of the *back* of a
        // right-handed screen frame, which is what makes the projection's
        // depth sign work out
        const hand = cross(m.right, m.up).map((v, i) => Math.abs(v + m.forward[i]))
        worst = Math.max(worst, ...lens, ...orth, ...hand)
      }
    }
  }
}
ok(worst < 1e-12, 'the basis stays orthonormal and right-handed everywhere', `worst deviation ${worst.toExponential(1)}`)

console.log(failures === 0 ? '\nAll attitude checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
