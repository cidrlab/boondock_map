/**
 * useGeocoder — debounced place/POI search via Nominatim (OpenStreetMap)
 * Free, no API key, works offline if you have a cached response.
 *
 * Returns: { results, loading, error, search, clear }
 *
 * Result shape:
 *   { id, name, displayName, type, category, lat, lng, bbox, importance }
 */

import { useState, useRef, useCallback } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const DEBOUNCE_MS = 350

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
  if (c === 'tourism') return '📷'
  if (c === 'boundary' || t === 'county' || t === 'state') return '📍'
  return '📌'
}

// Shorten verbose Nominatim display names
function shortenDisplay(displayName) {
  const parts = displayName.split(', ')
  // Keep first 3-4 meaningful parts
  return parts.slice(0, 4).join(', ')
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

      try {
        // Build viewbox from map center (~5° radius) or fall back to North America
        let viewbox = '-130,25,-60,55'
        if (center && center.lng && center.lat) {
          const r = 5  // degrees radius — wide enough to catch nearby results
          viewbox = `${center.lng - r},${center.lat - r},${center.lng + r},${center.lat + r}`
        }

        const params = new URLSearchParams({
          q: query.trim(),
          format: 'json',
          addressdetails: '1',
          limit: '8',
          viewbox,
          bounded: '0',  // 0 = don't restrict, just bias toward viewbox
        })

        const res = await fetch(`${NOMINATIM}?${params}`, {
          signal: controller.signal,
          headers: { 'Accept-Language': 'en' },
        })

        if (!res.ok) throw new Error(`Nominatim error: ${res.status}`)
        const raw = await res.json()

        const items = raw.map(r => ({
          id: r.place_id,
          name: r.name || r.display_name.split(',')[0],
          displayName: shortenDisplay(r.display_name),
          type: r.type,
          category: r.class,
          icon: iconFor(r.type, r.class),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          bbox: r.boundingbox
            ? [
                parseFloat(r.boundingbox[2]),  // minLon
                parseFloat(r.boundingbox[0]),  // minLat
                parseFloat(r.boundingbox[3]),  // maxLon
                parseFloat(r.boundingbox[1]),  // maxLat
              ]
            : null,
          importance: r.importance || 0,
        }))

        setResults(items)
      } catch (e) {
        if (e.name === 'AbortError') return
        setError('Search unavailable — check connection')
        setResults([])
      } finally {
        setLoading(false)
      }
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
