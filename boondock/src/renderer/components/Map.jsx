import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { BASE_LAYERS, OVERLAY_LAYERS, ESRI_REFERENCE_URL, ESRI_LABELS_URL, USGS_TOPO_URL, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../shared/layers'
import { WAYPOINT_COLORS } from './Icons'

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
    initialViewport, onViewportChange,
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
    const base = BASE_LAYERS[baseId]
    const sources = {}
    const layers = []

    if (baseId === 'topo-imagery') {
      // High-res composite: ESRI satellite + USGS topo overlay at reduced opacity
      sources['esri-sat'] = { type: 'raster', tiles: [BASE_LAYERS['esri-satellite'].tileUrl], tileSize: 256, maxzoom: 19 }
      sources['usgs-topo-overlay'] = { type: 'raster', tiles: [USGS_TOPO_URL], tileSize: 256, maxzoom: 16 }
      layers.push({ id: 'esri-sat-layer', type: 'raster', source: 'esri-sat' })
      layers.push({
        id: 'usgs-topo-overlay-layer', type: 'raster', source: 'usgs-topo-overlay',
        paint: {
          // Topo overlay: semi-transparent so satellite shows through
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 14, 0.45, 16, 0.35, 17, 0],
        },
      })
    } else if (baseId === 'esri-hybrid') {
      // Satellite base + road lines + place/road name labels
      sources['esri-sat'] = { type: 'raster', tiles: [BASE_LAYERS['esri-satellite'].tileUrl], tileSize: 256 }
      sources['esri-ref'] = { type: 'raster', tiles: [ESRI_REFERENCE_URL], tileSize: 256 }
      sources['esri-labels'] = { type: 'raster', tiles: [ESRI_LABELS_URL], tileSize: 256 }
      layers.push({ id: 'esri-sat-layer', type: 'raster', source: 'esri-sat' })
      layers.push({ id: 'esri-ref-layer', type: 'raster', source: 'esri-ref', paint: { 'raster-opacity': 0.9 } })
      layers.push({ id: 'esri-labels-layer', type: 'raster', source: 'esri-labels', paint: { 'raster-opacity': 0.85 } })
    } else if (base?.subdomains) {
      // Subdomain tile (OpenTopoMap style)
      const urls = base.subdomains.map(s => base.tileUrl.replace('{s}', s))
      sources['base'] = { type: 'raster', tiles: urls, tileSize: 256, attribution: base.attribution }
      layers.push({ id: 'base-layer', type: 'raster', source: 'base' })
    } else if (base?.tileUrl) {
      sources['base'] = {
        type: 'raster',
        tiles: [base.tileUrl],
        tileSize: 256,
        attribution: base.attribution || '',
      }
      layers.push({ id: 'base-layer', type: 'raster', source: 'base' })
    }

    return { version: 8, sources, layers }
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
    })

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'imperial' }), 'bottom-right')
    map.current.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'top-right'
    )

    map.current.on('load', () => {
      addOverlaySources()
      addTracksLayer()
      addCurrentTrackLayer()
      setMapReady(true)
    })

    // Save viewport on pan/zoom
    map.current.on('moveend', () => { onViewportChange?.() })

    map.current.on('click', (e) => {
      // Check if click is on a waypoint marker — handled by marker popups
      if (e.originalEvent.target?.classList?.contains('bdk-marker')) return
      onMapClick?.(e.lngLat)
    })

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
      addOverlaySources()
      addTracksLayer()
      addCurrentTrackLayer()
      applyOverlayVisibility()
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
      const url = layer.tileUrl || layer.url
      if (!url) return
      if (!m.getSource(id)) {
        m.addSource(id, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          attribution: layer.attribution || '',
        })
      }
      if (!m.getLayer(`${id}-layer`)) {
        m.addLayer({
          id: `${id}-layer`,
          type: 'raster',
          source: id,
          layout: { visibility: ov[id] ? 'visible' : 'none' },
          paint: { 'raster-opacity': buildZoomOpacityExpr(layer.zoomOpacity) },
        })
      }
    })
  }

  function applyOverlayVisibility() {
    const m = map.current
    if (!m) return
    const ov = overlaysRef.current
    Object.entries(ov).forEach(([id, visible]) => {
      const layerId = `${id}-layer`
      if (m.getLayer(layerId)) {
        m.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
      }
    })
  }

  // ── Overlay toggle effect ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return
    applyOverlayVisibility()
  }, [overlays, mapReady])

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
