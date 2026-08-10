/**
 * weather — Open-Meteo forecasts for point popups and the temperature filter.
 *
 * Weather data by Open-Meteo.com (https://open-meteo.com), CC-BY 4.0.
 * Free for non-commercial use, no API key (terms verified 2026-07-14);
 * credited in the Guide's Credits tab and the README acknowledgments.
 *
 * Three consumers:
 *   pointForecast(lat, lng)  16-day forecast + current conditions for popups
 *   airQuality(lat, lng)     current US AQI / PM2.5 and the worst hour ahead —
 *                            the wildfire-smoke readout (VISION row 69)
 *   fetchTempGrid(bounds)    lattice of daily max/min/mean °F over the
 *                            viewport, contoured (gridToGeoJSON) into the
 *                            area where the user's temperature limits hold
 */

const API = 'https://api.open-meteo.com/v1/forecast'

// A forecast that fails on the first page load is usually transient — the
// request lost a race with everything else loading, or Open-Meteo throttled
// a burst. Retry those quietly rather than telling the user they're offline
// (VISION row 67). Client errors other than 429 are permanent; don't retry.
const RETRY_DELAYS_MS = [400, 1200]

async function getJson(url) {
  let lastErr
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.json()
      const err = new Error(`open-meteo HTTP ${res.status}`)
      err.status = res.status
      if (res.status !== 429 && res.status < 500) throw err
      lastErr = err
    } catch (e) {
      if (e.status && e.status !== 429 && e.status < 500) throw e
      lastErr = e
    }
    if (attempt >= RETRY_DELAYS_MS.length) throw lastErr
    await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]))
  }
}

// Air quality lives on a sibling host, same provider and same terms, no key
// (VISION row 69). Kept as its own call rather than folded into the forecast:
// it is a different endpoint, and a point card should still show its weather
// when this one fails.
const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality'

// US AQI breakpoints and EPA's own colours. The words carry the meaning — the
// colour is a second channel, not the message — so the two darkest official
// swatches (#8f3f97, #7e0023) are lightened here to stay legible on the dark
// popup without changing which band a number falls in.
export const AQI_BANDS = [
  [50, 'Good', '#4ade80'],
  [100, 'Moderate', '#facc15'],
  [150, 'Unhealthy for sensitive groups', '#fb923c'],
  [200, 'Unhealthy', '#f87171'],
  [300, 'Very unhealthy', '#c084fc'],
  [Infinity, 'Hazardous', '#fb7185'],
]

export function aqiBand(aqi) {
  const n = Number(aqi)
  if (!Number.isFinite(n)) return null
  const [, label, color] = AQI_BANDS.find(([max]) => n <= max)
  return { label, color }
}

// Open-Meteo's maximum forecast horizon
export const FORECAST_DAYS = 16

// WMO weather interpretation codes, per the Open-Meteo docs table
const WMO_TEXT = {
  0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'], 48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Dense drizzle', '🌧️'],
  56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
  61: ['Light rain', '🌦️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'],
  66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
  71: ['Light snow', '🌨️'], 73: ['Snow', '🌨️'], 75: ['Heavy snow', '❄️'],
  77: ['Snow grains', '🌨️'],
  80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Violent showers', '🌧️'],
  85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '❄️'],
  95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + hail', '⛈️'], 99: ['Thunderstorm + heavy hail', '⛈️'],
}

export function wmoInfo(code) {
  return WMO_TEXT[code] || ['—', '·']
}

// ── Point forecasts for popups ───────────────────────────────────────────────

const pointCache = new Map()  // ~2 km buckets → {at, data} | {promise}
const airCache = new Map()    // same bucketing, for airQuality()
const POINT_TTL = 30 * 60 * 1000

export function pointForecast(lat, lng) {
  const key = `${Math.round(lat * 50)},${Math.round(lng * 50)}`
  const hit = pointCache.get(key)
  if (hit?.promise) return hit.promise
  if (hit && Date.now() - hit.at < POINT_TTL) return Promise.resolve(hit.data)
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',   // popup dates should read in the spot's local days
  })
  const p = getJson(`${API}?${params}`)
    .then(j => {
      const d = j.daily
      const data = {
        elevFt: j.elevation != null ? Math.round(j.elevation * 3.28084) : null,
        current: j.current ? {
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          wind: Math.round(j.current.wind_speed_10m),
          humidity: j.current.relative_humidity_2m,
        } : null,
        days: (d?.time || []).map((date, i) => ({
          date,
          hi: d.temperature_2m_max[i],
          lo: d.temperature_2m_min[i],
          code: d.weather_code[i],
          precipProb: d.precipitation_probability_max[i],
          precipIn: d.precipitation_sum[i],
          wind: d.wind_speed_10m_max[i],
        })),
      }
      pointCache.set(key, { at: Date.now(), data })
      if (pointCache.size > 300) pointCache.delete(pointCache.keys().next().value)
      return data
    })
  p.catch(() => { if (pointCache.get(key)?.promise === p) pointCache.delete(key) })
  pointCache.set(key, { promise: p })
  return p
}

/**
 * Current air quality plus the worst hour ahead.
 *
 * `peak` is only set when the air is forecast to get *categorically* worse —
 * a jump from 40 to 49 is noise, a jump from Good to Unhealthy is a reason to
 * camp somewhere else, and that is the question this answers for a trip.
 */
export function airQuality(lat, lng) {
  const key = `${Math.round(lat * 50)},${Math.round(lng * 50)}`
  const hit = airCache.get(key)
  if (hit?.promise) return hit.promise
  if (hit && Date.now() - hit.at < POINT_TTL) return Promise.resolve(hit.data)
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'us_aqi,pm2_5',
    hourly: 'us_aqi',
    forecast_days: '4',   // the API's ceiling for this product
    timezone: 'auto',
  })
  const p = getJson(`${AIR_API}?${params}`)
    .then(j => {
      const aqi = j.current?.us_aqi ?? null
      const hours = j.hourly?.time || []
      const series = j.hourly?.us_aqi || []
      let peak = null
      for (let i = 0; i < series.length; i++) {
        const v = series[i]
        if (v == null) continue
        if (!peak || v > peak.aqi) peak = { aqi: v, at: hours[i] }
      }
      // Only worth mentioning if it crosses into a worse band than right now
      const nowBand = aqiBand(aqi)
      if (!peak || !nowBand || aqiBand(peak.aqi)?.label === nowBand.label) peak = null
      const data = { aqi, pm25: j.current?.pm2_5 ?? null, peak }
      airCache.set(key, { at: Date.now(), data })
      if (airCache.size > 300) airCache.delete(airCache.keys().next().value)
      return data
    })
  p.catch(() => { if (airCache.get(key)?.promise === p) airCache.delete(key) })
  airCache.set(key, { promise: p })
  return p
}

// ── Temperature grid for the area filter ─────────────────────────────────────
//
// Forecast points sit on a fixed lat/lng lattice so panning reuses cached
// nodes. Cell size steps up until the viewport fits in MAX_NODES points —
// global models behind day-7..16 forecasts run ~25 km anyway, so cells
// below 0.05° would only oversample. Grid days use UTC boundaries so every
// node's day-k means the same calendar day (popups use local time instead).

const CELL_LADDER = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4]
const MAX_NODES = 520
const CHUNK = 120
const GRID_TTL = 60 * 60 * 1000
const nodeCache = new Map()  // 'cell:xi:yi' → {at, day:{tmax,tmin,tmean}} | {promise}

async function fetchDailyChunk(coords) {
  const params = new URLSearchParams({
    latitude: coords.map(c => c.lat.toFixed(3)).join(','),
    longitude: coords.map(c => c.lng.toFixed(3)).join(','),
    daily: 'temperature_2m_max,temperature_2m_min,temperature_2m_mean',
    forecast_days: String(FORECAST_DAYS),
    temperature_unit: 'fahrenheit',
    timezone: 'UTC',
  })
  const json = await getJson(`${API}?${params}`)
  // single-location requests come back as an object, not a one-item array
  const list = Array.isArray(json) ? json : [json]
  return list.map(r => ({
    tmax: r.daily.temperature_2m_max,
    tmin: r.daily.temperature_2m_min,
    tmean: r.daily.temperature_2m_mean,
  }))
}

export async function fetchTempGrid(bounds) {
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

  const now = Date.now()
  const missing = []
  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const key = `${cell}:${x0 + xi}:${y0 + yi}`
      const e = nodeCache.get(key)
      if (!e || (e.at && now - e.at > GRID_TTL)) {
        missing.push({ key, lat: (y0 + yi) * cell, lng: (x0 + xi) * cell })
      }
    }
  }

  // Nodes another in-flight call is already fetching just get awaited
  const inflight = [...new Set(missing.map(n => nodeCache.get(n.key)?.promise).filter(Boolean))]
  const fresh = missing.filter(n => !nodeCache.get(n.key)?.promise)
  const chunkPromises = []
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const chunk = fresh.slice(i, i + CHUNK)
    const p = fetchDailyChunk(chunk).then(list => {
      chunk.forEach((c, j) => nodeCache.set(c.key, { at: Date.now(), day: list[j] }))
    })
    p.catch(() => chunk.forEach(c => {
      if (nodeCache.get(c.key)?.promise === p) nodeCache.delete(c.key)
    }))
    chunk.forEach(c => nodeCache.set(c.key, { promise: p }))
    chunkPromises.push(p)
  }
  await Promise.all([...chunkPromises, ...inflight])

  const day = new Array(cols * rows).fill(null)
  for (let yi = 0; yi < rows; yi++) {
    for (let xi = 0; xi < cols; xi++) {
      const e = nodeCache.get(`${cell}:${x0 + xi}:${y0 + yi}`)
      if (e?.day) day[yi * cols + xi] = e.day
    }
  }
  while (nodeCache.size > 6000) nodeCache.delete(nodeCache.keys().next().value)
  return { cell, x0, y0, cols, rows, day }
}

// ── Criteria → signed margins ────────────────────────────────────────────────
//
// A node's margin is how many °F of slack the forecast has against the
// tightest limit: positive = every enabled limit holds, negative = at least
// one fails. Contouring the zero line of this field draws the boundary.

export function criteriaActive(c) {
  return c != null && (c.maxHi != null || c.minLo != null || c.avgLo != null || c.avgHi != null)
}

export function gridMargins(grid, c) {
  const days = Math.min(Math.max(c.days || 10, 1), FORECAST_DAYS)
  const out = new Float64Array(grid.cols * grid.rows).fill(NaN)
  for (let i = 0; i < out.length; i++) {
    const d = grid.day[i]
    if (!d) continue
    let hi = -Infinity, lo = Infinity, sum = 0, ok = true
    for (let k = 0; k < days; k++) {
      const a = d.tmax[k], b = d.tmin[k]
      if (a == null || b == null) { ok = false; break }
      if (a > hi) hi = a
      if (b < lo) lo = b
      const mean = d.tmean?.[k]
      sum += mean != null ? mean : (a + b) / 2
    }
    if (!ok) continue
    const avg = sum / days
    let m = Infinity
    if (c.maxHi != null) m = Math.min(m, c.maxHi - hi)
    if (c.minLo != null) m = Math.min(m, lo - c.minLo)
    if (c.avgLo != null) m = Math.min(m, avg - c.avgLo)
    if (c.avgHi != null) m = Math.min(m, c.avgHi - avg)
    out[i] = m
  }
  return out
}

// Bilinear margin at a point — null outside the grid or over missing nodes,
// so places we have no forecast for are never filtered out
export function marginAt(grid, margins, lng, lat) {
  const xf = lng / grid.cell - grid.x0
  const yf = lat / grid.cell - grid.y0
  if (xf < 0 || yf < 0 || xf > grid.cols - 1 || yf > grid.rows - 1) return null
  const xi = Math.min(Math.floor(xf), grid.cols - 2)
  const yi = Math.min(Math.floor(yf), grid.rows - 2)
  const fx = xf - xi, fy = yf - yi
  const v00 = margins[yi * grid.cols + xi]
  const v10 = margins[yi * grid.cols + xi + 1]
  const v01 = margins[(yi + 1) * grid.cols + xi]
  const v11 = margins[(yi + 1) * grid.cols + xi + 1]
  if (Number.isNaN(v00) || Number.isNaN(v10) || Number.isNaN(v01) || Number.isNaN(v11)) return null
  return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
}

// ── Marching squares: margin ≥ 0 → fill pieces + boundary segments ──────────
//
// Each grid cell is clipped to its margin ≥ 0 region by walking the cell
// boundary corner-by-corner, inserting the linear zero crossings. Adjacent
// cells interpolate identical crossing points on shared edges, so the
// per-cell pieces tile seamlessly — no polygon assembly or hole-tracking
// needed. Saddle cells (opposite corners inside) split on the center value.

function zeroCross(pa, va, pb, vb) {
  const t = va / (va - vb)
  return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]
}

export function gridToGeoJSON(grid, margins) {
  const polys = []
  const segs = []
  const { cell, x0, y0, cols, rows } = grid
  for (let yi = 0; yi < rows - 1; yi++) {
    for (let xi = 0; xi < cols - 1; xi++) {
      const v = [
        margins[yi * cols + xi],
        margins[yi * cols + xi + 1],
        margins[(yi + 1) * cols + xi + 1],
        margins[(yi + 1) * cols + xi],
      ]
      if (Number.isNaN(v[0]) || Number.isNaN(v[1]) || Number.isNaN(v[2]) || Number.isNaN(v[3])) continue
      const inside = [v[0] >= 0, v[1] >= 0, v[2] >= 0, v[3] >= 0]
      const nIn = inside[0] + inside[1] + inside[2] + inside[3]
      if (nIn === 0) continue
      const P = [
        [(x0 + xi) * cell, (y0 + yi) * cell],
        [(x0 + xi + 1) * cell, (y0 + yi) * cell],
        [(x0 + xi + 1) * cell, (y0 + yi + 1) * cell],
        [(x0 + xi) * cell, (y0 + yi + 1) * cell],
      ]
      if (nIn === 4) {
        polys.push([[P[0], P[1], P[2], P[3], P[0]]])
        continue
      }
      const saddle = nIn === 2 && inside[0] === inside[2]
      if (saddle && (v[0] + v[1] + v[2] + v[3]) / 4 < 0) {
        // detached corners: one triangle per inside corner
        for (let ci = 0; ci < 4; ci++) {
          if (!inside[ci]) continue
          const prev = (ci + 3) % 4, next = (ci + 1) % 4
          const a = zeroCross(P[ci], v[ci], P[next], v[next])
          const b = zeroCross(P[ci], v[ci], P[prev], v[prev])
          polys.push([[P[ci], a, b, P[ci]]])
          segs.push([a, b])
        }
        continue
      }
      const ring = [], isCross = []
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4
        if (inside[i]) { ring.push(P[i]); isCross.push(false) }
        if (inside[i] !== inside[j]) { ring.push(zeroCross(P[i], v[i], P[j], v[j])); isCross.push(true) }
      }
      if (ring.length < 3) continue
      polys.push([[...ring, ring[0]]])
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length
        if (isCross[i] && isCross[j]) segs.push([ring[i], ring[j]])
      }
    }
  }
  return {
    area: {
      type: 'FeatureCollection',
      features: polys.length
        ? [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: polys }, properties: {} }]
        : [],
    },
    edge: {
      type: 'FeatureCollection',
      features: segs.length
        ? [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segs }, properties: {} }]
        : [],
    },
  }
}
