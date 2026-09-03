/**
 * geomag — magnetic declination from the World Magnetic Model, so a compass
 * reading (magnetic north) can be corrected to a map bearing (true north)
 * without asking any service. The gap runs 8–16°E across the western states,
 * which at 3 km is 400–900 m sideways — far too much to ignore when a
 * sighting is turned into a point on the map (VISION row 139).
 *
 * The coefficients below are the official WMM2025 release, embedded verbatim
 * as published (NOAA/NCEI and the British Geological Survey, public domain):
 *   https://www.ncei.noaa.gov/products/world-magnetic-model
 *   file WMM.COF from WMM2025COF.zip, dated 11/13/2024, valid 2025.0–2030.0
 *
 * The synthesis is the standard spherical-harmonic evaluation from the WMM
 * documentation: geodetic position → geocentric spherical, Schmidt
 * semi-normalised associated Legendre functions to degree 12, secular
 * variation applied linearly from the 2025.0 epoch, then the field vector
 * rotated back into the geodetic frame. `geomag.test.mjs` pins every number
 * against the official WMM2025 test values published alongside the model.
 *
 * The Legendre derivative is taken numerically (central difference on the
 * geocentric latitude) rather than by a second recursion: one recursion can
 * be checked against the test values, two must be checked against each other,
 * and the difference is far below the model's own stated accuracy.
 */

// WMM.COF, byte-for-byte: epoch line, then n m g h gdot hdot, then terminator.
const WMM_COF = `    2025.0            WMM-2025     11/13/2024
  1  0  -29351.8       0.0       12.0        0.0
  1  1   -1410.8    4545.4        9.7      -21.5
  2  0   -2556.6       0.0      -11.6        0.0
  2  1    2951.1   -3133.6       -5.2      -27.7
  2  2    1649.3    -815.1       -8.0      -12.1
  3  0    1361.0       0.0       -1.3        0.0
  3  1   -2404.1     -56.6       -4.2        4.0
  3  2    1243.8     237.5        0.4       -0.3
  3  3     453.6    -549.5      -15.6       -4.1
  4  0     895.0       0.0       -1.6        0.0
  4  1     799.5     278.6       -2.4       -1.1
  4  2      55.7    -133.9       -6.0        4.1
  4  3    -281.1     212.0        5.6        1.6
  4  4      12.1    -375.6       -7.0       -4.4
  5  0    -233.2       0.0        0.6        0.0
  5  1     368.9      45.4        1.4       -0.5
  5  2     187.2     220.2        0.0        2.2
  5  3    -138.7    -122.9        0.6        0.4
  5  4    -142.0      43.0        2.2        1.7
  5  5      20.9     106.1        0.9        1.9
  6  0      64.4       0.0       -0.2        0.0
  6  1      63.8     -18.4       -0.4        0.3
  6  2      76.9      16.8        0.9       -1.6
  6  3    -115.7      48.8        1.2       -0.4
  6  4     -40.9     -59.8       -0.9        0.9
  6  5      14.9      10.9        0.3        0.7
  6  6     -60.7      72.7        0.9        0.9
  7  0      79.5       0.0       -0.0        0.0
  7  1     -77.0     -48.9       -0.1        0.6
  7  2      -8.8     -14.4       -0.1        0.5
  7  3      59.3      -1.0        0.5       -0.8
  7  4      15.8      23.4       -0.1        0.0
  7  5       2.5      -7.4       -0.8       -1.0
  7  6     -11.1     -25.1       -0.8        0.6
  7  7      14.2      -2.3        0.8       -0.2
  8  0      23.2       0.0       -0.1        0.0
  8  1      10.8       7.1        0.2       -0.2
  8  2     -17.5     -12.6        0.0        0.5
  8  3       2.0      11.4        0.5       -0.4
  8  4     -21.7      -9.7       -0.1        0.4
  8  5      16.9      12.7        0.3       -0.5
  8  6      15.0       0.7        0.2       -0.6
  8  7     -16.8      -5.2       -0.0        0.3
  8  8       0.9       3.9        0.2        0.2
  9  0       4.6       0.0       -0.0        0.0
  9  1       7.8     -24.8       -0.1       -0.3
  9  2       3.0      12.2        0.1        0.3
  9  3      -0.2       8.3        0.3       -0.3
  9  4      -2.5      -3.3       -0.3        0.3
  9  5     -13.1      -5.2        0.0        0.2
  9  6       2.4       7.2        0.3       -0.1
  9  7       8.6      -0.6       -0.1       -0.2
  9  8      -8.7       0.8        0.1        0.4
  9  9     -12.9      10.0       -0.1        0.1
 10  0      -1.3       0.0        0.1        0.0
 10  1      -6.4       3.3        0.0        0.0
 10  2       0.2       0.0        0.1       -0.0
 10  3       2.0       2.4        0.1       -0.2
 10  4      -1.0       5.3       -0.0        0.1
 10  5      -0.6      -9.1       -0.3       -0.1
 10  6      -0.9       0.4        0.0        0.1
 10  7       1.5      -4.2       -0.1        0.0
 10  8       0.9      -3.8       -0.1       -0.1
 10  9      -2.7       0.9       -0.0        0.2
 10 10      -3.9      -9.1       -0.0       -0.0
 11  0       2.9       0.0        0.0        0.0
 11  1      -1.5       0.0       -0.0       -0.0
 11  2      -2.5       2.9        0.0        0.1
 11  3       2.4      -0.6        0.0       -0.0
 11  4      -0.6       0.2        0.0        0.1
 11  5      -0.1       0.5       -0.1       -0.0
 11  6      -0.6      -0.3        0.0       -0.0
 11  7      -0.1      -1.2       -0.0        0.1
 11  8       1.1      -1.7       -0.1       -0.0
 11  9      -1.0      -2.9       -0.1        0.0
 11 10      -0.2      -1.8       -0.1        0.0
 11 11       2.6      -2.3       -0.1        0.0
 12  0      -2.0       0.0        0.0        0.0
 12  1      -0.2      -1.3        0.0       -0.0
 12  2       0.3       0.7       -0.0        0.0
 12  3       1.2       1.0       -0.0       -0.1
 12  4      -1.3      -1.4       -0.0        0.1
 12  5       0.6      -0.0       -0.0       -0.0
 12  6       0.6       0.6        0.1       -0.0
 12  7       0.5      -0.1       -0.0       -0.0
 12  8      -0.1       0.8        0.0        0.0
 12  9      -0.4       0.1        0.0       -0.0
 12 10      -0.2      -1.0       -0.1       -0.0
 12 11      -1.3       0.1       -0.0        0.0
 12 12      -0.7       0.2       -0.1       -0.1
999999999999999999999999999999999999999999999999
999999999999999999999999999999999999999999999999`

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const N_MAX = 12
const A_REF = 6371.2            // geomagnetic reference radius, km
const WGS84_A = 6378.137        // WGS84 semi-major axis, km
const WGS84_F = 1 / 298.257223563

// Parse once at import: epoch, then g/h and their annual rates by [n][m]
const model = (() => {
  const lines = WMM_COF.split('\n')
  const epoch = parseFloat(lines[0])
  const g = [], h = [], gDot = [], hDot = []
  for (let n = 0; n <= N_MAX; n++) {
    g.push(new Float64Array(n + 1)); h.push(new Float64Array(n + 1))
    gDot.push(new Float64Array(n + 1)); hDot.push(new Float64Array(n + 1))
  }
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].startsWith('9999')) break     // the spec's terminator
    const [n, m, gv, hv, gd, hd] = lines[i].trim().split(/\s+/).map(Number)
    g[n][m] = gv; h[n][m] = hv; gDot[n][m] = gd; hDot[n][m] = hd
  }
  return { epoch, g, h, gDot, hDot }
})()

export const WMM_EPOCH = model.epoch
export const WMM_VALID_TO = model.epoch + 5

/**
 * Schmidt semi-normalised associated Legendre P̂ₙᵐ(sin φ′) for all n,m to
 * N_MAX, as flat arrays indexed n*(n+1)/2+m. Built from the unnormalised
 * recursions, then scaled by √((2−δₘ₀)(n−m)!/(n+m)!).
 */
function legendre(sinPhi) {
  const cosPhi = Math.sqrt(Math.max(0, 1 - sinPhi * sinPhi))
  const size = (N_MAX + 1) * (N_MAX + 2) / 2
  const P = new Float64Array(size)
  const idx = (n, m) => n * (n + 1) / 2 + m
  P[0] = 1
  for (let m = 1; m <= N_MAX; m++) P[idx(m, m)] = (2 * m - 1) * cosPhi * P[idx(m - 1, m - 1)]
  for (let m = 0; m < N_MAX; m++) P[idx(m + 1, m)] = (2 * m + 1) * sinPhi * P[idx(m, m)]
  for (let n = 2; n <= N_MAX; n++) {
    for (let m = 0; m <= n - 2; m++) {
      P[idx(n, m)] = ((2 * n - 1) * sinPhi * P[idx(n - 1, m)] - (n + m - 1) * P[idx(n - 2, m)]) / (n - m)
    }
  }
  // Schmidt scale, built incrementally to keep the factorials in range
  for (let n = 1; n <= N_MAX; n++) {
    let s = 1
    for (let m = 0; m <= n; m++) {
      if (m > 0) s *= Math.sqrt((m === 1 ? 2 : 1) / ((n - m + 1) * (n + m)))
      P[idx(n, m)] *= s
    }
  }
  return P
}

/** Field components in the *geocentric* frame at spherical (r km, φ′, λ). */
function sphericalField(r, phiP, lambda, g, h) {
  const idx = (n, m) => n * (n + 1) / 2 + m
  const sinP = Math.sin(phiP)
  // dP̂/dφ′ by central difference — see the header note
  const dEps = 1e-6
  const P = legendre(sinP)
  const Pp = legendre(Math.sin(phiP + dEps))
  const Pm = legendre(Math.sin(phiP - dEps))
  const cosP = Math.cos(phiP)

  const cosL = [], sinL = []
  for (let m = 0; m <= N_MAX; m++) { cosL.push(Math.cos(m * lambda)); sinL.push(Math.sin(m * lambda)) }

  let X = 0, Y = 0, Z = 0
  let ar = (A_REF / r) * (A_REF / r)          // (a/r)^(n+2) built up per degree
  for (let n = 1; n <= N_MAX; n++) {
    ar *= A_REF / r
    let xs = 0, ys = 0, zs = 0
    for (let m = 0; m <= n; m++) {
      const gh = g[n][m] * cosL[m] + h[n][m] * sinL[m]
      const i = idx(n, m)
      xs += gh * (Pp[i] - Pm[i]) / (2 * dEps)
      // The 1/cos φ′ blows up at the poles; m·P̂ → 0 there too, and the model
      // is never asked for the exact pole in this app
      if (m > 0) ys += m * (g[n][m] * sinL[m] - h[n][m] * cosL[m]) * P[i] / cosP
      zs += gh * P[i]
    }
    X -= ar * xs                 // X′ = −Σ(a/r)ⁿ⁺² Σ(g cos+h sin)·dP̂/dφ′
    Y += ar * ys
    Z -= ar * (n + 1) * zs
  }
  return { X, Y, Z }
}

/**
 * The magnetic field at a geodetic position and date.
 * Returns nT components in the local geodetic frame (X north, Y east, Z down)
 * plus H, F, inclination and declination in degrees (declination east-positive:
 * true bearing = magnetic bearing + decl). `clamped` is set when the date fell
 * outside the model's 2025.0–2030.0 window and was pinned to its edge.
 */
export function magneticField(lat, lng, date = new Date(), heightKm = 0) {
  const t = decimalYear(date)
  const clamped = t < model.epoch || t > model.epoch + 5
  const dt = Math.min(model.epoch + 5, Math.max(model.epoch, t)) - model.epoch

  const g = [], h = []
  for (let n = 0; n <= N_MAX; n++) {
    g.push(new Float64Array(n + 1)); h.push(new Float64Array(n + 1))
    for (let m = 0; m <= n; m++) {
      g[n][m] = model.g[n][m] + dt * model.gDot[n][m]
      h[n][m] = model.h[n][m] + dt * model.hDot[n][m]
    }
  }

  // Geodetic → geocentric: the WGS84 normal section, then the spherical radius
  const phi = lat * RAD, lambda = lng * RAD
  const e2 = WGS84_F * (2 - WGS84_F)
  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi)
  const Rc = WGS84_A / Math.sqrt(1 - e2 * sinPhi * sinPhi)
  const p = (Rc + heightKm) * cosPhi
  const z = (Rc * (1 - e2) + heightKm) * sinPhi
  const r = Math.hypot(p, z)
  const phiP = Math.asin(z / r)

  const f = sphericalField(r, phiP, lambda, g, h)

  // Rotate the geocentric components into the geodetic frame
  const psi = phiP - phi
  const X = f.X * Math.cos(psi) - f.Z * Math.sin(psi)
  const Z = f.X * Math.sin(psi) + f.Z * Math.cos(psi)
  const Y = f.Y

  const H = Math.hypot(X, Y)
  return {
    X, Y, Z, H,
    F: Math.hypot(H, Z),
    inclination: Math.atan2(Z, H) * DEG,
    declination: Math.atan2(Y, X) * DEG,
    clamped,
  }
}

/** Declination in degrees, east-positive: true = magnetic + declination. */
export function declination(lat, lng, date = new Date(), heightKm = 0) {
  return magneticField(lat, lng, date, heightKm).declination
}

export function decimalYear(date) {
  const y = date.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  const next = Date.UTC(y + 1, 0, 1)
  return y + (date.getTime() - start) / (next - start)
}
