/**
 * elevation — point elevation lookups from the same Mapzen terrarium DEM
 * tiles the hillshade renders, so hover readouts reuse the browser's tile
 * cache instead of hitting a new service. Tiles decode once onto a small
 * canvas and are kept in a tiny LRU.
 */

const TILE_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`
const Z = 11            // ~40 m/px at this latitude — plenty for a readout
const MAX_TILES = 24
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
