/**
 * usePoiSearch — nearby POI search via Overpass API (OpenStreetMap)
 * Free, no API key required. Queries OSM for amenities near a given coordinate.
 *
 * Returns: { results, loading, error, search, clear }
 *
 * Result shape:
 *   { id, name, category, type, lat, lng, tags }
 */

import { useState, useRef, useCallback } from 'react'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// POI categories users care about for boondocking/hiking/offroad
export const POI_CATEGORIES = [
  { id: 'fuel',        label: 'Gas',          tags: '"amenity"="fuel"',                     radius: 20000 },
  { id: 'restaurant',  label: 'Food',         tags: '"amenity"~"restaurant|fast_food|cafe"', radius: 10000 },
  { id: 'grocery',     label: 'Grocery',      tags: '"shop"~"supermarket|convenience|general"', radius: 15000 },
  { id: 'campground',  label: 'Camp',         tags: '"tourism"~"camp_site|caravan_site"',   radius: 30000 },
  { id: 'water',       label: 'Water',        tags: '"amenity"="drinking_water"',           radius: 15000 },
  { id: 'toilet',      label: 'Restroom',     tags: '"amenity"="toilets"',                  radius: 10000 },
  { id: 'trailhead',   label: 'Trailhead',    tags: '"highway"="trailhead"',                radius: 20000 },
  { id: 'picnic',      label: 'Picnic',       tags: '"tourism"="picnic_site"',              radius: 15000 },
  { id: 'viewpoint',   label: 'Viewpoint',    tags: '"tourism"="viewpoint"',                radius: 20000 },
  { id: 'lodging',     label: 'Lodging',      tags: '"tourism"~"hotel|motel|hostel|guest_house"', radius: 15000 },
]

// Map OSM tags to display info
function categorize(tags) {
  if (tags.amenity === 'fuel') return { category: 'fuel', icon: 'fuel' }
  if (tags.amenity === 'restaurant' || tags.amenity === 'fast_food' || tags.amenity === 'cafe') return { category: 'restaurant', icon: 'generic' }
  if (tags.shop) return { category: 'grocery', icon: 'generic' }
  if (tags.tourism === 'camp_site' || tags.tourism === 'caravan_site') return { category: 'campground', icon: 'camp' }
  if (tags.amenity === 'drinking_water') return { category: 'water', icon: 'water' }
  if (tags.amenity === 'toilets') return { category: 'water', icon: 'generic' }
  if (tags.highway === 'trailhead') return { category: 'trailhead', icon: 'trailhead' }
  if (tags.tourism === 'picnic_site') return { category: 'picnic', icon: 'viewpoint' }
  if (tags.tourism === 'viewpoint') return { category: 'viewpoint', icon: 'viewpoint' }
  if (tags.tourism === 'hotel' || tags.tourism === 'motel') return { category: 'lodging', icon: 'generic' }
  return { category: 'poi', icon: 'generic' }
}

export function usePoiSearch() {
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const abortRef = useRef(null)

  const search = useCallback(async (categoryId, center) => {
    if (!center?.lat || !center?.lng) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const cat = POI_CATEGORIES.find(c => c.id === categoryId)
    if (!cat) return

    setLoading(true)
    setError(null)
    setActiveCategory(categoryId)

    try {
      const query = `[out:json][timeout:15];(node[${cat.tags}](around:${cat.radius},${center.lat},${center.lng});way[${cat.tags}](around:${cat.radius},${center.lat},${center.lng}););out center body;`

      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`Overpass error: ${res.status}`)
      const data = await res.json()

      const items = (data.elements || [])
        .map(el => {
          const lat = el.lat || el.center?.lat
          const lng = el.lon || el.center?.lon
          if (!lat || !lng) return null

          const tags = el.tags || {}
          const { category, icon } = categorize(tags)
          const name = tags.name || tags.description || `${cat.label} (unnamed)`

          // Distance from search center (rough, for sorting)
          const dlat = (lat - center.lat) * 110540
          const dlng = (lng - center.lng) * 111320 * Math.cos(center.lat * Math.PI / 180)
          const dist = Math.sqrt(dlat * dlat + dlng * dlng)

          return {
            id: `osm-${el.type}-${el.id}`,
            name,
            category,
            icon,
            lat,
            lng,
            distance: dist,
            distanceLabel: dist < 1609 ? `${Math.round(dist)}m` : `${(dist / 1609.34).toFixed(1)} mi`,
            tags,
          }
        })
        .filter(Boolean)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 25)

      setResults(items)
    } catch (e) {
      if (e.name === 'AbortError') return
      setError('POI search failed — try again')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setResults([])
    setLoading(false)
    setError(null)
    setActiveCategory(null)
  }, [])

  return { results, loading, error, activeCategory, search, clear }
}
