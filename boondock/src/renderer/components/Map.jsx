import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { BASE_LAYERS, OVERLAY_LAYERS, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../shared/layers'
import { buildBoondockStyle, BOONDOCK_GLYPHS } from '../../shared/boondockStyle'
import { installProtocol, toProtocolUrl, listPacks } from '../../shared/offlineTiles'
import { elevationAt } from '../../shared/elevation'
import { pointForecast, wmoInfo, fetchTempGrid, gridMargins, gridToGeoJSON, marginAt, criteriaActive } from '../../shared/weather'
import { WP_STATUS_META, WP_RATING_KEYS, statusBadgeColor } from '../../shared/waypointMeta'
import { STATE_BOUNDS } from '../../shared/stateBounds'
import { WAYPOINT_COLORS } from './Icons'

// All tile requests go through boondock:// so downloaded offline packs are
// used first and the network is the fallback (see shared/offlineTiles.js)
installProtocol(maplibregl)

// SVG path data for each waypoint icon (used in DOM markers)
const MARKER_SVG = {
  generic:   '<circle cx="12" cy="10" r="3"/>',
  camp:      '<path d="M3 22l9-16 9 16H3z"/><path d="M12 6v16"/>',
  water:     '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
  dump:      '<line x1="12" y1="3" x2="12" y2="12"/><polyline points="8 8 12 12 16 8"/><path d="M5 15h14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>',
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
    searchPins, hoverPin, onPinHover, onZoomChange, onCenterChange,
    siteMinElev, siteMaxElev, siteKinds, tempFilter, onTempStatus,
    wpColors, onWaypointEdit, onWaypointDelete,
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
  const infoPopupRef = useRef(null)

  // GPS feed for track recording. Everything downstream (accumulate in App,
  // draw current-track, save on stop) was already wired; nothing watched the
  // position, so Record had never produced a point
  useEffect(() => {
    if (!isRecordingTrack) return
    if (!navigator.geolocation) {
      showToast(mapContainer.current, 'Location unavailable — cannot record a track')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => onTrackPoint?.({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        ele: pos.coords.altitude ?? 0,
      }),
      (err) => showToast(mapContainer.current, `Location error while recording: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [isRecordingTrack, onTrackPoint])

  // One delegated handler serves the "Copy coords" button in every popup —
  // popup content gets replaced by setHTML, so per-node listeners don't stick
  useEffect(() => {
    const onCopyClick = (e) => {
      const btn = e.target.closest?.('[data-copy-coords]')
      if (!btn) return
      copyText(btn.dataset.copyCoords).then(ok => {
        const orig = btn.innerHTML
        btn.innerHTML = ok ? '✓ Copied' : 'Copy failed'
        setTimeout(() => { btn.innerHTML = orig }, 1400)
      })
    }
    document.addEventListener('click', onCopyClick)
    return () => document.removeEventListener('click', onCopyClick)
  }, [])

  // Keep refs in sync so callbacks always see current state
  useEffect(() => { overlaysRef.current = overlays }, [overlays])
  const downloadModeRef = useRef(downloadMode)
  useEffect(() => { downloadModeRef.current = downloadMode }, [downloadMode])

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
          ...(base.sourceMaxzoom && { maxzoom: base.sourceMaxzoom }),
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
      addZonesLayers()
      addTempLayers()
      addSearchPinsLayers()
      setMapReady(true)
    })

    // Save viewport on pan/zoom
    map.current.on('moveend', () => { onViewportChange?.() })

    // Lazy per-state data — load whichever states the viewport reaches,
    // then push the grown collections through the usual filter path
    const loadViewStates = () => ensureStatesLoaded(map.current, () => {
      applySiteElevFilter()
      map.current?.getSource('zones')?.setData(getZonesData())
    })
    map.current.on('moveend', loadViewStates)
    map.current.on('load', loadViewStates)

    // Temperature filter follows the view — refresh the forecast grid after
    // panning settles (cached lattice nodes make small moves free)
    map.current.on('moveend', () => {
      if (!criteriaActive(tempFilterRef.current)) return
      clearTimeout(tempDebounceRef.current)
      tempDebounceRef.current = setTimeout(() => refreshTempOverlay(), 700)
    })

    const emitZoom = () => onZoomChange?.(Math.round(map.current.getZoom() * 10) / 10)
    map.current.on('move', emitZoom)
    emitZoom()

    const emitCenter = () => {
      const c = map.current.getCenter()
      onCenterChange?.({ lng: c.lng, lat: c.lat })
    }
    map.current.on('moveend', emitCenter)
    emitCenter()

    map.current.on('click', async (e) => {
      // Clicks on a waypoint marker (or its inner SVG) belong to its popup
      if (e.originalEvent.target?.closest?.('.bdk-marker')) return
      if (downloadModeRef.current) return   // bbox drawing owns the pointer
      const m = map.current
      // Numbered search pins first — they're what the user just asked for
      if (m.getLayer('search-pins-circle')) {
        const pinHits = m.queryRenderedFeatures(e.point, { layers: ['search-pins-circle'] })
        if (pinHits.length) {
          const p = pinHits[0].properties
          const [lng, lat] = pinHits[0].geometry.coordinates
          openSearchPinPopup(m, { lng, lat }, p, onSaveSpot)
          return
        }
      }
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
      // Tap a forest road or trail for its USFS details (quick identifies)
      if (overlaysRef.current.mvum && m.getZoom() >= 9) {
        const road = await identifyMvum(m, e.lngLat)
        if (road && map.current === m) {
          openMvumPopup(m, e.lngLat, road)
          return
        }
      }
      if (overlaysRef.current['usfs-trails'] && m.getZoom() >= 10) {
        const trail = await identifyTrail(m, e.lngLat)
        if (trail && map.current === m) {
          openTrailPopup(m, e.lngLat, trail)
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
      // Empty ground: show the spot's numbers first; saving is one tap more.
      // Clicking near an open card dismisses it; clicking elsewhere replaces
      // it. Inside a Boondock Zone the card carries the heuristic's disclaimer.
      const prev = infoPopupRef.current
      if (prev?.isOpen?.()) {
        const prevPt = m.project(prev.getLngLat())
        prev.remove()
        infoPopupRef.current = null
        if (Math.hypot(prevPt.x - e.point.x, prevPt.y - e.point.y) < 44) return
      }
      let zoneProps = null
      if (overlaysRef.current.zones && m.getLayer('zones-fill')) {
        const zhits = m.queryRenderedFeatures(e.point, { layers: ['zones-fill'] })
        if (zhits.length) zoneProps = zhits[0].properties || {}
      }
      infoPopupRef.current = openPointInfoPopup(m, e.lngLat, onMapClick, zoneProps)
    })

    map.current.on('mouseenter', 'search-pins-circle', () => { map.current.getCanvas().style.cursor = 'pointer' })
    map.current.on('mousemove', 'search-pins-circle', (e) => {
      const f = e.features?.[0]
      if (f) onPinHover?.(f.properties.n - 1)
    })
    map.current.on('mouseleave', 'search-pins-circle', () => {
      map.current.getCanvas().style.cursor = ''
      onPinHover?.(null)
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
    // style.load proved unreliable after setStyle (overlays silently lost
    // until a page refresh) — poll readiness instead
    const readd = () => {
      addOfflineFallbackLayer()
      addOverlaySources()
      addTracksLayer()
      addCurrentTrackLayer()
      addPackAreasLayer()
      refreshPackAreas()
      addSitesLayers()
      addZonesLayers()
      addTempLayers()
      applyTempData()
      addSearchPinsLayers()
      applySearchPins()
      applyOverlayVisibility()
      applyPackAreasVisibility()
      applySiteElevFilter()
    }
    const waitReady = () => {
      if (map.current !== m) return
      if (m.isStyleLoaded()) readd()
      else setTimeout(waitReady, 120)
    }
    waitReady()
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
      if (layer.sites || layer.zones) return
      const parts = layer.parts || [{ key: null, tileUrl: layer.tileUrl, sourceMinzoom: layer.sourceMinzoom, sourceMaxzoom: layer.sourceMaxzoom, zoomOpacity: layer.zoomOpacity }]
      parts.forEach(p => {
        if (!p.tileUrl) return
        const srcId = p.key ? `${id}-${p.key}` : id
        if (!m.getSource(srcId)) {
          m.addSource(srcId, {
            type: 'raster',
            // direct: bbox-template services render straight, no pack protocol
            tiles: [layer.direct ? p.tileUrl : toProtocolUrl(id)],
            tileSize: layer.direct ? 512 : 256,
            attribution: layer.attribution || '',
            ...(p.sourceMinzoom != null && { minzoom: p.sourceMinzoom }),
            ...(p.sourceMaxzoom != null && { maxzoom: p.sourceMaxzoom }),
          })
        }
        if (!m.getLayer(`${srcId}-layer`)) {
          m.addLayer({
            id: `${srcId}-layer`,
            type: 'raster',
            source: srcId,
            layout: { visibility: ov[id] ? 'visible' : 'none' },
            paint: {
              'raster-opacity': buildZoomOpacityExpr(p.zoomOpacity),
              'raster-fade-duration': 0,   // toggles respond instantly
            },
          })
        }
      })
    })
  }

  function applyOverlayVisibility() {
    const m = map.current
    if (!m) return
    const ov = overlaysRef.current
    Object.entries(ov).forEach(([id, visible]) => {
      const def = OVERLAY_LAYERS[id]
      const ids = id === 'sites'
        ? SITES_LAYER_IDS
        : id === 'zones'
          ? ['zones-fill', 'zones-line']
          : def?.parts
            ? def.parts.map(p => `${id}-${p.key}-layer`)
            : [`${id}-layer`]
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
      m.addSource('sites', { type: 'geojson', data: getSitesData(), cluster: true, clusterRadius: 46, clusterMaxZoom: 11 })
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
            'trailhead', '#f472b6',
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

  // ── Numbered search/POI result pins ───────────────────────────────────────
  function addSearchPinsLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('search-pins')) {
      m.addSource('search-pins', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    }
    if (!m.getLayer('search-pins-hover')) {
      m.addLayer({
        id: 'search-pins-hover', type: 'circle', source: 'search-pins',
        filter: ['==', ['get', 'n'], -1],
        paint: {
          'circle-color': 'rgba(249, 50, 43, 0.22)',
          'circle-radius': 17,
          'circle-stroke-color': '#F9322B',
          'circle-stroke-width': 2,
        },
      })
    }
    if (!m.getLayer('search-pins-circle')) {
      m.addLayer({
        id: 'search-pins-circle', type: 'circle', source: 'search-pins',
        paint: {
          'circle-color': '#F9322B',
          'circle-radius': 11,
          'circle-stroke-color': '#10151c',
          'circle-stroke-width': 1.5,
        },
      })
    }
    if (!m.getLayer('search-pins-num')) {
      m.addLayer({
        id: 'search-pins-num', type: 'symbol', source: 'search-pins',
        layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true },
        paint: { 'text-color': '#ffffff' },
      })
    }
    if (!m.getLayer('search-pins-name')) {
      m.addLayer({
        id: 'search-pins-name', type: 'symbol', source: 'search-pins',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10.5,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-optional': true,
        },
        paint: { 'text-color': '#e8eef4', 'text-halo-color': '#0e141b', 'text-halo-width': 1.2 },
      })
    }
  }

  function applySearchPins() {
    const m = map.current
    if (!m?.getSource('search-pins')) return
    m.getSource('search-pins').setData({
      type: 'FeatureCollection',
      features: (searchPinsRef.current || []).map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { n: i + 1, name: p.name || '', detail: p.detail || '' },
      })),
    })
  }

  const searchPinsRef = useRef(searchPins)
  useEffect(() => {
    searchPinsRef.current = searchPins
    if (mapReady) applySearchPins()
  }, [searchPins, mapReady])

  useEffect(() => {
    const m = map.current
    if (!mapReady || !m?.getLayer('search-pins-hover')) return
    m.setFilter('search-pins-hover', ['==', ['get', 'n'], hoverPin == null ? -1 : hoverPin + 1])
  }, [hoverPin, mapReady])

  // ── Boondock Zones β polygons ──────────────────────────────────────────────
  async function addZonesLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('zones')) {
      m.addSource('zones', { type: 'geojson', data: getZonesData() })
    }
    const vis = overlaysRef.current.zones ? 'visible' : 'none'
    if (!m.getLayer('zones-fill')) {
      m.addLayer({
        id: 'zones-fill', type: 'fill', source: 'zones',
        layout: { visibility: vis },
        paint: { 'fill-color': '#34d399', 'fill-opacity': 0.12 },
      })
    }
    if (!m.getLayer('zones-line')) {
      m.addLayer({
        id: 'zones-line', type: 'line', source: 'zones',
        layout: { visibility: vis },
        paint: { 'line-color': '#34d399', 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [4, 3] },
      })
    }
  }

  // ── Temperature filter — forecast grid over the view, contoured ───────────
  const tempFilterRef = useRef(tempFilter)
  const onTempStatusRef = useRef(onTempStatus)
  useEffect(() => { onTempStatusRef.current = onTempStatus }, [onTempStatus])
  const tempGridRef = useRef(null)      // last fetched forecast lattice
  const tempMarginsRef = useRef(null)   // margins for the current criteria
  const tempDataRef = useRef(null)      // {area, edge} GeoJSON for re-adds
  const tempTokenRef = useRef(0)        // drops stale async grid fetches
  const tempDebounceRef = useRef(null)

  function addTempLayers() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    if (!m.getSource('temp-area')) m.addSource('temp-area', { type: 'geojson', data: empty })
    if (!m.getSource('temp-edge')) m.addSource('temp-edge', { type: 'geojson', data: empty })
    // Under the site dots when they exist, so pins stay full-strength
    const before = m.getLayer('sites-clusters') ? 'sites-clusters' : undefined
    if (!m.getLayer('temp-area-fill')) {
      m.addLayer({
        id: 'temp-area-fill', type: 'fill', source: 'temp-area',
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.13 },
      }, before)
    }
    if (!m.getLayer('temp-area-line')) {
      m.addLayer({
        id: 'temp-area-line', type: 'line', source: 'temp-edge',
        paint: { 'line-color': '#38bdf8', 'line-opacity': 0.75, 'line-width': 1.4, 'line-dasharray': [3, 2] },
      }, before)
    }
  }

  function applyTempData() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    const d = tempDataRef.current
    m.getSource('temp-area')?.setData(d?.area || empty)
    m.getSource('temp-edge')?.setData(d?.edge || empty)
  }

  async function refreshTempOverlay() {
    const m = map.current
    if (!m) return
    const token = ++tempTokenRef.current
    if (!criteriaActive(tempFilterRef.current)) {
      tempGridRef.current = null
      tempMarginsRef.current = null
      tempDataRef.current = null
      applyTempData()
      applySiteElevFilter()
      onTempStatusRef.current?.({ state: 'idle' })
      return
    }
    onTempStatusRef.current?.({ state: 'loading' })
    let grid
    try {
      const b = m.getBounds()
      grid = await fetchTempGrid({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
    } catch {
      if (token !== tempTokenRef.current || map.current !== m) return
      onTempStatusRef.current?.({ state: 'error' })
      showToast(mapContainer.current, 'Weather forecast unavailable — temperature filter is paused')
      return
    }
    if (token !== tempTokenRef.current || map.current !== m) return
    const margins = gridMargins(grid, tempFilterRef.current)
    tempGridRef.current = grid
    tempMarginsRef.current = margins
    tempDataRef.current = gridToGeoJSON(grid, margins)
    applyTempData()
    applySiteElevFilter()
    let pass = 0, total = 0
    for (const v of margins) {
      if (!Number.isNaN(v)) { total++; if (v >= 0) pass++ }
    }
    onTempStatusRef.current?.({ state: 'ok', at: Date.now(), pass, total })
  }

  useEffect(() => {
    tempFilterRef.current = tempFilter
    if (mapReady) refreshTempOverlay()
  }, [tempFilter, mapReady])

  // ── Site elevation filter — refilter source data so clusters stay honest ──
  const elevRangeRef = useRef({ min: siteMinElev, max: siteMaxElev })
  useEffect(() => { elevRangeRef.current = { min: siteMinElev, max: siteMaxElev } }, [siteMinElev, siteMaxElev])
  const siteKindsRef = useRef(siteKinds)
  useEffect(() => { siteKindsRef.current = siteKinds }, [siteKinds])

  function applySiteElevFilter() {
    const m = map.current
    const src = m?.getSource('sites')
    if (!src) return
    const full = getSitesData()
    const { min, max } = elevRangeRef.current
    const kinds = siteKindsRef.current
    const tGrid = tempGridRef.current
    const tMargins = tempMarginsRef.current
    if (min == null && max == null && kinds == null && tGrid == null) {
      src.setData(full)
      return
    }
    src.setData({
      ...full,
      features: full.features.filter(f => {
        if (kinds != null && !kinds.includes(f.properties.kind)) return false
        if (tGrid && tMargins) {
          const [lng, lat] = f.geometry.coordinates
          const mv = marginAt(tGrid, tMargins, lng, lat)
          // null = outside the forecast grid → unknown, keep visible
          if (mv != null && mv < 0) return false
        }
        const e = f.properties.elev_ft
        if (e == null) return true
        return (min == null || e >= min) && (max == null || e <= max)
      }),
    })
  }

  useEffect(() => {
    if (mapReady) applySiteElevFilter()
  }, [siteMinElev, siteMaxElev, siteKinds, mapReady])

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
        const marker = markersRef.current[wp.id]
        marker.setLngLat([wp.lng, wp.lat])
        marker.getElement().innerHTML = markerSvgHtml(wp, wpColors)   // icon/status/colors may have changed
        const popup = marker.getPopup()
        popup?.setHTML(waypointPopupHtml(wp))
        // setHTML resets the weather slot; refill if the popup is showing
        if (popup?.isOpen?.()) attachWeather(popup, wp.lat, wp.lng)
        return
      }

      const el = document.createElement('div')
      el.className = 'bdk-marker'
      el.style.cssText = `
        width: 30px; height: 38px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
        overflow: visible;
      `
      el.innerHTML = markerSvgHtml(wp, wpColors)

      const popup = new maplibregl.Popup({ offset: [0, -30], closeButton: true, maxWidth: '260px' })
        .setHTML(waypointPopupHtml(wp))
      const wpId = wp.id
      popup.on('open', () => {
        const ll = marker.getLngLat()
        attachWeather(popup, ll.lat, ll.lng)
        // Delegate on the popup container: setHTML() (marker-update path)
        // replaces the content nodes, so listeners bound to them get wiped
        popup.getElement()?.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-wp-edit]')) {
            popup.remove()
            onWaypointEdit?.(wpId)
            return
          }
          const del = ev.target.closest('[data-wp-delete]')
          if (del) {
            // two-tap confirm; no blocking dialogs in the field
            if (del.dataset.armed) {
              popup.remove()
              onWaypointDelete?.(wpId)
            } else {
              del.dataset.armed = '1'
              del.textContent = 'Confirm delete?'
            }
          }
        })
      })

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([wp.lng, wp.lat])
        .setPopup(popup)
        .addTo(map.current)

      // No stopPropagation: MapLibre toggles the marker's popup from the
      // map's own click event, so swallowing it here kills popups entirely
      el.addEventListener('click', () => {
        onWaypointClick?.(wp)
      })

      markersRef.current[wp.id] = marker
    })
  }, [waypoints, mapReady, wpColors])

  // Highlight selected waypoint — scale the inner SVG, never the marker
  // element itself: MapLibre positions markers via transform on that element,
  // so touching it teleports the pin to the map's top-left corner
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const el = marker.getElement()
      const svg = el.querySelector('svg')
      const isSelected = selectedWaypoint?.id === id
      el.style.zIndex = isSelected ? '10' : '1'
      if (svg) {
        svg.style.transformOrigin = '50% 100%'
        svg.style.transform = isSelected ? 'scale(1.25)' : 'scale(1)'
      }
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

// Every state has a spots + zones file in web/public/data (see
// shared/stateBounds.js). They load lazily as the viewport reaches each
// state and merge into accumulating collections; below DATA_MIN_ZOOM
// nothing loads, since a national view would pull all fifty at once.
const DATA_MIN_ZOOM = 4.5
const VIEW_PAD_DEG = 0.3
const FETCH_RETRY_MS = 30000   // failed fetches (offline) pause before retrying

const stateData = {
  loaded: new Set(),
  inflight: new Set(),
  failedAt: {},
  sites: [],
  zones: [],
}

function getSitesData() {
  return { type: 'FeatureCollection', features: stateData.sites }
}

function getZonesData() {
  return { type: 'FeatureCollection', features: stateData.zones }
}

function statesInView(m) {
  if (m.getZoom() < DATA_MIN_ZOOM) return []
  const b = m.getBounds()
  const w = b.getWest() - VIEW_PAD_DEG, e = b.getEast() + VIEW_PAD_DEG
  const s = b.getSouth() - VIEW_PAD_DEG, n = b.getNorth() + VIEW_PAD_DEG
  return Object.keys(STATE_BOUNDS).filter(st => {
    const [sw, ss, se, sn] = STATE_BOUNDS[st]
    return sw <= e && se >= w && ss <= n && sn >= s
  })
}

async function loadStateFiles(st) {
  const get = async (name) => {
    const r = await fetch(import.meta.env.BASE_URL + `data/${name}-${st}.geojson`)
    if (!r.ok) throw new Error(`${name}-${st} HTTP ${r.status}`)
    return r.json()
  }
  const [spots, zones] = await Promise.all([get('spots'), get('boondock-zones')])
  stateData.sites.push(...spots.features)
  stateData.zones.push(...zones.features)
}

async function ensureStatesLoaded(m, onNewData) {
  const now = Date.now()
  const wanted = statesInView(m).filter(st =>
    !stateData.loaded.has(st) && !stateData.inflight.has(st) &&
    now - (stateData.failedAt[st] || 0) > FETCH_RETRY_MS)
  if (!wanted.length) return
  wanted.forEach(st => stateData.inflight.add(st))
  const results = await Promise.allSettled(wanted.map(st => loadStateFiles(st)))
  let fresh = false
  results.forEach((r, i) => {
    stateData.inflight.delete(wanted[i])
    if (r.status === 'fulfilled') { stateData.loaded.add(wanted[i]); fresh = true }
    else stateData.failedAt[wanted[i]] = Date.now()
  })
  if (fresh) onNewData?.()
}

const SITE_SRC_CREDIT = (src) => {
  const s = String(src || '')
  if (s.startsWith('overture')) return '© Overture Maps Foundation'
  if (s === 'ridb') return 'Recreation.gov RIDB (CC-BY 4.0)'
  if (s === 'wadnr') return 'Washington DNR'
  return '© OpenStreetMap contributors'
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Star polygon for favorite badges, centered on the marker's shoulder
const STAR_POINTS = '27,-2.5 28.35,1.14 32.23,1.3 29.19,3.71 30.23,7.45 27,5.3 23.77,7.45 24.81,3.71 21.77,1.3 25.65,1.14'

function markerSvgHtml(wp, wpColors) {
  const color = wp.color || wpColors?.[wp.icon] || WAYPOINT_COLORS[wp.icon] || WAYPOINT_COLORS.generic
  const svgInner = MARKER_SVG[wp.icon] || MARKER_SVG.generic
  const badge = statusBadgeColor(wp)
  const badgeSvg = !badge ? '' : wp.favorite
    ? `<circle cx="27" cy="2.5" r="6.8" fill="#10151c" stroke="${badge}" stroke-width="1.3"/>
       <polygon points="${STAR_POINTS}" fill="${badge}"/>`
    : `<circle cx="27" cy="3" r="5" fill="${badge}" stroke="#10151c" stroke-width="1.5"/>`
  return `
    <svg width="30" height="38" viewBox="0 0 30 38" style="overflow:visible;transition:transform 0.12s">
      <path d="M15 0C6.72 0 0 6.72 0 15c0 10.5 15 23 15 23s15-12.5 15-23C30 6.72 23.28 0 15 0z"
        fill="${color}" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/>
      <g transform="translate(6, 5) scale(0.75)" fill="none" stroke="white" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        ${svgInner}
      </g>
      ${badgeSvg}
    </svg>
  `
}

function waypointPopupHtml(wp) {
  const status = WP_STATUS_META[wp.status]
  const badge = statusBadgeColor(wp)
  const statusLine = status || wp.favorite
    ? `<div style="font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:${badge};margin-bottom:3px">${wp.favorite ? '★ ' : '● '}${status ? status.label : 'Favorite'}</div>`
    : ''
  const labels = (wp.labels || []).length
    ? `<div style="margin:4px 0 2px">${wp.labels.map(l => `<span style="display:inline-block;font-size:10px;padding:1px 7px;margin:1px 3px 1px 0;border-radius:100px;background:rgba(255,255,255,0.08);color:rgba(232,238,244,.8)">${esc(l)}</span>`).join('')}</div>`
    : ''
  const ratings = WP_RATING_KEYS
    .filter(rk => wp.ratings?.[rk.id])
    .map(rk => `<div style="font-size:11px;color:rgba(232,238,244,.7)">${rk.label}: <span style="color:#fbbf24">${'★'.repeat(wp.ratings[rk.id])}</span><span style="color:rgba(255,255,255,.25)">${'★'.repeat(5 - wp.ratings[rk.id])}</span></div>`)
    .join('')
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;">
      <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(wp.name)}</div>
      ${statusLine}
      ${wp.notes ? `<div style="font-size:12px;color:rgba(255,255,255,0.55);margin-bottom:4px">${esc(wp.notes)}</div>` : ''}
      ${labels}
      ${ratings}
      <div style="font-size:11px;color:rgba(255,255,255,0.35);font-variant-numeric:tabular-nums;margin-top:3px">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}${wp.elev_ft != null ? ` · ${Number(wp.elev_ft).toLocaleString()} ft` : ''}</div>
      ${weatherHtml()}
      ${directionsHtml(wp.lat, wp.lng)}
      <div style="display:flex;gap:6px;margin-top:8px">
        <button data-wp-edit class="btn-secondary" style="flex:1;padding:5px 10px;font-size:11.5px">Edit</button>
        <button data-wp-delete class="btn-danger" style="flex:1;padding:5px 10px;font-size:11.5px;justify-content:center">Delete</button>
      </div>
    </div>`
}

const SITE_KIND_LABELS = { campsite: 'Campsite', rv_park: 'RV park', dump: 'Dump station', water: 'Water fill', trailhead: 'Trailhead' }

// ── Popup weather card — Open-Meteo (CC-BY 4.0) ─────────────────────────────
// Every point popup carries this block; attachWeather() fills it in once the
// (cached) forecast arrives, same async pattern as the elevation readout.

function weatherHtml() {
  return `
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08)">
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(232,238,244,.55);display:flex;justify-content:space-between"><span>Weather</span><span style="text-transform:none;letter-spacing:0">Open-Meteo</span></div>
      <div data-weather-body style="font-size:11px;color:rgba(232,238,244,.55);margin-top:3px">Loading forecast…</div>
    </div>`
}

function forecastBodyHtml(fc) {
  const chips = fc.days.slice(0, 8).map(d => {
    const [label, emoji] = wmoInfo(d.code)
    const dow = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
    const wet = d.precipProb != null && d.precipProb >= 30
    const tip = `${d.date}: ${label} · high ${Math.round(d.hi)}° low ${Math.round(d.lo)}° · precip ${d.precipProb ?? 0}%${d.precipIn > 0.005 ? ` (${d.precipIn}in)` : ''} · wind ${Math.round(d.wind)} mph`
    return `<span title="${esc(tip)}" style="flex:1 0 44px;text-align:center;background:rgba(255,255,255,0.05);border-radius:5px;padding:3px 2px;line-height:1.3">
      <span style="font-size:9px;color:rgba(232,238,244,.55)">${esc(dow)}</span><br>
      <span style="font-size:11px">${emoji}</span><br>
      <span style="font-size:9.5px;color:rgba(232,238,244,.9)">${Math.round(d.hi)}°<span style="color:rgba(232,238,244,.45)">/${Math.round(d.lo)}°</span></span>${wet ? `<br><span style="font-size:8.5px;color:#38bdf8">☂ ${d.precipProb}%</span>` : ''}
    </span>`
  }).join('')
  const rest = fc.days.slice(8)
  const restLine = rest.length ? (() => {
    const hi = Math.max(...rest.map(d => d.hi))
    const lo = Math.min(...rest.map(d => d.lo))
    const wetSum = rest.reduce((s, d) => s + (d.precipIn || 0), 0)
    return `<div style="font-size:10px;color:rgba(232,238,244,.5);margin-top:4px">Days 9–16: ${Math.round(hi)}°/${Math.round(lo)}°${wetSum > 0.005 ? ` · ${wetSum.toFixed(2)}" precip` : ''}${fc.elevFt != null ? ` · model elev ${fc.elevFt.toLocaleString()} ft` : ''}</div>`
  })() : ''
  const cur = fc.current
  const nowLine = cur
    ? `<div style="font-size:11.5px;color:rgba(232,238,244,.85)">Now ${cur.temp}° · ${esc(wmoInfo(cur.code)[0])} · wind ${cur.wind} mph · ${cur.humidity}% RH</div>`
    : ''
  return `${nowLine}<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">${chips}</div>${restLine}`
}

function attachWeather(popup, lat, lng) {
  pointForecast(lat, lng)
    .then(fc => {
      if (!popup.isOpen?.()) return
      const slot = popup.getElement()?.querySelector('[data-weather-body]')
      if (slot) slot.innerHTML = forecastBodyHtml(fc)
    })
    .catch(() => {
      const slot = popup.getElement()?.querySelector('[data-weather-body]')
      if (slot) slot.textContent = 'Forecast unavailable — needs a connection'
    })
}

// Directions handoff — standard Apple/Google Maps deep links
function directionsHtml(lat, lng) {
  const apple = `https://maps.apple.com/?daddr=${lat},${lng}`
  const google = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  return `
    <div style="font-size:11px;margin-top:7px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
      Directions:
      <a href="${apple}" target="_blank" rel="noreferrer" style="color:#38bdf8">Apple</a> ·
      <a href="${google}" target="_blank" rel="noreferrer" style="color:#38bdf8">Google</a>
      <button data-copy-coords="${coords}" title="Copy coordinates for any app"
        style="all:unset;cursor:pointer;color:#8babd0;display:inline-flex;align-items:center;gap:3px;margin-left:auto;padding:1px 4px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy coords
      </button>
    </div>`
}

// Clipboard with a fallback for contexts where the async API is unavailable
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = t
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

const ROAD_LAYER_IDS = ['road-motorway', 'road-primary', 'road-secondary', 'road-minor', 'road-track', 'road-path']
const ROAD_CLASS_LABELS = {
  motorway: 'Highway', trunk: 'Highway', primary: 'Primary road', secondary: 'Road',
  tertiary: 'Road', minor: 'Local road', service: 'Service road', track: 'Track / forest road', path: 'Path / trail',
}

// ArcGIS identify — resolves null on miss or timeout
async function identifyArc(idUrl, layersParam, m, lngLat) {
  if (!idUrl) return null
  const b = m.getBounds()
  const canvas = m.getCanvas()
  const params = new URLSearchParams({
    geometry: `${lngLat.lng},${lngLat.lat}`,
    geometryType: 'esriGeometryPoint',
    sr: '4326',
    layers: layersParam,
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

const identifyMvum = (m, lngLat) => identifyArc(OVERLAY_LAYERS.mvum.identifyUrl, 'visible:1,2', m, lngLat)
const identifyTrail = (m, lngLat) => identifyArc(OVERLAY_LAYERS['usfs-trails'].identifyUrl, 'all', m, lngLat)

function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function openTrailPopup(m, lngLat, result) {
  const a = result.attributes || {}
  const name = titleCase(a.TRAIL_NAME) || 'Forest trail'
  const motorized = a.TERRA_MOTORIZED === 'Y'
  const rows = []
  rows.push(motorized ? 'Motorized use allowed — check MVUM' : 'Non-motorized — hiking / stock')
  if (a.TRAIL_SURFACE) rows.push(`Surface: ${esc(titleCase(String(a.TRAIL_SURFACE).split('-').pop()))}`)
  if (a.TYPICAL_TREAD_WIDTH) rows.push(`Tread: ${esc(String(a.TYPICAL_TREAD_WIDTH).split('-').slice(1).join('-').trim() || a.TYPICAL_TREAD_WIDTH)}`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:170px">
      <div style="font-size:13px;font-weight:600">${esc(name)} Trail</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(232,238,244,.55);margin:2px 0 5px">USFS National Forest trail</div>
      <div style="font-size:11.5px;color:rgba(232,238,244,.75);line-height:1.5">${rows.join('<br>')}</div>
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng)
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
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng)
}

function openPointInfoPopup(m, lngLat, onSave, zoneProps = null) {
  const inZone = zoneProps != null
  const flat = inZone && zoneProps.flat_pct != null ? Number(zoneProps.flat_pct) : null
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:190px">
      ${inZone ? `<div style="font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:#34d399;margin-bottom:5px">Possible boondocking zone · beta</div>` : ''}
      <div style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}</div>
      <div style="font-size:11.5px;color:rgba(232,238,244,.65);margin-top:3px" data-elev>Elevation: …</div>
      ${flat != null ? `<div style="font-size:11px;color:rgba(232,238,244,.6);margin-top:3px">≈${flat}% of sampled ground ≤ 12% grade</div>` : ''}
      ${inZone ? `<div style="font-size:10.5px;color:rgba(232,238,244,.5);margin-top:5px;line-height:1.45">USFS land near a legal MVUM road. Heuristic only — verify rules, closures, and conditions locally.</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Save waypoint
      </button>
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '250px' })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng)
  const root = popup.getElement()
  elevationAt(lngLat.lng, lngLat.lat)
    .then(meters => {
      const el = root.querySelector('[data-elev]')
      if (el && meters != null) el.textContent = `Elevation: ${Math.round(meters * 3.28084).toLocaleString()} ft`
    })
    .catch(() => {})
  root.querySelector('[data-save-wp]')?.addEventListener('click', () => {
    popup.remove()
    onSave?.(lngLat)
  })
  return popup
}

const DETAIL_TIERS = {
  rich:   { color: '#22c55e', text: 'Well-documented record' },
  fair:   { color: '#fbbf24', text: 'Some detail on record' },
  sparse: { color: '#9fb4c8', text: 'Sparse record — verify before relying on it' },
}

function openSearchPinPopup(m, lngLat, props, onSaveSpot) {
  const tier = DETAIL_TIERS[props.detail]
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:180px">
      <div style="font-size:13px;font-weight:600">${props.n}. ${esc(props.name || 'Result')}</div>
      ${tier ? `<div style="font-size:10.5px;color:rgba(232,238,244,.6);margin-top:3px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${tier.color};margin-right:5px"></span>${tier.text}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="font-size:9.5px;color:rgba(232,238,244,.35);margin-top:7px">Source: © OpenStreetMap contributors</div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 12, maxWidth: '250px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng)
  popup.getElement().querySelector('[data-save-wp]')?.addEventListener('click', () => {
    onSaveSpot?.({ name: props.name, lat: lngLat.lat, lng: lngLat.lng })
    popup.remove()
  })
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
  if (p.addr) rows.push(`Address: ${esc(p.addr)}`)
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
      ${weatherHtml()}
      ${directionsHtml(lat, lng)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="font-size:9.5px;color:rgba(232,238,244,.35);margin-top:7px">${p.elev_ft != null ? `${Number(p.elev_ft).toLocaleString()} ft · ` : ''}${SITE_SRC_CREDIT(p.src)}</div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 10, maxWidth: '270px' })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(m)
  attachWeather(popup, lat, lng)
  popup.getElement().querySelector('[data-save-wp]')?.addEventListener('click', () => {
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
