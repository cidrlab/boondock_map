/**
 * elevation — point elevation lookups from the same Mapzen terrarium DEM
 * tiles the hillshade renders, so hover readouts reuse the browser's tile
 * cache instead of hitting a new service. Tiles decode once onto a small
 * canvas and are kept in a tiny LRU.
 */

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const Z = 11            // ~40 m/px at this latitude — plenty for a readout
// Raised from 24 for the elevation-band grid (VISION row 120): a viewport
// lattice can touch a couple of dozen tiles at once, and evicting them
// mid-build would refetch the same PNGs on every pan.
const MAX_TILES = 64
const cache = new Map() // 'z/x/y' → ImageData | Promise<ImageData>

function tileData(z, x, y) {
  const key = `${z}/${x}/${y}`
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  const p = new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, 256, 256)
      if (cache.size > MAX_TILES) cache.delete(cache.keys().next().value)
      cache.set(key, data)
      resolve(data)
    }
    img.onerror = reject
    img.src = TILE_URL(z, x, y)
  })
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  return p
}

const M_TO_FT = 3.28084
const decode = (d, i) => d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768

// Cell sizes in degrees, coarse first — the same ladder idea the temperature
// grid uses, so a continent-wide view samples coarsely and a valley finely.
const CELL_LADDER = [0.02, 0.05, 0.1, 0.25, 0.5, 1]
const MAX_NODES = 4800

/**
 * Elevation sampled on a lat/lng lattice over `bounds`, in feet (VISION row
 * 120). Shaped to match the temperature grid so `gridToGeoJSON` can contour
 * it with the marching squares already written for that.
 *
 * Reads the same terrarium tiles the hillshade draws, so it mostly hits the
 * browser cache and costs no new service. The DEM zoom is chosen from the
 * cell size — sampling a 0.5° lattice from z11 tiles would download hundreds
 * of PNGs to read one pixel each.
 */
export async function fetchElevGrid(bounds) {
  const west = Math.max(-179.9, bounds.west)
  const east = Math.min(179.9, Math.max(bounds.east, west + 0.01))
  const south = Math.max(-80, bounds.south)
  const north = Math.min(80, Math.max(bounds.north, south + 0.01))

  let cell = CELL_LADDER[CELL_LADDER.length - 1]
  for (const c of CELL_LADDER) {
    const cols = Math.floor(east / c) - Math.floor(west / c) + 4
    const rows = Math.floor(north / c) - Math.floor(south / c) + 4
    if (cols * rows <= MAX_NODES) { cell = c; break }
  }
  const x0 = Math.floor(west / cell) - 1
  const y0 = Math.floor(south / cell) - 1
  const cols = Math.floor(east / cell) - x0 + 3
  const rows = Math.floor(north / cell) - y0 + 3

  // One DEM pixel is 360 / (2^z * 256) degrees; pick the coarsest zoom whose
  // pixels still resolve a cell, capped at the readout's z11.
  const z = Math.max(5, Math.min(Z, Math.ceil(Math.log2(360 / (256 * cell)))))
  const n = 2 ** z

  const need = new Map()   // 'x/y' → {x, y}
  const nodes = new Array(cols * rows)
  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const lng = (x0 + xi) * cell
      const lat = (y0 + yi) * cell
      const latRad = (lat * Math.PI) / 180
      const xf = ((lng + 180) / 360) * n
      const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
      const tx = Math.floor(xf), ty = Math.floor(yf)
      if (!Number.isFinite(xf) || !Number.isFinite(yf) || tx < 0 || tx >= n || ty < 0 || ty >= n) continue
      nodes[yi * cols + xi] = { tx, ty, px: Math.min(255, Math.floor((xf - tx) * 256)), py: Math.min(255, Math.floor((yf - ty) * 256)) }
      need.set(`${tx}/${ty}`, { x: tx, y: ty })
    }
  }

  // A missing tile is ocean or a gap, not a failure — those nodes stay unknown
  const tiles = new Map()
  await Promise.all([...need.values()].map(async ({ x, y }) => {
    try { tiles.set(`${x}/${y}`, await tileData(z, x, y)) } catch { /* leave absent */ }
  }))

  const elev = new Float32Array(cols * rows).fill(NaN)
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i]
    if (!nd) continue
    const t = tiles.get(`${nd.tx}/${nd.ty}`)
    if (!t) continue
    elev[i] = decode(t.data, (nd.py * 256 + nd.px) * 4) * M_TO_FT
  }
  return { cell, x0, y0, cols, rows, elev, z }
}

/** How far inside the elevation band each node sits, in feet. */
export function elevMargins(grid, min, max) {
  const out = new Float64Array(grid.cols * grid.rows).fill(NaN)
  for (let i = 0; i < out.length; i++) {
    const e = grid.elev[i]
    if (!Number.isFinite(e)) continue
    let m = Infinity
    if (min != null) m = Math.min(m, e - min)
    if (max != null) m = Math.min(m, max - e)
    out[i] = m
  }
  return out
}

// Returns meters, or null when unavailable
export async function elevationAt(lng, lat) {
  const n = 2 ** Z
  const xf = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  const x = Math.floor(xf)
  const y = Math.floor(yf)
  if (y < 0 || y >= n || x < 0 || x >= n) return null
  const data = await tileData(Z, x, y)
  const px = Math.min(255, Math.floor((xf - x) * 256))
  const py = Math.min(255, Math.floor((yf - y) * 256))
  const i = (py * 256 + px) * 4
  const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2]
  // terrarium encoding: meters = (R*256 + G + B/256) - 32768
  return r * 256 + g + b / 256 - 32768
}
