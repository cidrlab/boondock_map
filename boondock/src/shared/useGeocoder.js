/**
 * useGeocoder — debounced place search, ranked by how close it is to you.
 *
 * Two sources, queried together and merged (VISION row 136):
 *
 *   Nominatim   place names, addresses, features — a *geocoder*, which ranks
 *               by global prominence
 *   Overpass    anything nearby whose OSM `name` matches what you typed —
 *               which is how a shop two towns over gets found at all
 *
 * The second exists because of a real miss: searching "Sierra" (the outdoor
 * gear shop) returned Sierra Leone and the Sierra Nevada. A geocoder has no
 * notion of "the one near me"; it answers with the most *important* Sierra on
 * earth. Nothing in the app had a path from a typed business name to the
 * nearby-POI search, which is chip-driven.
 *
 * Everything is then sorted by distance from where you're looking, and every
 * row carries that distance, so the ranking is visible rather than implied.
 *
 * Returns: { results, loading, error, search, clear }
 */

import { useState, useRef, useCallback } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const DEBOUNCE_MS = 350

// How far out "near me" reaches for the name search. Wide enough to cross a
// county — out here the next town with a gear shop is an hour away — and not
// so wide that Overpass has to scan a state.
const NEARBY_RADIUS_M = 120000        // ~75 mi

// Nominatim's viewbox is a *bias*, and a weak one against a famous name. It
// was ±5°, roughly 345 mi by 690 mi, which is not a neighbourhood by any
// reading. Kept generous enough to catch the next town over, no more.
const VIEWBOX_DEG = 1.5

const R_EARTH_MI = 3958.8
const rad = (d) => (d * Math.PI) / 180

export function distanceMi(a, b) {
  if (!a || !b) return null
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_MI * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Map Nominatim type/category to a display icon
function iconFor(type, category) {
  const t = (type || '').toLowerCase()
  const c = (category || '').toLowerCase()
  if (t === 'city' || t === 'town' || c === 'place') return '🏙️'
  if (t === 'village' || t === 'hamlet') return '🏘️'
  if (c === 'natural' || t === 'peak' || t === 'ridge' || t === 'valley') return '⛰️'
  if (t === 'lake' || t === 'reservoir' || t === 'river' || t === 'stream') return '💧'
  if (c === 'highway' || t === 'road' || t === 'path' || t === 'track') return '🛤️'
  if (t === 'trailhead' || t === 'trail') return '🥾'
  if (c === 'leisure' || t === 'park' || t === 'nature_reserve') return '🌲'
  if (c === 'amenity' && (t === 'fuel' || t === 'gas_station')) return '⛽'
  if (c === 'amenity' && t === 'parking') return '🅿️'
  if (c === 'amenity' && (t === 'campsite' || t === 'camp_site')) return '⛺'
  if (c === 'shop') return '🛍️'
  if (c === 'tourism') return '📷'
  if (c === 'boundary' || t === 'county' || t === 'state') return '📍'
  return '📌'
}

// Shorten verbose Nominatim display names
function shortenDisplay(displayName) {
  return displayName.split(', ').slice(0, 4).join(', ')
}

/** A readable place line out of OSM address tags, when there's no display name. */
function osmSubtitle(tags) {
  const kind = tags.shop || tags.amenity || tags.tourism || tags.leisure || tags.office
  const where = [tags['addr:street'] && [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
                 tags['addr:city'], tags['addr:state']].filter(Boolean).join(', ')
  const kindLabel = kind ? String(kind).replace(/_/g, ' ') : null
  return [kindLabel, where].filter(Boolean).join(' · ') || 'OpenStreetMap'
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Overpass: named things near a point. Nodes and ways — shops are often ways. */
async function searchNearbyByName(query, center, signal) {
  if (!center?.lat || !center?.lng) return []
  const name = escapeRegex(query.trim()).replace(/"/g, '')
  if (name.length < 3) return []      // two letters matches half the county
  const around = `(around:${NEARBY_RADIUS_M},${center.lat},${center.lng})`
  const ql = `[out:json][timeout:25];(` +
    `node["name"~"${name}",i]${around};` +
    `way["name"~"${name}",i]${around};` +
    `);out center 30;`
  const res = await fetch(OVERPASS, { method: 'POST', body: ql, signal })
  if (!res.ok) throw new Error(`Overpass ${res.status}`)
  const data = await res.json()
  return (data.elements || []).map(el => {
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (lat == null || lng == null) return null
    const tags = el.tags || {}
    return {
      id: `osm-${el.type}-${el.id}`,
      name: tags.name,
      displayName: osmSubtitle(tags),
      type: tags.shop || tags.amenity || tags.tourism || 'poi',
      category: tags.shop ? 'shop' : (tags.amenity ? 'amenity' : 'poi'),
      icon: iconFor(tags.shop || tags.amenity || tags.tourism, tags.shop ? 'shop' : 'amenity'),
      lat, lng, bbox: null,
      importance: 0,
      source: 'nearby',
    }
  }).filter(Boolean)
}

async function searchGeocoder(query, center, signal) {
  let viewbox = '-130,25,-60,55'
  if (center?.lng && center?.lat) {
    const r = VIEWBOX_DEG
    viewbox = `${center.lng - r},${center.lat - r},${center.lng + r},${center.lat + r}`
  }
  const params = new URLSearchParams({
    q: query.trim(),
    format: 'json',
    addressdetails: '1',
    limit: '10',
    viewbox,
    bounded: '0',   // still a bias, not a cage: a named place outside the box
  })                //  should be findable, just ranked below what's close
  const res = await fetch(`${NOMINATIM}?${params}`, {
    signal,
    headers: { 'Accept-Language': 'en' },
  })
  if (!res.ok) throw new Error(`Nominatim ${res.status}`)
  const raw = await res.json()
  return raw.map(r => ({
    id: `nom-${r.place_id}`,
    name: r.name || r.display_name.split(',')[0],
    displayName: shortenDisplay(r.display_name),
    type: r.type,
    category: r.class,
    icon: iconFor(r.type, r.class),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    bbox: r.boundingbox
      ? [parseFloat(r.boundingbox[2]), parseFloat(r.boundingbox[0]),
         parseFloat(r.boundingbox[3]), parseFloat(r.boundingbox[1])]
      : null,
    importance: r.importance || 0,
    source: 'geocoder',
  }))
}

/** Same place from both sources — keep one, preferring the richer geocoder row. */
function dedupe(items) {
  const kept = []
  for (const item of items) {
    const twin = kept.find(k =>
      k.name && item.name &&
      k.name.toLowerCase() === item.name.toLowerCase() &&
      distanceMi(k, item) < 0.15)
    if (!twin) { kept.push(item); continue }
    if (twin.source === 'nearby' && item.source === 'geocoder') {
      kept[kept.indexOf(twin)] = { ...item, distanceMi: twin.distanceMi }
    }
  }
  return kept
}

export function useGeocoder() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)
  const abortRef = useRef(null)

  const search = useCallback((query, center) => {
    clearTimeout(timerRef.current)
    abortRef.current?.abort()

    if (!query || query.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    timerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller

      // Both sources at once, and one failing must not take the other with it —
      // Overpass is the flakier of the two and its absence should cost the
      // nearby matches, not the whole search
      const [geo, nearby] = await Promise.allSettled([
        searchGeocoder(query, center, controller.signal),
        searchNearbyByName(query, center, controller.signal),
      ])

      if (controller.signal.aborted) return

      if (geo.status === 'rejected' && nearby.status === 'rejected') {
        if (geo.reason?.name === 'AbortError') return
        setError('Search unavailable — check connection')
        setResults([])
        setLoading(false)
        return
      }

      const merged = dedupe([
        ...(nearby.status === 'fulfilled' ? nearby.value : []),
        ...(geo.status === 'fulfilled' ? geo.value : []),
      ].map(item => ({ ...item, distanceMi: distanceMi(center, item) })))

      // Closest first. Out here that is nearly always the question being
      // asked, and when it isn't, the distance on each row says so plainly.
      merged.sort((a, b) => {
        if (a.distanceMi == null && b.distanceMi == null) return b.importance - a.importance
        if (a.distanceMi == null) return 1
        if (b.distanceMi == null) return -1
        return a.distanceMi - b.distanceMi
      })

      setResults(merged.slice(0, 12))
      setLoading(false)
    }, DEBOUNCE_MS)
  }, [])

  const clear = useCallback(() => {
    clearTimeout(timerRef.current)
    abortRef.current?.abort()
    setResults([])
    setLoading(false)
    setError(null)
  }, [])

  return { results, loading, error, search, clear }
}
