import { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import { BASE_LAYERS, OVERLAY_LAYERS, DEFAULT_CENTER, DEFAULT_ZOOM, SITE_KINDS } from '../../shared/layers'
import { SITE_BADGE_KINDS, SITE_FALLBACK_KIND, drawSiteGlyph } from '../../shared/siteIcons'
import { buildBoondockStyle, BOONDOCK_GLYPHS, buildRoadShieldLayer, omtSource, refreshOmtTemplate } from '../../shared/boondockStyle'
import { installProtocol, toProtocolUrl, listPacks } from '../../shared/offlineTiles'
import { pmProtocol, pmtilesUrl } from '../../shared/pmtilesCache'
import { elevationAt, fetchElevGrid, elevMargins } from '../../shared/elevation'
import { pointForecast, airQuality, aqiBand, wmoInfo, fetchTempGrid, gridMargins, gridToGeoJSON, marginAt, criteriaActive } from '../../shared/weather'
import { WP_STATUS_META, WP_RATING_KEYS, statusBadgeColor } from '../../shared/waypointMeta'
import { STATE_BOUNDS } from '../../shared/stateBounds'
import { WAYPOINT_COLORS } from './Icons'
import { communityEnabled, submitCheckin, flagSpot, loadCommunityFeatures, prunePendingReports } from '../../shared/community'
import { route as routeOverGraph, distanceToRouteMi } from '../../shared/router'
import { loadManifest, loadGraph, routingAvailableSync, coversPointSync } from '../../shared/routeGraph'
import {
  MVUM_ROAD_SYMBOL, MVUM_TRAIL_SYMBOL, SURFACE_CODES, MAINT_LEVELS, ROAD_CHARACTER,
  TRAIL_CLASS, vehicleList, trailUses, trailIsMotorized, formatSeason, describeCode,
} from '../../shared/usfsCodes'

// All tile requests go through boondock:// so downloaded offline packs are
// used first and the network is the fallback (see shared/offlineTiles.js)
installProtocol(maplibregl)

// Self-hosted vector tiles (RoadCore row 98, MVUM + trails row 83) read from
// single .pmtiles archives over HTTP range requests — no tile server, and
// only the few KB the screen needs rather than a 49 MB file.
//
// Each archive is registered against a CachingSource, which keeps the ranges
// it reads in IndexedDB. Without that the layers died the moment you lost
// signal: the browser Cache API cannot store the 206 responses a range
// request produces, so nothing else in the stack could hold them
// (VISION row 123).
maplibregl.addProtocol('pmtiles', pmProtocol.tile)

// Learn OpenFreeMap's rotating tile template while we can, so a later launch
// with no signal can still build a style that loads (VISION row 126).
refreshOmtTemplate()

const cachedPMTilesUrl = (file) => pmtilesUrl(import.meta.env.BASE_URL, file)

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
    wpColors, onWaypointEdit, onWaypointDelete, onReportSpot,
    liveReadoutOn, onToggleLiveReadout,
    pickMode, onAddWaypoint, addActive,
    editingWaypointId, onWaypointRelocate,
    navTarget, userFix, onNavigate, onSunPath, onRoute, vehicle,
    sighting,
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
  const liveToggleBtnRef = useRef(null)
  const onToggleLiveRef = useRef(onToggleLiveReadout)
  const addWpBtnRef = useRef(null)
  const onAddWpRef = useRef(onAddWaypoint)
  const pickModeRef = useRef(pickMode)
  const onRelocateRef = useRef(onWaypointRelocate)
  const onNavigateRef = useRef(onNavigate)
  const onSunPathRef = useRef(onSunPath)
  const navTargetRef = useRef(navTarget)
  const sightingRef = useRef(sighting)
  const clearRouteRef = useRef(null)
  const onRouteRef = useRef(onRoute)
  const vehicleBitRef = useRef(0)
  const userFixRef = useRef(userFix)

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

  // Keep the live-readout toggle button in step with App state
  useEffect(() => { onToggleLiveRef.current = onToggleLiveReadout })
  useEffect(() => {
    const btn = liveToggleBtnRef.current
    if (!btn) return
    btn.classList.toggle('active', !!liveReadoutOn)
    btn.setAttribute('aria-pressed', liveReadoutOn ? 'true' : 'false')
  }, [liveReadoutOn])

  // Keep the add-waypoint control + relocate handler current without recreating
  // the map (VISION rows 93/94). addActive lights the button while the chooser
  // is open or pick-mode is armed.
  useEffect(() => { onAddWpRef.current = onAddWaypoint })
  useEffect(() => { onRelocateRef.current = onWaypointRelocate })
  useEffect(() => { onNavigateRef.current = onNavigate })
  useEffect(() => { onSunPathRef.current = onSunPath })
  useEffect(() => { pickModeRef.current = pickMode }, [pickMode])
  useEffect(() => {
    const btn = addWpBtnRef.current
    if (!btn) return
    btn.classList.toggle('active', !!addActive)
    btn.setAttribute('aria-pressed', addActive ? 'true' : 'false')
  }, [addActive])

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

  // Delegated "Guide me here" (VISION row 90): every point card's directions
  // row carries a compass button, so one handler serves them all. Sets the
  // navigation target in App, which auto-shows the live readout + ribbon.
  useEffect(() => {
    const onNavClick = (e) => {
      const btn = e.target.closest?.('[data-nav-lat]')
      if (!btn) return
      const lat = parseFloat(btn.dataset.navLat)
      const lng = parseFloat(btn.dataset.navLng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      onNavigateRef.current?.({ lat, lng, name: btn.dataset.navName || '' })
      // close the popup the button lives in, so the ribbon has the stage
      btn.closest('.maplibregl-popup')?.querySelector('.maplibregl-popup-close-button')?.click()
    }
    document.addEventListener('click', onNavClick)
    return () => document.removeEventListener('click', onNavClick)
  }, [])

  // Delegated "Drive me there" — the routed sibling of the beeline button
  // above. Only rendered where a graph covers both ends (see routeGraph.js),
  // so this handler never has to explain an absent one.
  useEffect(() => {
    const onRouteClick = (e) => {
      const btn = e.target.closest?.('[data-route-lat]')
      if (!btn) return
      const lat = parseFloat(btn.dataset.routeLat)
      const lng = parseFloat(btn.dataset.routeLng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      btn.closest('.maplibregl-popup')?.querySelector('.maplibregl-popup-close-button')?.click()
      startRouteRef.current?.({ lat, lng, name: btn.dataset.routeName || '' })
    }
    document.addEventListener('click', onRouteClick)
    return () => document.removeEventListener('click', onRouteClick)
  }, [])

  // Delegated "Sun & shade" (VISION row 132), same shape as the Guide button:
  // every point card carries one, and one handler serves them all.
  useEffect(() => {
    const onSunClick = (e) => {
      const btn = e.target.closest?.('[data-sun-lat]')
      if (!btn) return
      const lat = parseFloat(btn.dataset.sunLat)
      const lng = parseFloat(btn.dataset.sunLng)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
      onSunPathRef.current?.({ lat, lng, name: btn.dataset.sunName || '' })
    }
    document.addEventListener('click', onSunClick)
    return () => document.removeEventListener('click', onSunClick)
  }, [])

  // Keep refs in sync so callbacks always see current state
  useEffect(() => { overlaysRef.current = overlays }, [overlays])
  const downloadModeRef = useRef(downloadMode)
  useEffect(() => { downloadModeRef.current = downloadMode }, [downloadMode])

  useImperativeHandle(ref, () => ({
    clearRoute: () => clearRouteRef.current?.(),
    flyTo: (opts) => map.current?.flyTo(opts),
    fitBounds: (bounds, opts) => map.current?.fitBounds(bounds, opts),
    getMap: () => map.current,
    // A just-submitted community report appears immediately as a pending pin
    addCommunityFeature: (feature) => {
      stateData.community.push(feature)
      applySiteElevFilter()
    },
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
        // Vector source purely for route numbers (VISION row 105). ESRI's
        // reference tiles label places and counties but carry no highway
        // numbers at all — verified over the Willamette Valley, where Salem,
        // Albany and Corvallis are named and I-5 running between them is not.
        omt: omtSource(),
      },
      layers: [
        { id: 'base-layer', type: 'raster', source: 'base' },
        // Rides the Names & Labels switch, since that is where a user looks
        // for labels over imagery. Night palette regardless of theme: this
        // only ever draws over aerial imagery or a topo raster, both dark
        // enough that bright text with a dark halo is the readable choice.
        buildRoadShieldLayer('night', 'names-shield', overlaysRef.current.names ? 'visible' : 'none'),
      ],
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
      // Tilt and rotate stay available, but only deliberately (VISION row 88).
      // A two-finger trackpad drag is far too easy to fire by accident, and
      // landing in a pitched 3D view while scouting a road is disorienting on
      // a north-up planning map. Right-drag / ctrl-drag still rotates.
      touchPitch: false,
    })
    map.current.touchZoomRotate.disableRotation()

    // visualizePitch tilts the needle, so the compass shows you're off-flat
    map.current.addControl(
      new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
      'top-right'
    )
    map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 200, unit: 'imperial' }), 'bottom-right')

    // Add-waypoint control (VISION row 93) — opens the chooser (at my location
    // / pick on the map). Hand-rolled like the live toggle so it stacks with
    // the built-in controls; the icon is Icons.jsx's MapPinPlus.
    const addWpBtn = document.createElement('button')
    addWpBtn.type = 'button'
    addWpBtn.className = 'addwp-toggle-btn'
    addWpBtn.title = 'Add a waypoint — at my location or a point I pick'
    addWpBtn.setAttribute('aria-label', 'Add a waypoint')
    addWpBtn.setAttribute('aria-pressed', 'false')
    addWpBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-4.42-3.58-8-8-8s-8 3.58-8 8c0 5.25 8 13 8 13"/><circle cx="11.5" cy="10" r="3"/><line x1="19" y1="15" x2="19" y2="21"/><line x1="16" y1="18" x2="22" y2="18"/></svg>'
    addWpBtn.addEventListener('click', () => onAddWpRef.current?.())
    addWpBtnRef.current = addWpBtn
    map.current.addControl({
      onAdd: () => {
        const box = document.createElement('div')
        box.className = 'maplibregl-ctrl maplibregl-ctrl-group'
        box.appendChild(addWpBtn)
        return box
      },
      onRemove: () => { addWpBtn.parentElement?.remove() },
    }, 'bottom-right')

    // Live instrument cluster toggle (VISION row 89) — a hand-rolled control
    // so it stacks with the built-ins, just above Locate. The inline gauge
    // SVG follows the MARKER_SVG pattern, in the Icons.jsx monoline style.
    const liveBtn = document.createElement('button')
    liveBtn.type = 'button'
    liveBtn.className = 'live-toggle-btn'
    liveBtn.title = 'Live readout — compass, speed, elevation'
    liveBtn.setAttribute('aria-label', 'Toggle live readout')
    liveBtn.setAttribute('aria-pressed', 'false')
    liveBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>'
    liveBtn.addEventListener('click', () => onToggleLiveRef.current?.())
    liveToggleBtnRef.current = liveBtn
    map.current.addControl({
      onAdd: () => {
        const box = document.createElement('div')
        box.className = 'maplibregl-ctrl maplibregl-ctrl-group'
        box.appendChild(liveBtn)
        return box
      },
      onRemove: () => { liveBtn.parentElement?.remove() },
    }, 'bottom-right')

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    })
    map.current.addControl(geolocate, 'bottom-right')

    // MapLibre's compass only resets bearing, so a pitched map stays pitched
    // and there's no obvious way back to flat. Reset both.
    const compass = mapContainer.current?.querySelector('.maplibregl-ctrl-compass')
    compass?.addEventListener('click', () => {
      map.current?.easeTo({ bearing: 0, pitch: 0, duration: 300 })
    })

    // Several overlays are rendered on demand by third-party servers — the
    // USFS ArcGIS host in particular does go down (verified 2026-07-25:
    // apps.fs.usda.gov/arcx returned HTTP 500 for both MVUM and Trails). The
    // layer then simply doesn't draw, which reads as a bug in this app. Name
    // what actually happened instead, once per source (VISION row 82).
    const BASE_SOURCES = new Set(['base', 'omt'])
    map.current.on('error', (e) => {
      if (BASE_SOURCES.has(e?.sourceId)) noteBaseTileFailure()
    })
    map.current.on('sourcedata', (e) => {
      if (BASE_SOURCES.has(e?.sourceId) && e.isSourceLoaded) noteBaseTileSuccess()
    })

    const reportedBadSources = new Set()
    map.current.on('error', (e) => {
      const srcId = e?.sourceId
      if (!srcId || reportedBadSources.has(srcId)) return
      const entry = OVERLAY_LAYERS[srcId]
        ? [srcId, OVERLAY_LAYERS[srcId]]
        : Object.entries(OVERLAY_LAYERS).find(([id]) => srcId.startsWith(`${id}-`))
      if (!entry || !overlaysRef.current[entry[0]]) return   // only if it's switched on
      reportedBadSources.add(srcId)
      showToast(
        mapContainer.current,
        `${entry[1].label} isn't loading right now — the service that draws it isn't responding. Everything else on the map still works.`
      )
    })

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
      addRoadcoreLayers()
      // After addOverlaySources(), so the live fill-in rasters sit underneath
      // their own vector lines rather than painting over them
      addMvumVectorLayers()
      addTrailsVectorLayers()
      addWildfireLayers()
      addZonesLayers()
      addTempLayers()
      addElevLayers()
      addSearchPinsLayers()
      addNavLayers()
      addSightLayers()
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
    map.current.on('load', () => {
      loadCommunityLayer().then(any => { if (any) applySiteElevFilter() })
    })

    // Temperature filter follows the view — refresh the forecast grid after
    // panning settles (cached lattice nodes make small moves free)
    map.current.on('moveend', () => {
      if (!criteriaActive(tempFilterRef.current)) return
      clearTimeout(tempDebounceRef.current)
      tempDebounceRef.current = setTimeout(() => refreshTempOverlay(), 700)
    })

    // The elevation band follows the view too. Cheaper than the forecast grid
    // (DEM tiles, mostly already cached for the hillshade) so a shorter wait.
    map.current.on('moveend', () => {
      const { min, max } = elevRangeRef.current
      if (min == null && max == null) return
      clearTimeout(elevDebounceRef.current)
      elevDebounceRef.current = setTimeout(() => refreshElevOverlay(), 350)
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
      // Pick-mode (VISION row 93): the next tap drops a waypoint straight into
      // the save dialog, skipping the info card. App clears the mode.
      if (pickModeRef.current) {
        onMapClick?.({ lng: e.lngLat.lng, lat: e.lngLat.lat })
        return
      }
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
      // Tap a forest road or trail for its USFS details. The self-hosted
      // vector lines answer instantly and offline; the live identify is only
      // the fallback for the motorized trails the bulk file has no geometry
      // for, which is why it now asks about sublayer 2 alone (VISION row 83).
      if (overlaysRef.current.mvum && m.getZoom() >= 9) {
        const roadHit = pickFeature(m, e.point, MVUM_PICK_LAYERS)
        if (roadHit) {
          openMvumRoadPopup(m, e.lngLat, roadHit)
          return
        }
        const mtHit = pickFeature(m, e.point, MVUM_TRAIL_PICK_LAYERS)
        if (mtHit) {
          openMvumTrailPopup(m, e.lngLat, mtHit)
          return
        }
        const road = await identifyMvum(m, e.lngLat)
        if (road && map.current === m) {
          openMvumPopup(m, e.lngLat, road)
          return
        }
      }
      if (overlaysRef.current['blm-roads'] && m.getZoom() >= 9) {
        const road = await identifyBlm(m, e.lngLat)
        if (road && map.current === m) {
          openBlmPopup(m, e.lngLat, road)
          return
        }
      }
      if (overlaysRef.current.roadcore && m.getZoom() >= 9) {
        const rcLayers = ['roadcore-open', 'roadcore-closed'].filter(id => m.getLayer(id))
        const box = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]]
        const feats = rcLayers.length ? m.queryRenderedFeatures(box, { layers: rcLayers }) : []
        if (feats.length) {
          openRoadcorePopup(m, e.lngLat, feats[0])
          return
        }
      }
      if (overlaysRef.current['usfs-trails'] && m.getZoom() >= 10) {
        const hit = pickFeature(m, e.point, ['usfs-trails-line'])
        if (hit) {
          openTrailVectorPopup(m, e.lngLat, hit)
          return
        }
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
      // Inside an active wildfire perimeter — surface the fire (VISION row 69)
      if (overlaysRef.current.wildfire && m.getLayer('wildfire-fill')) {
        const wf = m.queryRenderedFeatures(e.point, { layers: ['wildfire-fill'] })
        if (wf.length) {
          openWildfirePopup(m, e.lngLat, wf[0])
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
      infoPopupRef.current = openPointInfoPopup(m, e.lngLat, onMapClick, zoneProps, onReportSpot)
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
      addRoadcoreLayers()
      addMvumVectorLayers()
      addTrailsVectorLayers()
      addWildfireLayers()
      addZonesLayers()
      addTempLayers()
      applyTempData()
      addElevLayers()
      applyElevData()
      addSearchPinsLayers()
      applySearchPins()
      addNavLayers()
      applyNavData()
      addSightLayers()
      applySightData()
      applyOverlayVisibility()
      applyPackAreasVisibility()
      applySiteElevFilter()
      if (overlaysRef.current.wildfire) loadWildfire()   // base swap wiped the fetched perimeters
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
    // The Boondock bases draw their own place names and route numbers, so
    // stacking ESRI's reference raster on top of them prints every town twice
    // — "Lynden / Lynden" (VISION row 121). That overlay exists for imagery,
    // where there are no labels at all, so it simply doesn't belong here.
    const vectorBase = Boolean(BASE_LAYERS[baseLayerRef.current]?.custom)
    Object.entries(OVERLAY_LAYERS).forEach(([id, layer]) => {
      if (layer.sites || layer.zones) return
      if (id === 'names' && vectorBase) return
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
      // One switch can own several map layers. MVUM and Trails each own a
      // live raster (the online fill-in) plus their self-hosted vector lines,
      // and all of them have to move together or the toggle half-works.
      const ids = OVERLAY_LAYER_IDS[id]
        || (def?.parts ? def.parts.map(p => `${id}-${p.key}-layer`) : [`${id}-layer`])
      ids.forEach(layerId => {
        if (m.getLayer(layerId)) {
          m.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
        }
      })
    })
  }

  // ── RoadCore — all FS roads, self-hosted vector PMTiles (VISION row 98) ───
  // Two line layers off one vector source: closed roads (maintenance level ≤1)
  // as faded grey dashes underneath, open roads (level ≥2) solid khaki on top,
  // so "a road exists" never reads as "you may drive it".
  function addRoadcoreLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('roadcore')) {
      m.addSource('roadcore', { type: 'vector', url: cachedPMTilesUrl('roadcore.pmtiles') })
    }
    const vis = overlaysRef.current.roadcore ? 'visible' : 'none'
    const lvl = ['to-number', ['coalesce', ['get', 'maint'], 0]]
    if (!m.getLayer('roadcore-closed')) {
      m.addLayer({
        id: 'roadcore-closed', type: 'line', source: 'roadcore', 'source-layer': 'roadcore',
        filter: ['<', lvl, 2], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#8a8f98', 'line-opacity': 0.5,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.3],
          'line-dasharray': [2, 2],
        },
      })
    }
    if (!m.getLayer('roadcore-open')) {
      m.addLayer({
        id: 'roadcore-open', type: 'line', source: 'roadcore', 'source-layer': 'roadcore',
        filter: ['>=', lvl, 2], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c2b280', 'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 1.9],
        },
      })
    }
  }

  // ── MVUM + trails — self-hosted vector PMTiles (VISION row 83) ────────────
  // These three archives replace three per-tile server renders. Colour carries
  // the one thing MVUM exists to tell you — who may legally drive a route —
  // and a dashed line means the permission is seasonal, so a route you can
  // only use part of the year never looks like a route you can always use.
  // 'special' is the only class that gets its own hue, because it is the only
  // one that means "this map cannot tell you — go read the forest's own".
  // Vehicle-width classes (50" or less, motorcycles) stay in the amber family
  // and are distinguished by the line weight and the popup, rather than by
  // adding three more colours to a map that already carries five.
  const MVUM_COLORS = {
    all: '#f2c14e',       // open to all vehicles, OHVs included
    narrow: '#f2c14e',    // vehicles 50" or less / wheeled OHV under 50"
    moto: '#f2c14e',      // motorcycles only
    highway: '#8fbf7f',   // street-legal vehicles only
    special: '#c77dff',   // special designation — read the forest's own map
  }
  const TRAIL_COLOR = '#8babd0'   // the sky blue trails have always used

  // Build a MapLibre match expression from one of the symbol tables, so the
  // paint and the popup are driven by the same source of truth.
  function symbolMatch(table, prop) {
    const cases = []
    Object.entries(table).forEach(([code, meta]) => {
      cases.push(Number(code), MVUM_COLORS[meta.kind] || MVUM_COLORS.special)
    })
    return ['match', ['to-number', ['coalesce', ['get', prop], 0]], ...cases, MVUM_COLORS.special]
  }

  const seasonalCodes = (table) =>
    Object.entries(table).filter(([, m]) => m.seasonal).map(([code]) => Number(code))

  function addMvumVectorLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('mvum-vec')) m.addSource('mvum-vec', { type: 'vector', url: cachedPMTilesUrl('mvum.pmtiles') })
    if (!m.getSource('mvum-trails-vec')) m.addSource('mvum-trails-vec', { type: 'vector', url: cachedPMTilesUrl('mvum-trails.pmtiles') })

    const vis = overlaysRef.current.mvum ? 'visible' : 'none'
    const sym = ['to-number', ['coalesce', ['get', 'sym'], 0]]

    // Roads: seasonal ones dashed, yearlong solid. Two layers rather than one
    // because line-dasharray is not data-driven in MapLibre.
    const roadSeasonal = seasonalCodes(MVUM_ROAD_SYMBOL)
    const roadPaint = {
      'line-color': symbolMatch(MVUM_ROAD_SYMBOL, 'sym'),
      'line-opacity': 0.92,
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.6, 12, 2.1],
    }
    if (!m.getLayer('mvum-roads-seasonal')) {
      m.addLayer({
        id: 'mvum-roads-seasonal', type: 'line', source: 'mvum-vec', 'source-layer': 'mvum',
        filter: ['in', sym, ['literal', roadSeasonal]], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'butt', 'line-join': 'round' },
        paint: { ...roadPaint, 'line-dasharray': [3, 2] },
      })
    }
    if (!m.getLayer('mvum-roads')) {
      m.addLayer({
        id: 'mvum-roads', type: 'line', source: 'mvum-vec', 'source-layer': 'mvum',
        filter: ['!', ['in', sym, ['literal', roadSeasonal]]], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'round', 'line-join': 'round' },
        paint: roadPaint,
      })
    }

    // Motorized trails: same colour family, thinner and dotted, so a trail
    // never reads as a road you could take a rig down.
    const trailSeasonal = seasonalCodes(MVUM_TRAIL_SYMBOL)
    const mtPaint = {
      'line-color': symbolMatch(MVUM_TRAIL_SYMBOL, 'sym'),
      'line-opacity': 0.9,
      'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.4, 12, 1.4],
    }
    if (!m.getLayer('mvum-trails-seasonal')) {
      m.addLayer({
        id: 'mvum-trails-seasonal', type: 'line', source: 'mvum-trails-vec', 'source-layer': 'mvum_trails',
        filter: ['in', sym, ['literal', trailSeasonal]], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'butt', 'line-join': 'round' },
        paint: { ...mtPaint, 'line-dasharray': [1, 2] },
      })
    }
    if (!m.getLayer('mvum-trails-line')) {
      m.addLayer({
        id: 'mvum-trails-line', type: 'line', source: 'mvum-trails-vec', 'source-layer': 'mvum_trails',
        filter: ['!', ['in', sym, ['literal', trailSeasonal]]], minzoom: 7,
        layout: { visibility: vis, 'line-cap': 'butt', 'line-join': 'round' },
        paint: { ...mtPaint, 'line-dasharray': [2, 1.5] },
      })
    }
  }

  function addTrailsVectorLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('usfs-trails-vec')) {
      m.addSource('usfs-trails-vec', { type: 'vector', url: cachedPMTilesUrl('trails.pmtiles') })
    }
    if (!m.getLayer('usfs-trails-line')) {
      m.addLayer({
        id: 'usfs-trails-line', type: 'line', source: 'usfs-trails-vec', 'source-layer': 'trails',
        minzoom: 8,
        layout: {
          visibility: overlaysRef.current['usfs-trails'] ? 'visible' : 'none',
          'line-cap': 'butt', 'line-join': 'round',
        },
        paint: {
          'line-color': TRAIL_COLOR,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 11, 0.95],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.7, 12, 1.8],
          'line-dasharray': [2, 1.5],
        },
      })
    }
  }

  // ── Wildfires — current NIFC perimeters, fetched live (VISION row 69) ──────
  // Off by default; the ~360 KB GeoJSON is fetched only when the layer is
  // switched on (the NIFC service is shared + rate-limited). Red areas are
  // actively burning; the popup carries a safety note, no directions.
  const wildfireLoadedRef = useRef(false)
  function addWildfireLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('wildfire-perimeters')) {
      m.addSource('wildfire-perimeters', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      wildfireLoadedRef.current = false   // fresh source (e.g. after a base-layer swap) needs a re-fetch
    }
    const vis = overlaysRef.current.wildfire ? 'visible' : 'none'
    if (!m.getLayer('wildfire-fill')) {
      m.addLayer({ id: 'wildfire-fill', type: 'fill', source: 'wildfire-perimeters', layout: { visibility: vis }, paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.22 } })
    }
    if (!m.getLayer('wildfire-line')) {
      m.addLayer({ id: 'wildfire-line', type: 'line', source: 'wildfire-perimeters', layout: { visibility: vis }, paint: { 'line-color': '#dc2626', 'line-width': 1.5, 'line-opacity': 0.9 } })
    }
  }

  async function loadWildfire() {
    const m = map.current
    if (!m?.getSource('wildfire-perimeters') || wildfireLoadedRef.current) return
    wildfireLoadedRef.current = true
    const url = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query?where=1%3D1&outFields=poly_IncidentName,attr_IncidentName,poly_GISAcres,attr_CalculatedAcres,attr_PercentContained&returnGeometry=true&outSR=4326&maxAllowableOffset=0.005&f=geojson'
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error(r.status)
      const gj = await r.json()
      map.current?.getSource('wildfire-perimeters')?.setData(gj)
    } catch {
      wildfireLoadedRef.current = false   // let a re-toggle retry
      showToast(mapContainer.current, "Couldn't load current wildfires — the fire service may be busy. Turn the layer off and on to retry.")
    }
  }

  useEffect(() => {
    if (mapReady && overlays.wildfire) loadWildfire()
  }, [overlays, mapReady])

  // ── Sites — the spots database layer ──────────────────────────────────────
  // Each kind's logo, painted once into a MapLibre image. Only the glyph is
  // baked; the disc and its coloured ring are the circle layer underneath, so
  // they stay vector-crisp and keep growing with zoom. Synchronous on purpose
  // — layer order depends on these layers landing in the load sequence where
  // they were added, not a tick later. Images are style-scoped, so a basemap
  // switch re-paints them.
  function addSiteGlyphImages(m) {
    const px = SITE_GLYPH_PX * SITE_GLYPH_RATIO
    for (const kind of SITE_BADGE_KINDS) {
      const id = siteGlyphImageId(kind)
      if (m.hasImage(id)) continue
      const cv = document.createElement('canvas')
      cv.width = px
      cv.height = px
      const ctx = cv.getContext('2d')
      drawSiteGlyph(ctx, kind, px)
      m.addImage(id, ctx.getImageData(0, 0, px, px), { pixelRatio: SITE_GLYPH_RATIO })
    }
  }

  async function addSitesLayers() {
    const m = map.current
    if (!m) return
    addSiteGlyphImages(m)
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
          // Zoomed out it stays the solid coloured dot it always was — a logo
          // has nowhere to live at 4 px. From SITE_ICON_MINZOOM it becomes the
          // dark disc the glyph sits on, the two fading into each other.
          'circle-color': ['interpolate', ['linear'], ['zoom'],
            SITE_ICON_MINZOOM - 1, SITE_KIND_COLOR,
            SITE_ICON_MINZOOM, SITE_DISC_FILL],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.8, SITE_ICON_MINZOOM, 6.5, 14, 9.5],
          // Ring carries the kind; amber overrides it for community-reported
          // spots (pending ones from this device too), whose kind is now on the
          // logo instead
          'circle-stroke-color': ['case', ['==', ['get', 'src'], 'community'], '#fbbf24', SITE_KIND_COLOR],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'],
            8, ['case', ['==', ['get', 'src'], 'community'], 1.8, 1.4],
            11, ['case', ['==', ['get', 'src'], 'community'], 2.6, 2.1]],
        },
      })
    }
    if (!m.getLayer('sites-icons')) {
      m.addLayer({
        id: 'sites-icons', type: 'symbol', source: 'sites', minzoom: SITE_ICON_MINZOOM,
        filter: ['!', ['has', 'point_count']],
        layout: {
          visibility: vis,
          'icon-image': SITE_GLYPH_IMAGE,
          'icon-size': ['interpolate', ['linear'], ['zoom'],
            SITE_ICON_MINZOOM, 0.38, 12, 0.48, 14, 0.6],
          // The disc under it already claimed the space — never drop the logo
          // off a dot that is being drawn
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
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
          'text-offset': [0, 1.6],   // clears the badge, which is bigger than the old dot
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

  // ── Beeline navigation (VISION row 90) ────────────────────────────────────
  // A dashed green line from the live GPS fix to the chosen target, plus a ring
  // on the target. Straight-line only; the compass ribbon does the turning.
  function addNavLayers() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    if (!m.getSource('nav-line')) m.addSource('nav-line', { type: 'geojson', data: empty })
    if (!m.getSource('nav-target')) m.addSource('nav-target', { type: 'geojson', data: empty })
    if (!m.getLayer('nav-line-layer')) {
      m.addLayer({
        id: 'nav-line-layer', type: 'line', source: 'nav-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#34d399', 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2, 1.5] },
      })
    }
    // The routed line: a dark casing under a solid green line, so it reads on
    // satellite as well as on the dark base. Drawn beneath the beeline, which
    // stays dashed — the two are different claims and shouldn't look alike.
    if (!m.getSource('route-line')) m.addSource('route-line', { type: 'geojson', data: empty })
    if (!m.getLayer('route-line-casing')) {
      m.addLayer({
        id: 'route-line-casing', type: 'line', source: 'route-line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0b1a14', 'line-width': 8, 'line-opacity': 0.85 },
      }, 'nav-line-layer')
    }
    if (!m.getLayer('route-line-layer')) {
      m.addLayer({
        id: 'route-line-layer', type: 'line', source: 'route-line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#34d399', 'line-width': 4.5, 'line-opacity': 0.95 },
      }, 'nav-line-layer')
    }
    if (!m.getLayer('nav-target-ring')) {
      m.addLayer({
        id: 'nav-target-ring', type: 'circle', source: 'nav-target',
        paint: {
          'circle-radius': 9,
          'circle-color': 'rgba(52,211,153,0.18)',
          'circle-stroke-color': '#34d399',
          'circle-stroke-width': 2.5,
        },
      })
    }
  }

  // ── Camera sighting (VISION row 139) ──────────────────────────────────────
  // The sight line from where you stood to where the ray met the terrain, the
  // fan of ground the stated aim error actually spans (re-marched through the
  // DEM, so a grazing hit draws honestly long), and a ring on the estimate.
  // Purple, the viewpoint colour — a sighting is a viewpoint pointed backwards.
  function addSightLayers() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    if (!m.getSource('sight-fan')) m.addSource('sight-fan', { type: 'geojson', data: empty })
    if (!m.getSource('sight-line')) m.addSource('sight-line', { type: 'geojson', data: empty })
    if (!m.getSource('sight-hit')) m.addSource('sight-hit', { type: 'geojson', data: empty })
    if (!m.getLayer('sight-fan-fill')) {
      m.addLayer({
        id: 'sight-fan-fill', type: 'fill', source: 'sight-fan',
        paint: { 'fill-color': '#a78bfa', 'fill-opacity': 0.16 },
      })
    }
    if (!m.getLayer('sight-fan-edge')) {
      m.addLayer({
        id: 'sight-fan-edge', type: 'line', source: 'sight-fan',
        paint: { 'line-color': '#a78bfa', 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [2, 2] },
      })
    }
    if (!m.getLayer('sight-line-layer')) {
      m.addLayer({
        id: 'sight-line-layer', type: 'line', source: 'sight-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#a78bfa', 'line-width': 2.5, 'line-opacity': 0.95, 'line-dasharray': [3, 2] },
      })
    }
    if (!m.getLayer('sight-hit-ring')) {
      m.addLayer({
        id: 'sight-hit-ring', type: 'circle', source: 'sight-hit',
        paint: {
          'circle-radius': 8,
          'circle-color': 'rgba(167,139,250,0.2)',
          'circle-stroke-color': '#a78bfa',
          'circle-stroke-width': 2.5,
        },
      })
    }
  }

  // ── Routed driving over the self-hosted MVUM network (VISION rows 91/133) ─
  // Everything here runs on the device: the graph is a static file we host,
  // the search is shared/router.js, and nothing about the destination leaves.
  const startRouteRef = useRef(null)
  const routeRef = useRef(null)          // the active route, for off-route checks
  const rerouteAtRef = useRef(0)         // debounce: no more than one reroute per 15 s

  const drawRoute = useCallback((coordinates) => {
    const m = map.current
    const src = m?.getSource('route-line')
    if (!src) return
    src.setData(coordinates?.length
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} }
      : { type: 'FeatureCollection', features: [] })
  }, [])

  const clearRoute = useCallback(() => {
    routeRef.current = null
    drawRoute(null)
    onRouteRef.current?.(null)
  }, [drawRoute])

  const computeRoute = useCallback(async (target, { silent = false } = {}) => {
    const m = map.current
    if (!m || !target) return null
    // The route starts where you are, so a fix is required — but only now, at
    // the point of asking, not as a precondition for offering
    let fix = userFixRef.current
    if (!fix) {
      fix = await oneShotFix()
      if (!fix) {
        if (!silent) showToast(mapContainer.current, "Can't route without your location — allow location access and try again.")
        return null
      }
    }
    const from = [fix.lng, fix.lat]
    const to = [target.lng, target.lat]
    const avail = routingAvailableSync(from, to)
    if (!avail) {
      if (!silent) showToast(mapContainer.current, "No road graph covers this area yet — use Guide me here for a beeline.")
      return null
    }
    try {
      const { index } = await loadGraph(avail.key)
      const result = routeOverGraph(index, from, to, { vehicleBit: vehicleBitRef.current })
      if (!result.ok) {
        if (!silent) showToast(mapContainer.current, routeFailureText(result))
        return null
      }
      routeRef.current = { ...result, target }
      drawRoute(result.coordinates)
      onRouteRef.current?.({
        target,
        miles: result.miles,
        minutes: result.minutes,
        steps: result.steps,
        coordinates: result.coordinates,
        startOffRoadMi: result.startOffRoadMi,
        endOffRoadMi: result.endOffRoadMi,
      })
      return result
    } catch {
      if (!silent) showToast(mapContainer.current, "Couldn't load the road data for this area.")
      return null
    }
  }, [drawRoute])

  useEffect(() => { startRouteRef.current = computeRoute }, [computeRoute])

  // The manifest is tiny and decides whether the offer appears at all, so it
  // is fetched once at startup rather than when a popup opens
  useEffect(() => { loadManifest() }, [])

  // Off-route: a routed line you have left is worse than no line, because it
  // still looks authoritative. Recompute once you are clearly off it, with a
  // debounce so a bad fix in a canyon doesn't thrash.
  useEffect(() => {
    const active = routeRef.current
    if (!active || !userFix) return
    const offMi = distanceToRouteMi(active.coordinates, [userFix.lng, userFix.lat])
    if (offMi < OFF_ROUTE_MI) return
    const now = Date.now()
    if (now - rerouteAtRef.current < REROUTE_COOLDOWN_MS) return
    rerouteAtRef.current = now
    computeRoute(active.target, { silent: true })
  }, [userFix, computeRoute])

  useEffect(() => { clearRouteRef.current = clearRoute }, [clearRoute])

  function applyNavData() {
    const m = map.current
    if (!m?.getSource('nav-line')) return
    const t = navTargetRef.current, u = userFixRef.current
    m.getSource('nav-line').setData({
      type: 'FeatureCollection',
      features: (t && u) ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[u.lng, u.lat], [t.lng, t.lat]] }, properties: {} }] : [],
    })
    m.getSource('nav-target').setData({
      type: 'FeatureCollection',
      features: t ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: {} }] : [],
    })
  }

  useEffect(() => { navTargetRef.current = navTarget }, [navTarget])
  useEffect(() => { onRouteRef.current = onRoute }, [onRoute])
  useEffect(() => { vehicleBitRef.current = vehicle?.bit || 0 }, [vehicle])
  useEffect(() => { userFixRef.current = userFix }, [userFix])
  useEffect(() => { if (mapReady) applyNavData() }, [navTarget, userFix, mapReady])

  function applySightData() {
    const m = map.current
    if (!m?.getSource('sight-line')) return
    const s = sightingRef.current
    const empty = { type: 'FeatureCollection', features: [] }
    m.getSource('sight-fan').setData(s?.fan
      ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [s.fan] }, properties: {} }
      : empty)
    m.getSource('sight-line').setData(s?.hit
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: [[s.eye.lng, s.eye.lat], [s.hit.lng, s.hit.lat]] }, properties: {} }
      : empty)
    m.getSource('sight-hit').setData(s?.hit
      ? { type: 'Feature', geometry: { type: 'Point', coordinates: [s.hit.lng, s.hit.lat] }, properties: {} }
      : empty)
  }
  useEffect(() => { sightingRef.current = sighting }, [sighting])
  useEffect(() => { if (mapReady) applySightData() }, [sighting, mapReady])

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
  // Zones are drawn for contrast with whatever is underneath. The mint green
  // tuned for the night base washes out almost completely on Boondock Day, so
  // the daylight map gets a deeper green, more fill and a firmer outline
  // (VISION row 80). Satellite keeps the mint — it reads well on imagery.
  function zonePaint(baseId) {
    const day = baseId === 'boondock-day'
    return {
      fillColor: day ? '#0b7a4a' : '#34d399',
      fillOpacity: day ? 0.22 : 0.12,
      lineColor: day ? '#085433' : '#34d399',
      lineOpacity: day ? 0.9 : 0.5,
      lineWidth: day ? 1.4 : 1,
    }
  }

  // Re-tint if the basemap changes without the style being rebuilt
  useEffect(() => {
    const m = map.current
    if (!mapReady || !m?.getLayer('zones-fill')) return
    const z = zonePaint(baseLayer)
    m.setPaintProperty('zones-fill', 'fill-color', z.fillColor)
    m.setPaintProperty('zones-fill', 'fill-opacity', z.fillOpacity)
    m.setPaintProperty('zones-line', 'line-color', z.lineColor)
    m.setPaintProperty('zones-line', 'line-opacity', z.lineOpacity)
    m.setPaintProperty('zones-line', 'line-width', z.lineWidth)
  }, [baseLayer, mapReady])

  async function addZonesLayers() {
    const m = map.current
    if (!m) return
    if (!m.getSource('zones')) {
      m.addSource('zones', { type: 'geojson', data: getZonesData() })
    }
    const vis = overlaysRef.current.zones ? 'visible' : 'none'
    const z = zonePaint(baseLayerRef.current)
    if (!m.getLayer('zones-fill')) {
      m.addLayer({
        id: 'zones-fill', type: 'fill', source: 'zones',
        layout: { visibility: vis },
        paint: { 'fill-color': z.fillColor, 'fill-opacity': z.fillOpacity },
      })
    }
    if (!m.getLayer('zones-line')) {
      m.addLayer({
        id: 'zones-line', type: 'line', source: 'zones',
        layout: { visibility: vis },
        paint: {
          'line-color': z.lineColor, 'line-opacity': z.lineOpacity,
          'line-width': z.lineWidth, 'line-dasharray': [4, 3],
        },
      })
    }
  }

  // ── Temperature filter — forecast grid over the view, contoured ───────────
  const baseLayerRef = useRef(baseLayer)
  useEffect(() => { baseLayerRef.current = baseLayer }, [baseLayer])
  const tempFilterRef = useRef(tempFilter)
  const onTempStatusRef = useRef(onTempStatus)
  useEffect(() => { onTempStatusRef.current = onTempStatus }, [onTempStatus])
  const tempGridRef = useRef(null)      // last fetched forecast lattice
  const tempMarginsRef = useRef(null)   // margins for the current criteria
  const tempDataRef = useRef(null)      // {area, edge} GeoJSON for re-adds
  const tempTokenRef = useRef(0)        // drops stale async grid fetches
  const tempDebounceRef = useRef(null)

  // ── Elevation band overlay (VISION row 120) ───────────────────────────────
  // The elevation sliders used to only *remove* site dots, so a filter with no
  // sites in view looked like a broken map rather than an answer. This shades
  // the ground that actually falls in the band, the same way the temperature
  // filter does, using the same marching-squares contouring — the only new
  // part is sampling the DEM the hillshade already draws.
  const elevDataRef = useRef(null)
  const elevTokenRef = useRef(0)
  const elevDebounceRef = useRef(null)

  function addElevLayers() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    if (!m.getSource('elev-area')) m.addSource('elev-area', { type: 'geojson', data: empty })
    if (!m.getSource('elev-edge')) m.addSource('elev-edge', { type: 'geojson', data: empty })
    const before = m.getLayer('sites-clusters') ? 'sites-clusters' : undefined
    // Violet, because every other band on this map is spoken for: sky blue is
    // the temperature filter, mint is Boondock Zones, and the warm end (amber,
    // orange, red) belongs to roads and wildfire, where a colour clash would
    // matter far more than here.
    if (!m.getLayer('elev-area-fill')) {
      m.addLayer({
        id: 'elev-area-fill', type: 'fill', source: 'elev-area',
        paint: { 'fill-color': '#8b5cf6', 'fill-opacity': 0.13 },
      }, before)
    }
    if (!m.getLayer('elev-area-line')) {
      m.addLayer({
        id: 'elev-area-line', type: 'line', source: 'elev-edge',
        paint: { 'line-color': '#8b5cf6', 'line-opacity': 0.7, 'line-width': 1.3, 'line-dasharray': [2, 2] },
      }, before)
    }
  }

  function applyElevData() {
    const m = map.current
    if (!m) return
    const empty = { type: 'FeatureCollection', features: [] }
    m.getSource('elev-area')?.setData(elevDataRef.current?.area || empty)
    m.getSource('elev-edge')?.setData(elevDataRef.current?.edge || empty)
  }

  async function refreshElevOverlay() {
    const m = map.current
    if (!m) return
    const token = ++elevTokenRef.current
    const { min, max } = elevRangeRef.current
    if (min == null && max == null) {
      elevDataRef.current = null
      applyElevData()
      return
    }
    let grid
    try {
      const b = m.getBounds()
      grid = await fetchElevGrid({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
    } catch {
      return   // DEM tiles unavailable (offline) — leave whatever is drawn
    }
    if (token !== elevTokenRef.current || map.current !== m) return
    elevDataRef.current = gridToGeoJSON(grid, elevMargins(grid, min, max))
    applyElevData()
  }

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

  useEffect(() => {
    if (mapReady) refreshElevOverlay()
  }, [siteMinElev, siteMaxElev, mapReady])

  // ── Offline fallback: saved USGS packs appear when the network is gone ────
  // `navigator.onLine` only reports that an interface exists. It stays true on
  // campground wifi that never reaches the internet and on one bar of LTE that
  // cannot finish a request — precisely when someone needs the map they
  // downloaded. Gating the saved pack on it kept the pack hidden exactly when
  // it mattered (VISION row 126).
  //
  // So the signal is the basemap's own tiles failing. With hysteresis: MapLibre
  // raises `error` per failed tile, and a single flaky one must not swap the
  // map out from under you.
  const baseFailuresRef = useRef(0)
  const baseFailedRef = useRef(false)
  const BASE_FAIL_THRESHOLD = 4

  function offlineFallbackShouldShow() {
    return baseFailedRef.current || navigator.onLine === false
  }

  function applyOfflineFallback() {
    const m = map.current
    if (!m?.getLayer('usgs-offline-layer')) return
    m.setLayoutProperty('usgs-offline-layer', 'visibility', offlineFallbackShouldShow() ? 'visible' : 'none')
  }

  function noteBaseTileFailure() {
    baseFailuresRef.current += 1
    if (baseFailedRef.current || baseFailuresRef.current < BASE_FAIL_THRESHOLD) return
    baseFailedRef.current = true
    applyOfflineFallback()
    showToast(mapContainer.current, 'Map tiles are not loading — showing your saved packs where you have them')
  }

  function noteBaseTileSuccess() {
    baseFailuresRef.current = 0
    if (!baseFailedRef.current) return
    baseFailedRef.current = false
    applyOfflineFallback()
  }

  function addOfflineFallbackLayer() {
    const m = map.current
    if (!m) return
    if (!m.getSource('usgs-offline')) {
      m.addSource('usgs-offline', { type: 'raster', tiles: [toProtocolUrl('usgs-topo')], tileSize: 256, attribution: 'USGS National Map' })
    }
    if (!m.getLayer('usgs-offline-layer')) {
      m.addLayer({
        id: 'usgs-offline-layer', type: 'raster', source: 'usgs-offline',
        layout: { visibility: offlineFallbackShouldShow() ? 'visible' : 'none' },
      })
    }
  }

  useEffect(() => {
    const apply = () => applyOfflineFallback()
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
  const prevOverlaysRef = useRef(overlays)
  useEffect(() => {
    // Tracked before the ready guard, so restoring saved overlays during boot
    // counts as "already on" rather than a toast-worthy switch-on
    const prev = prevOverlaysRef.current
    prevOverlaysRef.current = overlays
    if (!mapReady) return
    applyOverlayVisibility()
    // A layer that starts at a zoom you aren't at yet draws nothing and looks
    // broken — the service answers with a valid empty tile, so the source-error
    // toast never fires (VISION row 102). Say so once, as it's switched on.
    Object.entries(overlays).forEach(([id, on]) => {
      if (!on || prev[id]) return
      const reason = whyOverlayIsBlank(map.current, OVERLAY_LAYERS[id])
      if (reason) showToast(mapContainer.current, reason)
    })
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

    // Add/update markers. The pin for the waypoint open in the editor is born
    // draggable (VISION row 94); MapLibre 4.7.1 will NOT attach drag handlers to
    // a custom-element marker through setDraggable() after construction (isolated
    // and verified headless), so a change in edit state rebuilds just that pin.
    waypoints.forEach(wp => {
      const draggable = wp.id === editingWaypointId
      const existing = markersRef.current[wp.id]
      if (existing && existing.isDraggable() === draggable) {
        existing.setLngLat([wp.lng, wp.lat])
        existing.getElement().innerHTML = markerSvgHtml(wp, wpColors)   // icon/status/colors may have changed
        const popup = existing.getPopup()
        popup?.setHTML(waypointPopupHtml(wp))
        // setHTML resets the weather slot; refill if the popup is showing
        if (popup?.isOpen?.()) attachWeather(popup, wp.lat, wp.lng, map.current)
        return
      }
      if (existing) { existing.remove(); delete markersRef.current[wp.id] }   // edit state flipped → rebuild

      const el = document.createElement('div')
      el.className = 'bdk-marker' + (draggable ? ' bdk-marker-editing' : '')
      el.style.cssText = `
        width: 30px; height: 38px; cursor: ${draggable ? 'grab' : 'pointer'};
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
        attachWeather(popup, ll.lat, ll.lng, map.current)
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

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable })
        .setLngLat([wp.lng, wp.lat])
        .setPopup(popup)
        .addTo(map.current)

      // Dropping the pin in edit mode rewrites the coordinates (VISION row 94).
      // The handler comes from a ref so it never goes stale.
      marker.on('dragend', () => {
        const ll = marker.getLngLat()
        onRelocateRef.current?.(wp.id, { lat: ll.lat, lng: ll.lng })
      })

      // No stopPropagation: MapLibre toggles the marker's popup from the
      // map's own click event, so swallowing it here kills popups entirely
      el.addEventListener('click', () => {
        onWaypointClick?.(wp)
      })

      markersRef.current[wp.id] = marker
    })
  }, [waypoints, mapReady, wpColors, editingWaypointId])

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

  // Pick-mode affordance (VISION row 93): crosshair cursor + a one-time hint
  // while the map waits for the placing tap.
  useEffect(() => {
    const m = map.current
    if (!m || !mapReady || !pickMode) return
    m.getCanvas().style.cursor = 'crosshair'
    showToast(mapContainer.current, 'Tap the map to place your waypoint')
    return () => { if (map.current === m) m.getCanvas().style.cursor = '' }
  }, [pickMode, mapReady])

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
const SITES_LAYER_IDS = ['sites-clusters', 'sites-cluster-count', 'sites-points', 'sites-icons', 'sites-labels']

// Overlays whose single switch drives more than one map layer. Anything absent
// falls back to the plain `<id>-layer` raster convention.
const OVERLAY_LAYER_IDS = {
  'sites': SITES_LAYER_IDS,
  'zones': ['zones-fill', 'zones-line'],
  'roadcore': ['roadcore-open', 'roadcore-closed'],
  'wildfire': ['wildfire-fill', 'wildfire-line'],
  'mvum': ['mvum-layer', 'mvum-roads', 'mvum-roads-seasonal', 'mvum-trails-line', 'mvum-trails-seasonal'],
  'usfs-trails': ['usfs-trails-layer', 'usfs-trails-line'],
  // Over a raster base the switch also drives the route numbers, which ESRI's
  // reference tiles don't carry (VISION row 105). The id differs from the
  // vector base's own 'road-shield' on purpose — that one belongs to the map
  // and must not be switched off with this overlay.
  'names': ['names-layer', 'names-shield'],
}

// The self-hosted vector layers a tap should interrogate, per overlay
const MVUM_PICK_LAYERS = ['mvum-roads', 'mvum-roads-seasonal']
const MVUM_TRAIL_PICK_LAYERS = ['mvum-trails-line', 'mvum-trails-seasonal']

// Site badges (shared/siteIcons.js). Below this zoom a dot is too small to
// hold a logo legibly, so it stays the plain coloured dot and the glyph layer
// switches off with it.
const SITE_ICON_MINZOOM = 10.5
const SITE_GLYPH_PX = 22      // CSS px the glyph is drawn at, before icon-size
const SITE_GLYPH_RATIO = 3    // oversampled bitmap so it stays crisp on retina

const siteGlyphImageId = (kind) => `site-glyph-${kind}`

const SITE_GLYPH_IMAGE = ['match', ['get', 'kind'],
  ...SITE_KINDS.flatMap(k => [k.id, siteGlyphImageId(k.id)]),
  siteGlyphImageId(SITE_FALLBACK_KIND)]

const SITE_KIND_COLOR = ['match', ['get', 'kind'],
  ...SITE_KINDS.flatMap(k => [k.id, k.color]),
  '#e8eef4']

// Off-route by more than this and the drawn line is actively misleading, so
// it gets recomputed. A quarter mile is wide enough for GPS drift under trees
// and narrow enough to catch a missed junction.
const OFF_ROUTE_MI = 0.25
const REROUTE_COOLDOWN_MS = 15000

// One position, for the moment someone asks for a route without the live
// readout already running
function oneShotFix() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}

// Every routing failure is something the driver needs told plainly, and none
// of them is "something went wrong"
function routeFailureText(result) {
  switch (result.reason) {
    case 'start-too-far':
      return `You're more than ${result.snapMi} mi from any mapped forest road — Guide me here gives a beeline instead.`
    case 'end-too-far':
      return `That spot is more than ${result.snapMi} mi from any mapped forest road.`
    case 'no-legal-route':
      return 'No route there that\'s open to your vehicle. Try a different vehicle in the Route settings, or Guide me here.'
    case 'not-connected':
      return 'No forest road connects those two points in the data we hold — the trip probably needs pavement.'
    case 'same-place':
      return "You're already there."
    default:
      return "Couldn't work out a route to that spot."
  }
}

const SITE_DISC_FILL = 'rgba(16, 21, 28, 0.92)'

// Why a just-enabled overlay has nothing to draw here — or null when it should
// be drawing and any failure is the service's, which the source-error toast
// already reports (VISION row 102). Switching a layer on below the zoom its
// service starts at looks identical to a broken layer: the server answers with
// a valid empty tile, a 200, so nothing else says a word.
function whyOverlayIsBlank(m, layer) {
  if (!m || !layer) return null
  const { sourceMinzoom, label } = layer
  if (sourceMinzoom != null && m.getZoom() < sourceMinzoom) {
    return `${label} draws from about z${sourceMinzoom} — zoom in to see it.`
  }
  return null
}


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
  community: [],   // published community spots + this device's pending ones
}

function getSitesData() {
  return { type: 'FeatureCollection', features: [...stateData.sites, ...stateData.community] }
}

// Community layer: one small national file, fetched once with the map (plus
// any pending reports saved on this device — see shared/community.js)
let communityLoadStarted = false
async function loadCommunityLayer() {
  if (communityLoadStarted) return false
  communityLoadStarted = true
  const published = await loadCommunityFeatures(import.meta.env.BASE_URL)
  const ids = new Set(published.map(f => f.properties?.id))
  const pending = prunePendingReports(ids)
  stateData.community = [...published, ...pending]
  return published.length + pending.length > 0
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

// Site `website` values come from OpenStreetMap and Overture, which anyone can
// edit. esc() stops an attribute breakout but not a `javascript:` scheme, so
// links are scheme-checked too: http/https only, everything else drops the
// link rather than rendering it (VISION row 70).
function safeUrl(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  try {
    const proto = new URL(s).protocol
    return proto === 'http:' || proto === 'https:' ? s : null
  } catch {
    // OSM often stores bare hosts ("www.example.com"), which don't parse as
    // absolute URLs. Those are safe to assume https; anything carrying its own
    // scheme already failed the check above.
    try {
      return /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s) ? new URL(`https://${s}`).href : null
    } catch {
      return null
    }
  }
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
    ? `<div style="margin:4px 0 2px">${wp.labels.map(l => `<span style="display:inline-block;font-size:10px;padding:1px 7px;margin:1px 3px 1px 0;border-radius:100px;background:rgba(var(--overlay-rgb),0.08);color:rgba(var(--fg-rgb),.8)">${esc(l)}</span>`).join('')}</div>`
    : ''
  const ratings = WP_RATING_KEYS
    .filter(rk => wp.ratings?.[rk.id])
    .map(rk => `<div style="font-size:11px;color:rgba(var(--fg-rgb),.7)">${rk.label}: <span style="color:#fbbf24">${'★'.repeat(wp.ratings[rk.id])}</span><span style="color:rgba(var(--overlay-rgb),.25)">${'★'.repeat(5 - wp.ratings[rk.id])}</span></div>`)
    .join('')
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;">
      <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(wp.name)}</div>
      ${statusLine}
      ${wp.notes ? `<div style="font-size:12px;color:rgba(var(--overlay-rgb),0.55);margin-bottom:4px">${esc(wp.notes)}</div>` : ''}
      ${labels}
      ${ratings}
      <div style="font-size:11px;color:rgba(var(--overlay-rgb),0.35);font-variant-numeric:tabular-nums;margin-top:3px">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}${wp.elev_ft != null ? ` · ${Number(wp.elev_ft).toLocaleString()} ft` : ''}</div>
      ${weatherHtml()}
      ${directionsHtml(wp.lat, wp.lng, wp.name)}
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
    <div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(var(--overlay-rgb),0.08)">
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);display:flex;justify-content:space-between"><span>Weather</span><span style="text-transform:none;letter-spacing:0">Open-Meteo</span></div>
      <div data-weather-body style="font-size:11px;color:rgba(var(--fg-rgb),.55);margin-top:3px">Loading forecast…</div>
      <div data-air-body style="font-size:11px;margin-top:4px"></div>
    </div>`
}

// ── Smoke / air quality line (VISION row 69) ────────────────────────────────
// Starts empty rather than "Loading…": it's a second, slower datum in a card
// that already says something useful, and a spinner under a filled forecast
// reads as the forecast being broken.
function airBodyHtml(air) {
  if (air?.aqi == null) return ''
  const band = aqiBand(air.aqi)
  const pm = air.pm25 != null ? ` · PM2.5 ${Number(air.pm25).toFixed(1)} µg/m³` : ''
  // Only surfaced when the air gets categorically worse, so it means "this is
  // about to change" rather than restating the current number
  const peak = air.peak
    ? (() => {
        const b = aqiBand(air.peak.aqi)
        const when = new Date(air.peak.at).toLocaleDateString(undefined, { weekday: 'short' })
        return `<div style="font-size:10px;color:${b.color};margin-top:2px">Forecast to reach ${Math.round(air.peak.aqi)} — ${esc(b.label.toLowerCase())} by ${esc(when)}</div>`
      })()
    : ''
  return `
    <div style="display:flex;align-items:center;gap:5px;color:rgba(var(--fg-rgb),.85)">
      <span style="color:${band.color};font-size:13px;line-height:1">●</span>
      <span>Air ${Math.round(air.aqi)} · ${esc(band.label)}${pm}</span>
    </div>${peak}`
}

function forecastBodyHtml(fc) {
  const chips = fc.days.slice(0, 8).map(d => {
    const [label, emoji] = wmoInfo(d.code)
    const dow = new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })
    const wet = d.precipProb != null && d.precipProb >= 30
    const tip = `${d.date}: ${label} · high ${Math.round(d.hi)}° low ${Math.round(d.lo)}° · precip ${d.precipProb ?? 0}%${d.precipIn > 0.005 ? ` (${d.precipIn}in)` : ''} · wind ${Math.round(d.wind)} mph`
    return `<span title="${esc(tip)}" style="flex:1 0 44px;text-align:center;background:rgba(var(--overlay-rgb),0.05);border-radius:5px;padding:3px 2px;line-height:1.3">
      <span style="font-size:9px;color:rgba(var(--fg-rgb),.55)">${esc(dow)}</span><br>
      <span style="font-size:11px">${emoji}</span><br>
      <span style="font-size:9.5px;color:rgba(var(--fg-rgb),.9)">${Math.round(d.hi)}°<span style="color:rgba(var(--fg-rgb),.45)">/${Math.round(d.lo)}°</span></span>${wet ? `<br><span style="font-size:8.5px;color:#38bdf8">☂ ${d.precipProb}%</span>` : ''}
    </span>`
  }).join('')
  const rest = fc.days.slice(8)
  const restLine = rest.length ? (() => {
    const hi = Math.max(...rest.map(d => d.hi))
    const lo = Math.min(...rest.map(d => d.lo))
    const wetSum = rest.reduce((s, d) => s + (d.precipIn || 0), 0)
    return `<div style="font-size:10px;color:rgba(var(--fg-rgb),.5);margin-top:4px">Days 9–16: ${Math.round(hi)}°/${Math.round(lo)}°${wetSum > 0.005 ? ` · ${wetSum.toFixed(2)}" precip` : ''}${fc.elevFt != null ? ` · model elev ${fc.elevFt.toLocaleString()} ft` : ''}</div>`
  })() : ''
  const cur = fc.current
  const nowLine = cur
    ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.85)">Now ${cur.temp}° · ${esc(wmoInfo(cur.code)[0])} · wind ${cur.wind} mph · ${cur.humidity}% RH</div>`
    : ''
  return `${nowLine}<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:5px">${chips}</div>${restLine}`
}

// Say only what we actually know. The old copy blamed the connection for
// every failure, which read as wrong whenever the user was plainly online
// (VISION row 67). weather.js already retried twice before we get here.
function weatherErrorText(err) {
  if (navigator.onLine === false) return 'No connection — forecasts need one'
  if (err?.status === 429) return 'Weather service is busy right now'
  return "Couldn't load the forecast"
}

// The weather card lands after the popup is already placed, so the popup grows
// upward and its header can slide under the top edge of the map (VISION row
// 76). Re-anchor once the taller content is in, then nudge the map if any edge
// still overhangs. MapLibre picks the popup anchor inside setLngLat, so
// re-setting the same coordinate is what lets it flip below the point.
function keepPopupInView(m, popup) {
  const el = popup.getElement()
  if (!el || !popup.isOpen?.()) return
  popup.setLngLat(popup.getLngLat())
  requestAnimationFrame(() => {
    if (!popup.isOpen?.()) return
    const box = el.getBoundingClientRect()
    const view = m.getContainer().getBoundingClientRect()
    const margin = 10
    let dx = 0
    let dy = 0
    if (box.top < view.top + margin) dy = box.top - (view.top + margin)
    else if (box.bottom > view.bottom - margin) dy = box.bottom - (view.bottom - margin)
    if (box.left < view.left + margin) dx = box.left - (view.left + margin)
    else if (box.right > view.right - margin) dx = box.right - (view.right - margin)
    // Only chase the overhang if the card can actually fit
    if (box.height > view.height - 2 * margin) dy = Math.min(dy, 0)
    if (dx || dy) m.panBy([dx, dy], { duration: 180 })
  })
}

function attachWeather(popup, lat, lng, m) {
  const slotOf = () => popup.getElement()?.querySelector('[data-weather-body]')

  // Air quality rides alongside the forecast but never blocks it — a failure
  // here leaves the weather card exactly as it was, silently, because a point
  // card is not the place to explain that a secondary feed is down.
  airQuality(lat, lng)
    .then(air => {
      if (!popup.isOpen?.()) return
      const slot = popup.getElement()?.querySelector('[data-air-body]')
      if (!slot) return
      slot.innerHTML = airBodyHtml(air)
      if (m) keepPopupInView(m, popup)
    })
    .catch(() => {})

  const load = () => {
    pointForecast(lat, lng)
      .then(fc => {
        if (!popup.isOpen?.()) return
        const slot = slotOf()
        if (slot) slot.innerHTML = forecastBodyHtml(fc)
        if (m) keepPopupInView(m, popup)
      })
      .catch(err => {
        const slot = slotOf()
        if (!slot) return
        slot.innerHTML = `<span style="color:rgba(var(--fg-rgb),.6)">${esc(weatherErrorText(err))}</span>
          <button data-weather-retry style="all:unset;cursor:pointer;color:#38bdf8;margin-left:6px">Retry</button>`
        slot.querySelector('[data-weather-retry]')?.addEventListener('click', () => {
          slot.textContent = 'Loading forecast…'
          load()
        })
      })
  }
  load()
}

// The routed-drive offer, rendered only where a graph actually covers both
// where you are and where you're going (shared/routeGraph.js). Absent is the
// right state for most of the country today: a button that can only apologise
// is worse than no button, and the beeline below it still works everywhere.
function routeButtonHtml(lat, lng, name) {
  if (!coversPointSync([lng, lat])) return ''
  return `
    <button data-route-lat="${lat}" data-route-lng="${lng}" data-route-name="${esc(name || '')}"
      title="Drive there along legal forest roads, worked out on this device"
      style="margin-top:6px;width:100%;padding:5px 10px;font-size:11.5px;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(52,211,153,0.16);color:#34d399;border:1px solid rgba(52,211,153,0.5);border-radius:7px;cursor:pointer;font-weight:600">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
      Drive me there
    </button>`
}

// Getting there — in-app only (VISION row 133).
//
// This used to offer Apple and Google deep links. Tapping one handed that
// destination, and the fact that someone was driving to it, to the two
// companies the app exists to avoid — the single place the privacy promise
// broke, on the most-used path in the app. They're gone.
//
// What replaces them is the same capability without the handoff: compass
// guidance in-app, and coordinates on the clipboard. Pasting those into
// another app is still an option, but it's now the user's deliberate act
// rather than a button we shipped.
function directionsHtml(lat, lng, name) {
  const coords = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  return `
    <div style="font-size:11px;margin-top:7px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
      <span style="color:rgba(var(--fg-rgb),.55)">${coords}</span>
      <button data-copy-coords="${coords}" title="Copy coordinates for any app"
        style="all:unset;cursor:pointer;color:#8babd0;display:inline-flex;align-items:center;gap:3px;margin-left:auto;padding:1px 4px">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy coords
      </button>
    </div>
    ${routeButtonHtml(lat, lng, name)}
    <button data-nav-lat="${lat}" data-nav-lng="${lng}" data-nav-name="${esc(name || '')}"
      title="Beeline compass guidance to this point"
      style="margin-top:6px;width:100%;padding:5px 10px;font-size:11.5px;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(52,211,153,0.12);color:#34d399;border:1px solid rgba(52,211,153,0.35);border-radius:7px;cursor:pointer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
      Guide me here
    </button>
    <button data-sun-lat="${lat}" data-sun-lng="${lng}" data-sun-name="${esc(name || '')}"
      title="Sun path and solar siting for this point"
      style="margin-top:5px;width:100%;padding:5px 10px;font-size:11.5px;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.35);border-radius:7px;cursor:pointer">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><line x1="12" y1="1.5" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.5"/><line x1="1.5" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.5" y2="12"/><line x1="4.4" y1="4.4" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.6" y2="19.6"/><line x1="19.6" y1="4.4" x2="17.8" y2="6.2"/><line x1="6.2" y1="17.8" x2="4.4" y2="19.6"/></svg>
      Sun &amp; shade here
    </button>`
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

/**
 * Topmost rendered feature under a tap, with a few pixels of slack — a 1.5px
 * line is not something a thumb hits exactly.
 */
function pickFeature(m, point, layerIds) {
  const present = layerIds.filter(id => m.getLayer(id))
  if (!present.length) return null
  const pad = 6
  const box = [[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]]
  return m.queryRenderedFeatures(box, { layers: present })[0] || null
}

// Only sublayer 2 now: the roads half is self-hosted and matches the service
// exactly, so the live identify is left to answer for motorized trails alone
const identifyMvum = (m, lngLat) => identifyArc(OVERLAY_LAYERS.mvum.identifyUrl, 'all:2', m, lngLat)
const identifyTrail = (m, lngLat) => identifyArc(OVERLAY_LAYERS['usfs-trails'].identifyUrl, 'all', m, lngLat)
const identifyBlm = (m, lngLat) => identifyArc(OVERLAY_LAYERS['blm-roads'].identifyUrl, 'all:0,1', m, lngLat)

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
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 5px">USFS National Forest trail</div>
      <div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

// ── Popups for the self-hosted MVUM + trails vector layers (VISION row 83) ──
// The tiles carry codes, not sentences; shared/usfsCodes.js turns them back
// into words. Every one of these says the same thing in different words: the
// map tells you what USFS recorded, not what you are allowed to do today.

const MVUM_NOT_PERMISSION =
  'What USFS published as legal use. Orders, gates and washouts change this — verify locally before you commit to a route.'

function usfsPopupHtml({ title, kicker, kickerColor, caution, rows, lngLat, name }) {
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:180px">
      <div style="font-size:13px;font-weight:600">${esc(title)}</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:${kickerColor || 'rgba(var(--fg-rgb),.55)'};margin:2px 0 5px">${esc(kicker)}</div>
      <div style="font-size:11px;color:rgba(var(--fg-rgb),.6);line-height:1.45;margin-bottom:2px">${esc(caution)}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng, name || '')}
    </div>`
}

function openMvumRoadPopup(m, lngLat, feature) {
  const p = feature.properties || {}
  const meta = MVUM_ROAD_SYMBOL[Number(p.sym)]
  const name = titleCase(p.name || '') || (p.rte ? `Forest Road ${p.rte}` : 'Forest road')
  const rows = []
  const vehicles = vehicleList(p.veh)
  if (vehicles.length) rows.push(`Open to: ${esc(vehicles.join(', '))}`)
  const season = formatSeason(p.season)
  if (season) rows.push(esc(season))
  if (p.surf) rows.push(`Surface: ${esc(describeCode(SURFACE_CODES, p.surf))}`)
  if (p.oml != null) rows.push(`Maintained for: ${esc(describeCode(MAINT_LEVELS, p.oml))}`)
  if (p.road != null) rows.push(`Road type: ${esc(describeCode(ROAD_CHARACTER, p.road))}`)
  if (p.miles) rows.push(`Length: ${Number(p.miles).toFixed(1)} mi`)
  if (p.forest) rows.push(esc(p.forest))
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setHTML(usfsPopupHtml({
      title: name,
      kicker: `USFS MVUM · ${meta ? meta.label : 'Forest road'}${meta?.seasonal ? ' (seasonal)' : ''}`,
      caution: MVUM_NOT_PERMISSION,
      rows,
      lngLat,
      name: name.startsWith('Forest Road') || name === 'Forest road' ? '' : name,
    }))
    .addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

function openMvumTrailPopup(m, lngLat, feature) {
  const p = feature.properties || {}
  const meta = MVUM_TRAIL_SYMBOL[Number(p.sym)]
  const name = titleCase(p.name || '') || (p.rte ? `Trail ${p.rte}` : 'Motorized trail')
  const rows = []
  const vehicles = vehicleList(p.veh)
  if (vehicles.length) rows.push(`Open to: ${esc(vehicles.join(', '))}`)
  const season = formatSeason(p.season)
  if (season) rows.push(esc(season))
  if (p.cls) rows.push(`Trail class: ${esc(describeCode(TRAIL_CLASS, String(p.cls).replace(/^TC/, '')))}`)
  if (p.miles) rows.push(`Length: ${Number(p.miles).toFixed(1)} mi`)
  if (p.forest) rows.push(esc(p.forest))
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setHTML(usfsPopupHtml({
      title: name,
      kicker: `USFS MVUM trail · ${meta ? meta.label : 'Motorized'}${meta?.seasonal ? ' (seasonal)' : ''}`,
      caution: MVUM_NOT_PERMISSION,
      rows,
      lngLat,
      name: name === 'Motorized trail' ? '' : name,
    }))
    .addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

function openTrailVectorPopup(m, lngLat, feature) {
  const p = feature.properties || {}
  const name = titleCase(p.name || '') || (p.trailno ? `Trail ${p.trailno}` : 'Forest trail')
  const motorized = trailIsMotorized(p.uses, p.moto)
  const uses = trailUses(p.uses)
  const rows = []
  if (uses.length) rows.push(`Managed for: ${esc(uses.join(', '))}`)
  if (p.cls) rows.push(`Trail class: ${esc(describeCode(TRAIL_CLASS, p.cls))}`)
  if (p.surf && p.surf !== 'N/A') rows.push(`Surface: ${esc(titleCase(p.surf))}`)
  if (p.special && p.special !== 'N/A') rows.push(esc(titleCase(String(p.special).split(' - ').pop())))
  if (p.miles) rows.push(`Length: ${Number(p.miles).toFixed(1)} mi`)
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' })
    .setLngLat(lngLat)
    .setHTML(usfsPopupHtml({
      title: name,
      kicker: `USFS trail · ${motorized ? 'Motorized use allowed' : 'Non-motorized'}`,
      caution: motorized
        ? 'Managed for motor vehicles. Cross-check the MVUM and current closures before riding it.'
        : 'Foot, stock or bike trail as USFS records it. Conditions and closures change — verify locally.',
      rows,
      lngLat,
      name: name === 'Forest trail' ? '' : name,
    }))
    .addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
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
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 5px">USFS MVUM · ${esc(result.layerName || 'road')}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

const BLM_ROAD_DESIGNATION = {
  'Roads Managed for Public Motorized Use': 'Public motorized road',
  'Roads Managed for Limited Public Motorized Use': 'Limited public motorized road',
}

function openBlmPopup(m, lngLat, result) {
  const a = result.attributes || {}
  const name = titleCase(a.ROUTE_PRMRY_NM || '') || 'BLM road'
  const desig = BLM_ROAD_DESIGNATION[result.layerName] || 'BLM road'
  const rows = []
  if (a.PLAN_ASSET_CLASS && a.PLAN_ASSET_CLASS !== 'Null') rows.push(`Class: ${esc(titleCase(String(a.PLAN_ASSET_CLASS)))}`)
  const season = String(a.PLAN_SEASON_RSTRCT_CODE ?? '').trim()
  if (season && season !== 'Null') rows.push(`Season restriction: ${esc(season)}`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:170px">
      <div style="font-size:13px;font-weight:600">${esc(name)}</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 5px">BLM · ${esc(desig)}</div>
      <div style="font-size:11px;color:rgba(var(--fg-rgb),.6);line-height:1.45;margin-bottom:2px">Open to public motorized use. A road being here isn't permission — verify current rules, closures, and conditions locally.</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng, name === 'BLM road' ? '' : name)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

function openWildfirePopup(m, lngLat, feature) {
  const p = feature.properties || {}
  const name = titleCase(String(p.poly_IncidentName || p.attr_IncidentName || '').trim()) || 'Wildfire'
  const acres = p.poly_GISAcres ?? p.attr_CalculatedAcres
  const contained = p.attr_PercentContained
  const rows = []
  if (acres != null && Number(acres) > 0) rows.push(`Size: ${Math.round(Number(acres)).toLocaleString()} acres`)
  if (contained != null) rows.push(`Contained: ${Math.round(Number(contained))}%`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:180px">
      <div style="font-size:13.5px;font-weight:600">${esc(name)} Fire</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#f87171;margin:2px 0 5px">Active wildfire · NIFC</div>
      <div style="font-size:11px;color:rgba(var(--fg-rgb),.6);line-height:1.45;margin-bottom:2px">Current fire perimeter, updated every few minutes. Fire moves fast and conditions change — check official closures and never head toward an active fire.</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      <div style="font-size:9.5px;color:rgba(var(--fg-rgb),.35);margin-top:7px">Source: NIFC WFIGS (public domain)</div>
    </div>`
  new maplibregl.Popup({ offset: 8, maxWidth: '260px' }).setLngLat(lngLat).setHTML(html).addTo(m)
}

function openRoadcorePopup(m, lngLat, feature) {
  const p = feature.properties || {}
  const name = titleCase(p.NAME || '') || 'Forest road'
  const closed = (Number(p.maint) || 0) < 2
  const cleanCode = (v) => {
    const s = String(v ?? '').trim()
    return titleCase(s.split(' - ').slice(1).join(' - ') || s)
  }
  const rows = []
  if (p.OPER_MAINT) rows.push(`Maintenance: ${esc(cleanCode(p.OPER_MAINT))}`)
  if (p.SURFACE_TY) rows.push(`Surface: ${esc(cleanCode(p.SURFACE_TY))}`)
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:170px">
      <div style="font-size:13px;font-weight:600">${esc(name)}</div>
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 5px">USFS RoadCore · ${closed ? 'Closed to vehicles' : 'Open road'}</div>
      <div style="font-size:11px;color:${closed ? '#f87171' : 'rgba(var(--fg-rgb),.6)'};line-height:1.45;margin-bottom:2px">${closed
        ? 'Closed to motor vehicles (maintenance level 1). A road existing here is not permission to drive it.'
        : 'Existing FS road. Cross-check the MVUM and local rules for legal public use before driving it.'}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng, name === 'Forest road' ? '' : name)}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '280px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
}

function openPointInfoPopup(m, lngLat, onSave, zoneProps = null, onReport = null) {
  const inZone = zoneProps != null
  const flat = inZone && zoneProps.flat_pct != null ? Number(zoneProps.flat_pct) : null
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:190px">
      ${inZone ? `<div style="font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:#34d399;margin-bottom:5px">Possible boondocking zone · beta</div>` : ''}
      <div style="font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums">${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}</div>
      <div style="font-size:11.5px;color:rgba(var(--fg-rgb),.65);margin-top:3px" data-elev>Elevation: …</div>
      ${flat != null ? `<div style="font-size:11px;color:rgba(var(--fg-rgb),.6);margin-top:3px">≈${flat}% of sampled ground ≤ 12% grade</div>` : ''}
      ${inZone ? `<div style="font-size:10.5px;color:rgba(var(--fg-rgb),.5);margin-top:5px;line-height:1.45">USFS land near a legal MVUM road. Heuristic only — verify rules, closures, and conditions locally.</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px;display:inline-flex;align-items:center;justify-content:center;gap:6px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Save waypoint
      </button>
      ${onReport && communityEnabled() ? `
      <button data-report-spot class="btn-secondary" style="margin-top:6px;width:100%;padding:5px 10px;font-size:11.5px;justify-content:center" title="Tell other boondockers — dump, water, campsite…">
        Report a spot here for everyone
      </button>` : ''}
    </div>`
  const popup = new maplibregl.Popup({ offset: 8, maxWidth: '250px' })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
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
  root.querySelector('[data-report-spot]')?.addEventListener('click', () => {
    popup.remove()
    onReport?.(lngLat)
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
      ${tier ? `<div style="font-size:10.5px;color:rgba(var(--fg-rgb),.6);margin-top:3px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${tier.color};margin-right:5px"></span>${tier.text}</div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lngLat.lat, lngLat.lng, props.name)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="font-size:9.5px;color:rgba(var(--fg-rgb),.35);margin-top:7px">Source: © OpenStreetMap contributors</div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 12, maxWidth: '250px' }).setLngLat(lngLat).setHTML(html).addTo(m)
  attachWeather(popup, lngLat.lat, lngLat.lng, m)
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
      <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin-top:2px">${esc(cls)}</div>
    </div>`
  new maplibregl.Popup({ offset: 8, maxWidth: '240px' }).setLngLat(lngLat).setHTML(html).addTo(m)
}

function openSitePopup(m, f, onSaveSpot) {
  const p = f.properties
  if (p.src === 'community') return openCommunitySitePopup(m, f, onSaveSpot)
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
      <div style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 6px">${kindLabel}</div>
      ${rows.length ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);line-height:1.5">${rows.join('<br>')}</div>` : ''}
      ${safeUrl(p.website) ? `<div style="margin-top:5px"><a href="${esc(safeUrl(p.website))}" target="_blank" rel="noreferrer" style="font-size:11.5px;color:#38bdf8">Website</a></div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lat, lng, p.name || kindLabel)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="font-size:9.5px;color:rgba(var(--fg-rgb),.35);margin-top:7px">${p.elev_ft != null ? `${Number(p.elev_ft).toLocaleString()} ft · ` : ''}${SITE_SRC_CREDIT(p.src)}</div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 10, maxWidth: '270px' })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(m)
  attachWeather(popup, lat, lng, m)
  popup.getElement().querySelector('[data-save-wp]')?.addEventListener('click', () => {
    onSaveSpot?.({ ...p, lat, lng })
    popup.remove()
  })
}

// ── Community spot card — status, dated check-ins, check-in + flag actions ──
// Validation is social: unverified until 2+ independent confirmations, and
// the card always shows how fresh the last confirmation is (VISION row 12)

const COMMUNITY_STATUS_LINE = {
  pending:    { color: '#9fb4c8', text: 'Pending — on your map now, publishes with the next sync' },
  unverified: { color: '#fbbf24', text: 'Unverified — reported by a traveler, not yet confirmed' },
  verified:   { color: '#22c55e', text: 'Verified by other travelers' },
}

// queryRenderedFeatures JSON-stringifies nested properties; parse defensively
function parseCheckins(p) {
  try {
    const raw = typeof p.checkins === 'string' ? JSON.parse(p.checkins) : p.checkins
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function checkinRowHtml(c) {
  const mark = c.ok
    ? '<span style="color:#22c55e">✓</span>'
    : '<span style="color:#f87171">✗</span>'
  const note = c.comment ? esc(c.comment) : c.ok ? 'still there' : 'gone / closed'
  return `<div style="font-size:11px;color:rgba(var(--fg-rgb),.75);margin-top:3px;line-height:1.45">${mark} <span style="color:rgba(var(--fg-rgb),.5);font-variant-numeric:tabular-nums">${esc(c.date)}</span> — ${note}</div>`
}

function openCommunitySitePopup(m, f, onSaveSpot) {
  const p = f.properties
  const [lng, lat] = f.geometry.coordinates
  const kindLabel = SITE_KIND_LABELS[p.kind] || 'Spot'
  const status = COMMUNITY_STATUS_LINE[p.status] || COMMUNITY_STATUS_LINE.unverified
  const checkins = parseCheckins(p)
  const shown = checkins.slice(0, 4)
  const maybeGone = p.maybe_gone === true || p.maybe_gone === 'true'
  const canAct = communityEnabled() && p.status !== 'pending'
  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:210px">
      <div style="font-size:13.5px;font-weight:600">${esc(p.name || kindLabel)}</div>
      <div style="font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin:2px 0 5px">${kindLabel} · community</div>
      <div style="font-size:11px;color:${status.color};line-height:1.4"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${status.color};margin-right:5px"></span>${status.text}</div>
      ${maybeGone ? '<div style="font-size:11px;color:#f87171;margin-top:4px;line-height:1.45">Recent check-ins say this may be gone — verify before counting on it</div>' : ''}
      ${p.confirmed ? `<div style="font-size:10.5px;color:rgba(var(--fg-rgb),.55);margin-top:3px">Last confirmed ${esc(p.confirmed)}</div>` : ''}
      ${p.desc ? `<div style="font-size:11.5px;color:rgba(var(--fg-rgb),.75);margin-top:5px;line-height:1.5">${esc(p.desc)}</div>` : ''}
      <div data-checkin-list style="margin-top:5px">${shown.map(checkinRowHtml).join('')}</div>
      ${checkins.length > shown.length ? `<div style="font-size:10px;color:rgba(var(--fg-rgb),.4);margin-top:3px">+ ${checkins.length - shown.length} older check-ins</div>` : ''}
      ${canAct ? `
      <div data-checkin-controls style="margin-top:8px;padding-top:7px;border-top:1px solid rgba(var(--overlay-rgb),0.08)">
        <div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:rgba(var(--fg-rgb),.55);margin-bottom:5px">Been here? Check in</div>
        <input data-ci-comment placeholder="Optional comment — cost, access, condition…" maxlength="280"
          style="width:100%;box-sizing:border-box;background:rgba(var(--overlay-rgb),0.06);border:1px solid rgba(var(--overlay-rgb),0.12);border-radius:6px;color:var(--text-primary);font-size:11px;padding:5px 7px;outline:none">
        <div style="display:flex;gap:6px;margin-top:6px">
          <button data-ci-yes class="btn-secondary" style="flex:1;padding:5px 8px;font-size:11px;justify-content:center">✓ Still there</button>
          <button data-ci-no class="btn-secondary" style="flex:1;padding:5px 8px;font-size:11px;justify-content:center">✗ Gone / closed</button>
        </div>
      </div>` : ''}
      ${weatherHtml()}
      ${directionsHtml(lat, lng, p.name || kindLabel)}
      <button data-save-wp class="btn-primary" style="margin-top:9px;width:100%;padding:6px 10px;font-size:12px">Save as waypoint</button>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:7px">
        <span style="font-size:9.5px;color:rgba(var(--fg-rgb),.35)">Community-reported — verify before relying on it</span>
        ${canAct ? '<button data-flag-spot style="all:unset;cursor:pointer;font-size:9.5px;color:#8babd0;white-space:nowrap">Report a problem</button>' : ''}
      </div>
    </div>`
  const popup = new maplibregl.Popup({ offset: 10, maxWidth: '280px' })
    .setLngLat([lng, lat])
    .setHTML(html)
    .addTo(m)
  attachWeather(popup, lat, lng, m)
  const root = popup.getElement()
  root.querySelector('[data-save-wp]')?.addEventListener('click', () => {
    onSaveSpot?.({ ...p, lat, lng })
    popup.remove()
  })
  if (!canAct) return

  const sendCheckin = async (ok) => {
    const comment = root.querySelector('[data-ci-comment]')?.value?.trim() || ''
    const controls = root.querySelector('[data-checkin-controls]')
    controls.style.opacity = '0.55'
    controls.style.pointerEvents = 'none'
    try {
      const res = await submitCheckin(p.id, ok, comment)
      controls.style.opacity = ''
      controls.innerHTML = `<div style="font-size:11.5px;color:#22c55e;line-height:1.5">${res.held ? 'Thanks — recorded. Your comment shows after a quick review.' : 'Thanks — check-in recorded.'}</div>`
      if (!res.held) {
        root.querySelector('[data-checkin-list]')?.insertAdjacentHTML(
          'afterbegin',
          checkinRowHtml({ date: new Date().toISOString().slice(0, 10), ok, comment })
        )
      }
    } catch (e) {
      controls.style.opacity = ''
      controls.style.pointerEvents = ''
      showToast(m.getContainer(), `Check-in failed: ${e.message}`)
    }
  }
  root.querySelector('[data-ci-yes]')?.addEventListener('click', () => sendCheckin(true))
  root.querySelector('[data-ci-no]')?.addEventListener('click', () => sendCheckin(false))

  const flagBtn = root.querySelector('[data-flag-spot]')
  flagBtn?.addEventListener('click', async () => {
    // two-tap confirm, same as waypoint delete — no blocking dialogs
    if (!flagBtn.dataset.armed) {
      flagBtn.dataset.armed = '1'
      flagBtn.textContent = 'Confirm — report this listing?'
      flagBtn.style.color = '#f87171'
      return
    }
    try {
      await flagSpot(p.id, 'user flag')
      flagBtn.textContent = 'Reported for review'
      flagBtn.style.color = ''
      flagBtn.style.pointerEvents = 'none'
    } catch (e) {
      showToast(m.getContainer(), `Report failed: ${e.message}`)
    }
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
