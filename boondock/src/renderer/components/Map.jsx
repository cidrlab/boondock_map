import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { BASE_LAYERS, OVERLAY_LAYERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../shared/layers'
import { buildBoondockStyle, BOONDOCK_GLYPHS } from '../../shared/boondockStyle'
import { installProtocol, toProtocolUrl, listPacks } from '../../shared/offlineTiles'
import { WAYPOINT_COLORS } from './Icons'

// All tile requests go through boondock:// so downloaded offline packs are
// used first and the network is the fallback (see shared/offlineTiles.js)
installProtocol(maplibregl)

// SVG path data for each waypoint icon (used in DOM markers)
const MARKER_SVG = {
  generic:   '<circle cx="12" cy="10" r="3"/>',
  camp:      '<path d="M3 22l9-16 9 16H3z"/><path d="M12 6v16"/>',
  water:     '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  hazard:    '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  trailhead: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5 10 7.89 8 10 8 12v4"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6-1.87 0-2.5 1.8-2.5 3.5 0 2.39 2 4.5 2 6.5v4"/>',
  viewpoint: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  fuel:      '<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><line x1="3" y1="22" x2="15" y2="22"/><line x1="6" y1="9" x2="12" y2="9"/>',
  parking:   '<circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
}

const Map = forwardRef(function Map(
  {
    baseLayer, overlays, waypoints, tracks, currentTrackPoints,
    selectedWaypoint, onMapClick, onMouseMove, onTrackPoint,
    isRecordingTrack, downloadMode, onBboxDrawn, onWaypointClick,
    initialViewport, onViewportChange, showPackAreas, onSaveSpot,
  },
  ref
) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const [mapReady, setMapReady] = useState(false)
  const overlaysRef = useRef(overlays)
  const markersRef = useRef({})
  const bboxStart = useRef(null)
  const bboxRect = useRef(null)

  // Keep ref in sync so callbacks always see current overlay state
  useEffect(() => { overlaysRef.current = overlays }, [overlays])

  useImperativeHandle(ref, () => ({
    flyTo: (opts) => map.current?.flyTo(opts),
    fitBounds: (bounds, opts) => map.current?.fitBounds(bounds, opts),
    getMap: () => map.current,
  }))

  // ── Build MapLibre style from current base layer ─────────────────────────
  function buildStyle(baseId) {
    if (BASE_LAYERS[baseId]?.custom) return buildBoondockStyle(BASE_LAYERS[baseId].styleMode)
    const base = BASE_LAYERS[baseId] || BASE_LAYERS['satellite']
    return {
      version: 8,
      glyphs: BOONDOCK_GLYPHS,   // site labels need fonts over raster bases too
      sources: {
        base: {
          type: 'raster',
          tiles: [toProtocolUrl(base.id)],
          tileSize: 256,
          attribution: base.attribution || '',
        },
      },
      layers: [{ id: 'base-layer', type: 'raster', source: 'base' }],
    }
  }

  // ── Init map ─────────────────────────────────────────────────────────────
  // Wait for initialViewport to load from prefs before creating the map
  useEffect(() => {
    if (map.current || !initialViewport) return

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: buildStyle(baseLayer),
      center: initialViewport.center || DEFAULT_CENTER,
      zoom: initialViewport.zoom ?? DEFAULT_ZOOM,
      maxZoom: 19,
      attributionControl: { compact: window.matchMedia('(max-width: 768px)').matches },
    })

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'imperial' }), 'bottom-right')
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    })
    map.current.addControl(geolocate, 'bottom-right')
    geolocate.on('error', (err) => {
      showToast(mapContainer.current, err?.message
        ? `Location error: ${err.message}`
        : 'Location unavailable — allow location access for this site in your browser settings')
    })

    map.current.on('load', () => {
      addOfflineFallbackLayer()
      addOverlaySources()
      addTracksLayer()
      addCurrentTrackLayer()
      addPackAreasLayer()
      refreshPackAreas()
      addSitesLayers()
      setMapReady(true)
    })

    // Save viewport on pan/zoom
    map.current.on('moveend', () => { onViewportChange?.() })

    map.current.on('click', async (e) => {
      // Check if click is on a waypoint marker — handled by marker popups
      if (e.originalEvent.target?.classList?.contains('bdk-marker')) return
      const m = map.current
      // Sites take precedence over waypoint-drop
      const siteLayers = ['sites-clusters', 'sites-points'].filter(id => m.getLayer(id))
      if (siteLayers.length) {
        const hits = m.queryRenderedFeatures(e.point, { layers: siteLayers })
        if (hits.length) {
          const f = hits[0]
          if (f.properties.cluster) {
            m.getSource('sites').getClusterExpansionZoom(f.properties.cluster_id).then(z => {
              m.easeTo({ center: f.geometry.coordinates, zoom: z + 0.3, duration: 500 })
            })
          } else {
            openSitePopup(m, f, onSaveSpot)
          }
          return
        }
      }
      // Tap a forest road for its MVUM details (quick identify, then move on)
      if (overlaysRef.current.mvum && m.getZoom() >= 9) {
        const road = await identifyMvum(m, e.lngLat)
        if (road && map.current === m) {
          openMvumPopup(m, e.lngLat, road)
          return
        }
      }
      // Basemap roads carry their own names — tap for a quick label
      const roadLayers = ROAD_LAYER_IDS.filter(id => m.getLayer(id))
      if (roadLayers.length) {
        const roads = m.queryRenderedFeatures(e.point, { layers: roadLayers })
        if (roads.length && roads[0].properties?.name) {
          openRoadPopup(m, e.lngLat, roads[0])
          return
        }
      }
      onMapClick?.(e.lngLat)
    })

    map.current.on('mouseenter', 'sites-points', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mouseleave', 'sites-points', () => { map.current.getCanvas().style.cursor = '' })
    map.current.on('mouseenter', 'sites-clusters', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mouseleave', 'sites-clusters', () => { map.current.getCanvas().style.cursor = '' })

    map.current.on('mousemove', (e) => {
      onMouseMove?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    })

    return () => {
      map.current?.remove()
      map.current = null
    }
  }, [initialViewport])

  // ── Switch base layer ────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m) return
    // On first render the map hasn't loaded yet — skip, on('load') handles it
    if (!mapReady) return
    m.setStyle(buildStyle(baseLayer))
    m.once('style.load', () => {
      addOfflineFallbackLayer()
      addOverlaySources()
      addTracksLayer()
      addCurrentTrackLayer()
      addPackAreasLayer()
      refreshPackAreas()
      addSitesLayers()
      applyOverlayVisibility()
      applyPackAreasVisibility()
    })
  }, [baseLayer])

  // ── Overlay helpers ──────────────────────────────────────────────────────
  function buildZoomOpacityExpr(zoomOpacity) {
    if (!zoomOpacity || zoomOpacity.length === 0) return 0.75
    const stops = zoomOpacity.flatMap(([z, v]) => [z, v])
    return ['interpolate', ['linear'], ['zoom'], ...stops]
  }

  function addOverlaySources() {
    const m = map.current
    if (!m) return
    const ov = overlaysRef.current
    Object.entries(OVERLAY_LAYERS).forEach(([id, layer]) => {
      if (layer.sites || !layer.tileUrl) return
      if (!m.getSource(id)) {
        m.addSource(id, {
          type: 'raster',
          // direct: bbox-template services render straight, no pack protocol
          tiles: [layer.direct ? layer.tileUrl : toProtocolUrl(id)],
          tileSize: layer.direct ? 512 : 256,
          attribution: layer.attribution || '',
          ...(layer.sourceMinzoom != null && { minzoom: layer.sourceMinzoom }),
          ...(layer.sourceMaxzoom != null && { maxzoom: layer.sourceMaxzoom }),
        })
      }
      if (!m.getLayer(`${id}-layer`)) {
        m.addLayer({
          id: `${id}-layer`,
          type: 'raster',
          source: id,
          layout: { visibility: ov[id] ? 'visible' : 'none' },
          paint: {
            'raster-opacity': buildZoomOpacityExpr(layer.zoomOpacity),
            'raster-fade-duration': 0,   // toggles respond instantly
          },
        })
      }
    })
  }

  function applyOverlayVisibility() {
    const m = map.current
    if (!m) return
    const ov = overlaysRef.current
    Object.entries(ov).forEach(([id, visible]) => {
      const ids = id === 'sites' ? SITES_LAYER_IDS : [`${id}-layer`]
      ids.forEach(layerId => {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
        }
      })
    })
  }

  // ── Sites — the spots database layer ──────────────────────────────────────
  async function addSitesLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('sites')) {
      let data
      try {
        data = await fetchSitesData()
      } catch {
        return  // data file unreachable; overlay simply stays empty
      }
      if (map.current !== m || m.getSource('sites')) return
      m.addSource('sites', { type: 'geojson', data, cluster: true, clusterRadius: 46, clusterMaxZoom: 11 })
    }
    const vis = overlaysRef.current.sites ? 'visible' : 'none'
    if (!m.getLayer('sites-clusters')) {
      m.addLayer({
        id: 'sites-clusters', type: 'circle', source: 'sites',
        filter: ['has', 'point_count'],
        layout: { visibility: vis },
        paint: {
          'circle-color': 'rgba(25, 34, 44, 0.88)',
          'circle-stroke-color': '#e8eef4',
          'circle-stroke-width': 1.2,
          'circle-radius': ['step', ['get', 'point_count'], 13, 25, 17, 100, 22],
        },
      })
    }
    if (!m.getLayer('sites-cluster-count')) {
      m.addLayer({
        id: 'sites-cluster-count', type: 'symbol', source: 'sites',
        filter: ['has', 'point_count'],
        layout: {
          visibility: vis,
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 11,
        },
        paint: { 'text-color': '#e8eef4' },
      })
    }
    if (!m.getLayer('sites-points')) {
      m.addLayer({
        id: 'sites-points', type: 'circle', source: 'sites',
        filter: ['!', ['has', 'point_count']],
        layout: { visibility: vis },
        paint: {
          'circle-color': ['match', ['get', 'kind'],
            'campsite', '#22c55e',
            'rv_park', '#a78bfa',
            'dump', '#fb923c',
            'water', '#38bdf8',
            '#e8eef4'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 13, 6],
          'circle-stroke-color': '#10151c',
          'circle-stroke-width': 1.4,
        },
      })
    }
    if (!m.getLayer('sites-labels')) {
      m.addLayer({
        id: 'sites-labels', type: 'symbol', source: 'sites', minzoom: 12,
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: vis,
          'text-field': ['coalesce', ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.1],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#c6d4e2', 'text-halo-color': '#0e141b', 'text-halo-width': 1.1 },
      })
    }
  }

  // ── Offline fallback: saved USGS packs appear when the network is gone ────
  function addOfflineFallbackLayer() {
    const m = map.current
    if (!m) return
    if (!m.getSource('usgs-offline')) {
      m.addSource('usgs-offline', { type: 'raster', tiles: [toProtocolUrl('usgs-topo')], tileSize: 256, attribution: 'USGS National Map' })
    }
    if (!m.getLayer('usgs-offline-layer')) {
      m.addLayer({
        id: 'usgs-offline-layer', type: 'raster', source: 'usgs-offline',
        layout: { visibility: navigator.onLine ? 'none' : 'visible' },
      })
    }
  }

  useEffect(() => {
    const apply = () => {
      const m = map.current
      if (m?.getLayer('usgs-offline-layer')) {
        m.setLayoutProperty('usgs-offline-layer', 'visibility', navigator.onLine ? 'none' : 'visible')
      }
    }
    const onOffline = () => {
      apply()
      showToast(mapContainer.current, 'Offline — showing saved map packs where available')
    }
    window.addEventListener('online', apply)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', apply)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // ── Overlay toggle effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    applyOverlayVisibility()
  }, [overlays, mapReady])

  // ── Downloaded-pack footprints ────────────────────────────────────────────
  function addPackAreasLayer() {
    const m = map.current
    if (!m) return
    if (!m.getSource('pack-areas')) {
      m.addSource('pack-areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    }
    if (!m.getLayer('pack-areas-fill')) {
      m.addLayer({
        id: 'pack-areas-fill', type: 'fill', source: 'pack-areas',
        layout: { visibility: 'none' },
        paint: { 'fill-color': '#fbbf24', 'fill-opacity': 0.07 },
      })
    }
    if (!m.getLayer('pack-areas-line')) {
      m.addLayer({
        id: 'pack-areas-line', type: 'line', source: 'pack-areas',
        layout: { visibility: 'none' },
        // Amber: readable over both pale topo and dark satellite
        paint: { 'line-color': '#fbbf24', 'line-opacity': 0.9, 'line-width': 2, 'line-dasharray': [3, 2] },
      })
    }
  }

  async function refreshPackAreas() {
    const m = map.current
    if (!m?.getSource('pack-areas')) return
    const packs = await listPacks()
    m.getSource('pack-areas').setData({
      type: 'FeatureCollection',
      features: packs.map(p => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [p.bbox[0], p.bbox[1]], [p.bbox[2], p.bbox[1]],
            [p.bbox[2], p.bbox[3]], [p.bbox[0], p.bbox[3]],
            [p.bbox[0], p.bbox[1]],
          ]],
        },
        properties: { name: p.name },
      })),
    })
  }

  function applyPackAreasVisibility() {
    const m = map.current
    if (!m) return
    const vis = showPackAreasRef.current ? 'visible' : 'none'
    ;['pack-areas-fill', 'pack-areas-line'].forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis)
    })
  }

  const showPackAreasRef = useRef(showPackAreas)
  useEffect(() => { showPackAreasRef.current = showPackAreas }, [showPackAreas])

  useEffect(() => {
    if (!mapReady) return
    applyPackAreasVisibility()
    if (showPackAreas) refreshPackAreas()
  }, [showPackAreas, mapReady])

  useEffect(() => {
    const refresh = () => refreshPackAreas()
    window.addEventListener('boondock-packs-changed', refresh)
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('boondock-packs') : null
    ch?.addEventListener('message', refresh)
    return () => {
      window.removeEventListener('boondock-packs-changed', refresh)
      ch?.close()
    }
  }, [])

  // ── Tracks layer ─────────────────────────────────────────────────────────
  function addTracksLayer() {
    const m = map.current
    if (!m) return
    if (!m.getSource('tracks')) {
      m.addSource('tracks', { type: 'geojson', data: tracksToGeoJSON([]) })
    }
    if (!m.getLayer('tracks-line')) {
      m.addLayer({
        id: 'tracks-line',
        type: 'line',
        source: 'tracks',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.85,
        },
      })
    }
  }

  function addCurrentTrackLayer() {
    const m = map.current
    if (!m) return
    if (!m.getSource('current-track')) {
      m.addSource('current-track', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    }
    if (!m.getLayer('current-track-line')) {
      m.addLayer({
        id: 'current-track-line',
        type: 'line',
        source: 'current-track',
        paint: { 'line-color': '#F9322B', 'line-width': 3, 'line-dasharray': [2, 1] },
      })
    }
  }

  useEffect(() => {
    if (!map.current?.getSource('tracks')) return
    map.current.getSource('tracks').setData(tracksToGeoJSON(tracks))
  }, [tracks])

  useEffect(() => {
    if (!map.current?.getSource('current-track')) return
    const data = {
      type: 'FeatureCollection',
      features: currentTrackPoints.length > 1 ? [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: currentTrackPoints.map(p => [p.lng, p.lat]) },
        properties: { color: '#F9322B' },
      }] : [],
    }
    map.current.getSource('current-track').setData(data)
  }, [currentTrackPoints])

  // ── Waypoint markers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!map.current || !mapReady) return

    // Remove stale markers
    const currentIds = new Set(waypoints.map(w => w.id))
    Object.keys(markersRef.current).forEach(id => {
      if (!currentIds.has(id)) {
        markersRef.current[id].remove()
        delete markersRef.current[id]
      }
    })

    // Add/update markers
    waypoints.forEach(wp => {
      if (markersRef.current[wp.id]) {
        markersRef.current[wp.id].setLngLat([wp.lng, wp.lat])
        return
      }

      const color = WAYPOINT_COLORS[wp.icon] || WAYPOINT_COLORS.generic
      const svgInner = MARKER_SVG[wp.icon] || MARKER_SVG.generic

      const el = document.createElement('div')
      el.className = 'bdk-marker'
      el.style.cssText = `
        width: 30px; height: 38px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: transform 0.12s;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
        overflow: visible;
      `
      // Modern pin: circle with inner SVG icon
      el.innerHTML = `
        <svg width="30" height="38" viewBox="0 0 30 38">
          <path d="M15 0C6.72 0 0 6.72 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.72 23.28 0 15 0z"
            fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
          <g transform="translate(6, 5) scale(0.75)" fill="none" stroke="white" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round">
            ${svgInner}
          </g>
        </svg>
      `

      const popup = new maplibregl.Popup({ offset: [0, -30], closeButton: true, maxWidth: '260px' })
        .setHTML(`
          <div style="font-family:-apple-system,system-ui,sans-serif;">
            <div style="font-size:14px;font-weight:600;margin-bottom:2px">${wp.name}</div>
            ${wp.notes ? `<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px">${wp.notes}</div>` : ''}
            <div style="font-size:11px;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</div>
          </div>
        `)

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .setPopup(popup)
        .addTo(map.current)

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        onWaypointClick?.(wp)
      })

      markersRef.current[wp.id] = marker
    })
  }, [waypoints, mapReady])

  // Highlight selected waypoint
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement()
      const isSelected = selectedWaypoint?.id === id
      el.style.zIndex = isSelected ? '10' : '1'
      el.style.transform = isSelected ? 'scale(1.25)' : 'scale(1)'
    })
  }, [selectedWaypoint])

  // ── Download mode — bounding box drawing ─────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m) return

    if (downloadMode) {
      m.getCanvas().style.cursor = 'crosshair'

      const onDown = (e) => {
        bboxStart.current = [e.lngLat.lng, e.lngLat.lat]
        const rect = document.createElement('div')
        rect.id = 'bbox-rect'
        rect.style.cssText = `
          position: absolute; border: 2px dashed #F9322B;
          background: rgba(74,158,255,0.15); pointer-events: none; z-index: 999;
        `
        mapContainer.current.style.position = 'relative'
        mapContainer.current.appendChild(rect)
        bboxRect.current = rect
      }

      const onMove = (e) => {
        if (!bboxStart.current || !bboxRect.current) return
        const start = m.project(bboxStart.current)
        const current = m.project([e.lngLat.lng, e.lngLat.lat])
        const x = Math.min(start.x, current.x)
        const y = Math.min(start.y, current.y)
        const w = Math.abs(current.x - start.x)
        const h = Math.abs(current.y - start.y)
        bboxRect.current.style.left = x + 'px'
        bboxRect.current.style.top = y + 'px'
        bboxRect.current.style.width = w + 'px'
        bboxRect.current.style.height = h + 'px'
      }

      const onUp = (e) => {
        if (!bboxStart.current) return
        const bbox = [
          Math.min(bboxStart.current[0], e.lngLat.lng),
          Math.min(bboxStart.current[1], e.lngLat.lat),
          Math.max(bboxStart.current[0], e.lngLat.lng),
          Math.max(bboxStart.current[1], e.lngLat.lat),
        ]
        bboxStart.current = null
        bboxRect.current?.remove()
        bboxRect.current = null
        onBboxDrawn?.(bbox)
      }

      m.on('mousedown', onDown)
      m.on('mousemove', onMove)
      m.on('mouseup', onUp)
      m.dragPan.disable()

      return () => {
        m.off('mousedown', onDown)
        m.off('mousemove', onMove)
        m.off('mouseup', onUp)
        m.dragPan.enable()
        m.getCanvas().style.cursor = ''
        document.getElementById('bbox-rect')?.remove()
      }
    }
  }, [downloadMode])

  return <div ref={mapContainer} className="map-container" />
})

export default Map

// ── Helpers ──────────────────────────────────────────────────────────────────
const SITES_LAYER_IDS = ['sites-clusters', 'sites-cluster-count', 'sites-points', 'sites-labels']

let sitesDataPromise = null
function fetchSitesData() {
  if (!sitesDataPromise) {
    sitesDataPromise = fetch(import.meta.env.BASE_URL + 'data/spots-wa.geojson')
      .then(r => {
        if (!r.ok) throw new Error(`spots data HTTP ${r.status}`)
        return r.json()
      })
      .catch(e => { sitesDataPromise = null; throw e })
  }
  return sitesDataPromise
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const SITE_KIND_LABELS = { campsite: 'Campsite', rv_park: 'RV park', dump: 'Dump station', water: 'Water fill' }

const ROAD_LAYER_IDS = ['road-motorway', 'road-primary', 'road-secondary', 'road-minor', 'road-track', 'road-path']
const ROAD_CLASS_LABELS = {
  motorway: 'Highway', trunk: 'Highway', primary: 'Primary road', secondary: 'Road',
  tertiary: 'Road', minor: 'Local road', service: 'Service road', track: 'Track / forest road', path: 'Path / trail',
}

// ArcGIS identify on the MVUM service — resolves null on miss or timeout
async function identifyMvum(m, lngLat) {
  const idUrl = OVERLAY_LAYERS.mvum.identifyUrl
  if (!idUrl) return null
  const b = m.getBounds()
  const canvas = m.getCanvas()
  const params = new URLSearchParams({
    geometry: `${lngLat.lng},${lngLat.lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: 'visible:1,2',
    tolerance: '8',
    mapExtent: `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`,
    imageDisplay: `${Math.round(canvas.clientWidth)},${Math.round(canvas.clientHeight)},96`,
    returnGeometry: 'false',
    f: 'json',
  })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 900)
  try {
    const res = await fetch(`${idUrl}?${params}`, { signal: ctrl.signal })
    if (!res.ok) return null
    const data = await res.json()
    return data.results?.[0] || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const MVUM_ATTR_PATTERN = /SEASON|VEHICLE|SURFACE|SYMBOL_NAME|JURISDICTION|GIS_MILES/i

function openMvumPopup(m, lngLat, result) {
  const a = result.attributes || {}
  const title = a.Name || a.NAME || 'Forest road'
  const rows = Object.entries(a)
    .filter(([k, v]) => MVUM_ATTR_PATTERN.test(k) && v && v !== 'Null' && v !== ' ')
    .slice(0, 6)
    .map(([k, v]) => `${esc(k.replace(/_/g, ' ').toLowerCase())}: ${esc(v)}`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:170px">
      <div style="font-size:13px;font-weight:600">${esc(title)}</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(232,238,244,.55);margin:2px 0 5px">USFS MVUM · ${esc(result.layerName || 'road')}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(232,238,244,.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
    </div>`
  new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
}

function openRoadPopup(m, lngLat, feature) {
  const p = feature.properties
  const cls = ROAD_CLASS_LABELS[p.class] || 'Road'
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif">
      <div style="font-size:13px;font-weight:600">${esc(p.name)}</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(232,238,244,.55);margin-top:2px">${esc(cls)}</div>
    </div>`
  new maplibregl.Popup({ offset: 8, maxWidth: '240px' }).setLngLat(lngLat).setHTML(html).addTo(m)
}

function openSitePopup(m, f, onSaveSpot) {
  const p = f.properties
  const [lng, lat] = f.geometry.coordinates
  const kindLabel = SITE_KIND_LABELS[p.kind] || 'Site'
  const rows = []
  if (p.fee) rows.push(`Fee: ${esc(p.fee)}`)
  if (p.access) rows.push(`Access: ${esc(p.access)}`)
  if (p.drinking_water) rows.push(`Drinking water: ${esc(p.drinking_water)}`)
  if (p.toilets) rows.push(`Toilets: ${esc(p.toilets)}`)
  if (p.operator) rows.push(`Operator: ${esc(p.operator)}`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:180px">
      <div style="font-size:13.5px;font-weight:600">${esc(p.name || kindLabel)}</div>
      <div style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:rgba(232,238,244,.55);margin:2px 0 6px">${kindLabel}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(232,238,244,.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${p.website ? `<div style="margin-top:5px"><a href="${esc(p.website)}" target="_blank" rel="noreferrer" style="font-size:11.5px;color:#38bdf8">Website</a></div>` : ''}
      <button class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="font-size:9.5px;color:rgba(232,238,244,.35);margin-top:7px">© OpenStreetMap contributors</div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 10, maxWidth: '270px' })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(m)
  popup.getElement().querySelector('button')?.addEventListener('click', () => {
    onSaveSpot?.({ ...p, lat, lng })
    popup.remove()
  })
}

let toastTimer = null
function showToast(container, text) {
  if (!container) return
  let el = container.querySelector('.map-toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'map-toast'
    container.appendChild(el)
  }
  el.textContent = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.remove(), 6000)
}

const TRACK_COLORS = ['#F9322B','#22c55e','#f59e0b','#a78bfa','#38bdf8','#fb923c']

function tracksToGeoJSON(tracks) {
  return {
    type: 'FeatureCollection',
    features: tracks.map((t, i) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: t.points.map(p => [p.lng, p.lat]) },
      properties: { id: t.id, name: t.name, color: TRACK_COLORS[i % TRACK_COLORS.length] },
    })),
  }
}
