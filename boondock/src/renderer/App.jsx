import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Map from './components/Map'
import Legend from './components/Legend'
import Guide from './components/Guide'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import WaypointModal from './components/WaypointModal'
import ReportSpotModal, { siteKindForIcon } from './components/ReportSpotModal'
import FeedbackModal from './components/FeedbackModal'
import DownloadModal from './components/DownloadModal'
import StatusBar from './components/StatusBar'
import LiveReadout from './components/LiveReadout'
import AddWaypointMenu from './components/AddWaypointMenu'
import FullScreenInstruments from './components/FullScreenInstruments'
import SunPath from './components/SunPath'
import Sight from './components/Sight'
import { Crosshair, X } from './components/Icons'
import { BASE_LAYERS, DEFAULT_BASE, DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_OVERLAYS } from '../shared/layers'
import { elevationAt } from '../shared/elevation'
import { matchesWpFilter } from '../shared/waypointMeta'
import { DEFAULT_THEME, THEME_IDS, applyTheme } from '../shared/theme'
import { feedbackEnabled } from '../shared/feedback'
import { useWakeLock } from '../shared/useWakeLock'
import './styles/app.css'

export default function App() {
  const [waypoints, setWaypoints] = useState([])
  const [tracks, setTracks] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState('layers')
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE)
  const [theme, setTheme] = useState(DEFAULT_THEME)   // 'auto' follows the basemap
  const [overlays, setOverlays] = useState(DEFAULT_OVERLAYS)
  const [pendingWaypoint, setPendingWaypoint] = useState(null)
  const [reportSpotAt, setReportSpotAt] = useState(null)   // lngLat for the community report dialog
  const [reportPrefill, setReportPrefill] = useState(null)  // set when sharing a saved waypoint (row 116)
  const [selectedWaypoint, setSelectedWaypoint] = useState(null)
  const [isRecordingTrack, setIsRecordingTrack] = useState(false)
  const [currentTrackPoints, setCurrentTrackPoints] = useState([])
  const [mapCursor, setMapCursor] = useState({ lng: 0, lat: 0 })
  const [mapCenterPt, setMapCenterPt] = useState({ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] })
  const [zoomLevel, setZoomLevel] = useState(null)
  const [helpPanel, setHelpPanel] = useState(null) // 'legend' | 'guide' | null
  const [liveReadoutOn, setLiveReadoutOn] = useState(false)   // instrument cluster (VISION row 89)
  const [addMenuOpen, setAddMenuOpen] = useState(false)       // "Add waypoint" chooser (VISION row 93)
  const [pickMode, setPickMode] = useState(false)             // next map tap drops a waypoint
  const [editingWaypointId, setEditingWaypointId] = useState(null)  // its pin is draggable (VISION row 94)
  const [navTarget, setNavTarget] = useState(null)   // beeline compass target (VISION row 90)
  const [navRoute, setNavRoute] = useState(null)     // routed drive (VISION rows 91/133)
  const [vehicle, setVehicle] = useState(null)       // routing profile, null = any vehicle
  const [userFix, setUserFix] = useState(null)       // live GPS position, reported up by the readout
  const [searchPins, setSearchPins] = useState([])   // numbered POI/search results shown on the map
  const [hoverPin, setHoverPin] = useState(null)     // index sync: list row ↔ map pin
  const [searchArea, setSearchArea] = useState(null) // {run} when the map moved away from the last POI search
  const [siteMinElev, setSiteMinElev] = useState(null)   // null = no lower bound
  const [siteKinds, setSiteKinds] = useState(null)       // null = all site types
  const [siteMaxElev, setSiteMaxElev] = useState(null)   // null = no upper bound
  // Temperature filter over the forecast window; null limits are off
  const [tempFilter, setTempFilter] = useState({ startDay: 0, days: 10, maxHi: null, minLo: null, avgLo: null, avgHi: null })
  const [tempStatus, setTempStatus] = useState({ state: 'idle' })  // Map reports grid fetches here
  const [wpFilter, setWpFilter] = useState({ status: null, favorite: false, labels: [] })
  const [wpColors, setWpColors] = useState({})       // per-category pin color overrides
  const [editRequestId, setEditRequestId] = useState(null)   // popup "Edit waypoint" → sidebar
  const [showFeedback, setShowFeedback] = useState(false)
  const [showInstruments, setShowInstruments] = useState(false)   // full-screen instrument mode (VISION row 95)
  const [sunPathAt, setSunPathAt] = useState(null)               // sun path viewer target (VISION row 132)
  const [sightOpen, setSightOpen] = useState(false)              // camera sighting view (VISION row 139)
  const [sighting, setSighting] = useState(null)                 // its last result, drawn on the map
  const [keepAwake, setKeepAwake] = useState(false)               // hold the screen on (VISION row 100)
  const [downloadMode, setDownloadMode] = useState(false)
  const [downloadBbox, setDownloadBbox] = useState(null)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [searchHistory, setSearchHistory] = useState([])
  const [initialViewport, setInitialViewport] = useState(null)  // {center, zoom} from prefs, or defaults
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const mapRef = useRef(null)
  const prefsTimerRef = useRef(null)
  // Block auto-save until the initial load lands, so an empty first render
  // can't overwrite stored data and deleting the last item still persists
  const wpLoadedRef = useRef(false)
  const trLoadedRef = useRef(false)
  const api = window.boondock

  // ── Load persisted data ──────────────────────────────────────────────────
  useEffect(() => {
    if (!api) return
    api.loadWaypoints().then(w => { setWaypoints(w || []); wpLoadedRef.current = true })
    api.loadTracks().then(t => { setTracks(t || []); trLoadedRef.current = true })
    api.loadSearchHistory().then(h => setSearchHistory(h || []))

    // Restore viewport, base layer, overlays from prefs
    api.loadPrefs().then(prefs => {
      if (!prefs) {
        setInitialViewport({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })
        return
      }
      // Migrate prefs from older layer models: unknown ids fall back
      if (prefs.baseLayer && BASE_LAYERS[prefs.baseLayer]) setBaseLayer(prefs.baseLayer)
      if (prefs.theme && THEME_IDS.includes(prefs.theme)) setTheme(prefs.theme)
      if (prefs.overlays) {
        const known = Object.fromEntries(
          Object.entries(prefs.overlays).filter(([k]) => k in DEFAULT_OVERLAYS)
        )
        setOverlays({ ...DEFAULT_OVERLAYS, ...known })
      }
      if (typeof prefs.siteMinElev === 'number') setSiteMinElev(prefs.siteMinElev)
      if (typeof prefs.siteMaxElev === 'number') setSiteMaxElev(prefs.siteMaxElev)
      if (Array.isArray(prefs.siteKinds)) setSiteKinds(prefs.siteKinds)
      if (prefs.tempFilter && typeof prefs.tempFilter === 'object') {
        setTempFilter(f => ({ ...f, ...prefs.tempFilter }))
      }
      if (prefs.wpColors && typeof prefs.wpColors === 'object') setWpColors(prefs.wpColors)
      if (typeof prefs.keepAwake === 'boolean') setKeepAwake(prefs.keepAwake)
      setInitialViewport({
        center: prefs.center || DEFAULT_CENTER,
        zoom: prefs.zoom ?? DEFAULT_ZOOM,
      })
    })

    // Live iCloud sync — phone saves a point, desktop updates
    api.onRemoteWaypointUpdate((updated) => {
      setWaypoints(updated)
    })
  }, [])

  // Chrome theme: 'auto' resolves against the basemap, so picking Boondock
  // Day lightens the sidebar too (VISION rows 63/64)
  useEffect(() => { applyTheme(theme, baseLayer) }, [theme, baseLayer])

  // Screen wake lock (row 100). Held here rather than in the readout so the
  // screen stays on whichever instrument is up — or none of them.
  const wakeLock = useWakeLock(keepAwake)

  // ── Auto-save waypoints whenever they change ─────────────────────────────
  useEffect(() => {
    if (!api || !wpLoadedRef.current) return
    api.saveWaypoints(waypoints)
  }, [waypoints])

  useEffect(() => {
    if (!api || !trLoadedRef.current) return
    api.saveTracks(tracks)
  }, [tracks])

  // ── Save viewport prefs (debounced) ──────────────────────────────────────
  const savePrefs = useCallback(() => {
    if (!api) return
    const m = mapRef.current?.getMap?.()
    if (!m) return
    const c = m.getCenter()
    api.savePrefs({
      center: [c.lng, c.lat],
      zoom: m.getZoom(),
      baseLayer,
      theme,
      overlays,
      siteMinElev,
      siteMaxElev,
      siteKinds,
      tempFilter,
      wpColors,
      keepAwake,
    })
  }, [baseLayer, theme, overlays, siteMinElev, siteMaxElev, siteKinds, tempFilter, wpColors, keepAwake])

  // Save prefs when base layer, overlays, filters, or colors change
  useEffect(() => { if (api && initialViewport) savePrefs() }, [baseLayer, theme, overlays, siteMinElev, siteMaxElev, siteKinds, tempFilter, wpColors, keepAwake])

  // Expose a handler for Map to call on moveend (debounced)
  const handleViewportChange = useCallback(() => {
    clearTimeout(prefsTimerRef.current)
    prefsTimerRef.current = setTimeout(savePrefs, 800)
  }, [savePrefs])

  // ── Search history management ───────────────────────────────────────────
  const addSearchHistory = useCallback((entry) => {
    setSearchHistory(prev => {
      // Deduplicate by name
      const filtered = prev.filter(h => h.name !== entry.name)
      const updated = [{ ...entry, searchedAt: new Date().toISOString() }, ...filtered].slice(0, 50)
      api?.saveSearchHistory(updated)
      return updated
    })
  }, [])

  const toggleLiveReadout = useCallback(() => setLiveReadoutOn(v => !v), [])

  // ── Beeline navigation (VISION row 90) ───────────────────────────────────
  // "Guide me here" on any point card sets a target and shows the readout;
  // the ribbon points the way and the map draws the straight line.
  const onNavigate = useCallback((t) => { setNavTarget(t); setLiveReadoutOn(true) }, [])
  useEffect(() => { if (navRoute) setLiveReadoutOn(true) }, [navRoute])
  const cancelRoute = useCallback(() => {
    mapRef.current?.clearRoute?.()
    setNavRoute(null)
  }, [])
  const cancelNav = useCallback(() => setNavTarget(null), [])
  const handleFix = useCallback((f) => setUserFix(f), [])

  // Sun path opens on whatever point was asked for; from the toolbar that is
  // the live fix if there is one, and the middle of the map if there is not
  const openSunPath = useCallback((at) => {
    if (at && Number.isFinite(at.lat) && Number.isFinite(at.lng)) { setSunPathAt(at); return }
    setSunPathAt(userFix
      ? { lat: userFix.lat, lng: userFix.lng, name: 'My location' }
      // No live fix yet: open on the map so there is something to read at
      // once, and let the viewer upgrade to a real one when the GPS answers
      : { lat: mapCenterPt.lat, lng: mapCenterPt.lng, name: 'Map centre', locate: true })
  }, [userFix, mapCenterPt])
  // Putting the readout away also ends navigation, so the line can't freeze
  useEffect(() => { if (!liveReadoutOn) setNavTarget(null) }, [liveReadoutOn])

  // A sighting lands on the map as a line, an error fan, and a ring on the
  // estimate; zoom out enough to show the whole of it (VISION row 139)
  const handleSighting = useCallback((r) => {
    setSighting(r)
    if (!r?.hit) return
    const pts = [[r.eye.lng, r.eye.lat], [r.hit.lng, r.hit.lat], ...(r.fan || [])]
    const lngs = pts.map(p => p[0]), lats = pts.map(p => p[1])
    mapRef.current?.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 70, duration: 800, maxZoom: 14 },
    )
  }, [])

  // Stable reference unless the set actually changes. Without this the .filter()
  // ran on every render (each mousemove fires setMapCursor), handing Map a fresh
  // array each time — which re-ran its marker effect and reset a pin's position
  // mid-drag, fighting the row-94 drag. Memoizing also drops the per-mousemove
  // marker churn.
  const visibleWaypoints = useMemo(
    () => waypoints.filter(w => matchesWpFilter(w, wpFilter)),
    [waypoints, wpFilter]
  )

  // ── Add waypoint (VISION row 93) ─────────────────────────────────────────
  // The map control opens a chooser; while pick-mode is armed it cancels it.
  const onAddWaypoint = useCallback(() => {
    if (pickMode) { setPickMode(false); return }
    setAddMenuOpen(o => !o)
  }, [pickMode])
  const enterPickMode = useCallback(() => {
    setAddMenuOpen(false)
    setDownloadMode(false)   // the two map-tap modes can't share the pointer
    setPickMode(true)
  }, [])
  const dropAtLocation = useCallback((ll) => {
    setAddMenuOpen(false)
    // Prefilled, selected name so one keystroke renames it (row 59 pattern);
    // elevation is sampled after save like every other drop.
    setPendingWaypoint({ lng: ll.lng, lat: ll.lat, prefill: { name: 'My location' } })
  }, [])

  // ── Map click → drop waypoint ────────────────────────────────────────────
  const handleMapClick = useCallback((lngLat) => {
    if (downloadMode) return  // bbox drawing mode handles its own clicks
    setPickMode(false)        // a pick-mode tap lands here too (VISION row 93)
    setPendingWaypoint({ lng: lngLat.lng, lat: lngLat.lat })
  }, [downloadMode])

  // Waypoints carry their elevation; sampled quietly after save
  const attachElevation = useCallback((id, lat, lng) => {
    elevationAt(lng, lat).then(meters => {
      if (meters == null) return
      const ft = Math.round(meters * 3.28084)
      setWaypoints(prev => prev.map(w => w.id === id ? { ...w, elev_ft: ft } : w))
    }).catch(() => {})
  }, [])

  const saveWaypoint = useCallback((waypointData) => {
    const wp = {
      id: crypto.randomUUID(),
      ...waypointData,
      createdAt: new Date().toISOString(),
    }
    setWaypoints(prev => [...prev, wp])
    setPendingWaypoint(null)
    setActiveTab('waypoints')
    setSidebarOpen(true)
    if (wp.elev_ft == null) attachElevation(wp.id, wp.lat, wp.lng)
  }, [attachElevation])

  const deleteWaypoint = useCallback((id) => {
    setWaypoints(prev => prev.filter(w => w.id !== id))
    if (selectedWaypoint?.id === id) setSelectedWaypoint(null)
  }, [selectedWaypoint])

  const updateWaypoint = useCallback((id, updates) => {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
  }, [])

  // Pin dragged to a new spot in edit mode (VISION row 94). The old elevation
  // is now wrong, so clear it and re-sample at the new coordinate.
  const relocateWaypoint = useCallback((id, ll) => {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, lat: ll.lat, lng: ll.lng, elev_ft: null } : w))
    setSelectedWaypoint(sw => (sw?.id === id ? { ...sw, lat: ll.lat, lng: ll.lng } : sw))
    attachElevation(id, ll.lat, ll.lng)
  }, [attachElevation])

  // ── Fly to coordinate or place (from search bar) ─────────────────────────
  const flyToCoord = useCallback((coord, dropWaypoint = false) => {
    const m = mapRef.current
    if (!m) return
    if (coord.bbox) {
      // Fit to bounding box for places/areas (cities, parks, etc.)
      m.fitBounds(
        [[coord.bbox[0], coord.bbox[1]], [coord.bbox[2], coord.bbox[3]]],
        { padding: 60, duration: 800, maxZoom: 15 }
      )
    } else {
      m.flyTo({ center: [coord.lng, coord.lat], zoom: 14, duration: 800 })
    }
    if (dropWaypoint) {
      setPendingWaypoint({ lng: coord.lng, lat: coord.lat })
    }
  }, [])

  // ── Track recording ──────────────────────────────────────────────────────
  const startTrack = useCallback(() => {
    setIsRecordingTrack(true)
    setCurrentTrackPoints([])
  }, [])

  const addTrackPoint = useCallback((point) => {
    if (!isRecordingTrack) return
    setCurrentTrackPoints(prev => [...prev, { ...point, time: new Date().toISOString() }])
  }, [isRecordingTrack])

  const stopTrack = useCallback((name) => {
    if (currentTrackPoints.length < 2) {
      setIsRecordingTrack(false)
      setCurrentTrackPoints([])
      return
    }
    const track = {
      id: crypto.randomUUID(),
      name: name || `Track ${new Date().toLocaleDateString()}`,
      points: currentTrackPoints,
      createdAt: new Date().toISOString(),
      distance: calculateDistance(currentTrackPoints),
    }
    setTracks(prev => [...prev, track])
    setIsRecordingTrack(false)
    setCurrentTrackPoints([])
    setActiveTab('tracks')
  }, [currentTrackPoints])

  // ── Save a Sites-layer spot as a waypoint (from map popup) ───────────────
  // Opens the same modal as a ground-click save, prefilled from the site
  const saveSpotAsWaypoint = useCallback((s) => {
    if (!s) return
    const iconMap = { campsite: 'camp', rv_park: 'parking', dump: 'dump', water: 'water', trailhead: 'trailhead' }
    setPendingWaypoint({
      lng: s.lng,
      lat: s.lat,
      ...(s.elev_ft != null && { elev_ft: Number(s.elev_ft) }),
      prefill: {
        name: s.name || 'Site',
        notes: s.desc || '',
        icon: iconMap[s.kind] || 'generic',
      },
    })
  }, [])

  // ── Fly to waypoint ──────────────────────────────────────────────────────
  const flyToWaypoint = useCallback((wp) => {
    mapRef.current?.flyTo({ center: [wp.lng, wp.lat], zoom: 14, duration: 800 })
    setSelectedWaypoint(wp)
  }, [])

  // ── GPX export ───────────────────────────────────────────────────────────
  const exportGPX = useCallback(async () => {
    if (!api) return
    await api.exportGPX({ waypoints, tracks })
  }, [waypoints, tracks])

  // ── GPX import ───────────────────────────────────────────────────────────
  const importGPX = useCallback(async () => {
    if (!api) return
    const result = await api.importGPX()
    if (!result.ok) return
    result.files.forEach(file => {
      const parsed = parseGPX(file.content)
      if (parsed.waypoints.length) {
        setWaypoints(prev => [...prev, ...parsed.waypoints])
      }
      if (parsed.tracks.length) {
        setTracks(prev => [...prev, ...parsed.tracks])
      }
    })
  }, [])

  return (
    <div className="app">
      <Toolbar
        helpPanel={helpPanel}
        onToggleHelp={(which) => setHelpPanel(p => p === which ? null : which)}
        onFeedback={() => setShowFeedback(true)}
        feedbackEnabled={feedbackEnabled()}
        isRecordingTrack={isRecordingTrack}
        onStartTrack={startTrack}
        onStopTrack={stopTrack}
        onExportGPX={exportGPX}
        onImportGPX={importGPX}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onToggleDownloadMode={() => {
          setDownloadMode(d => !d)
          setDownloadBbox(null)
        }}
        downloadMode={downloadMode}
        onOpenSyncFolder={() => api?.openSyncFolder()}
        onSunPath={() => openSunPath(null)}
        onSight={() => setSightOpen(true)}
      />

      <div className="app-body">
        {(sidebarOpen || isMobile) && (
          <Sidebar
            isMobile={isMobile}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            waypoints={waypoints}
            tracks={tracks}
            overlays={overlays}
            setOverlays={setOverlays}
            baseLayer={baseLayer}
            setBaseLayer={setBaseLayer}
            theme={theme}
            setTheme={setTheme}
            onWaypointClick={flyToWaypoint}
            onWaypointDelete={deleteWaypoint}
            onWaypointUpdate={updateWaypoint}
            selectedWaypoint={selectedWaypoint}
            onDownloadBbox={() => {
              setActiveTab('layers')
              setDownloadMode(true)
            }}
            onShowDownloadModal={() => setShowDownloadModal(true)}
            onShareWaypoint={(wp) => {
              // Publishes a *copy*; the waypoint itself stays private
              setReportPrefill({ kind: siteKindForIcon(wp.icon), name: wp.name || '', desc: wp.notes || '' })
              setReportSpotAt({ lng: wp.lng, lat: wp.lat })
            }}
            onFlyTo={flyToCoord}
            downloadBbox={downloadBbox}
            searchHistory={searchHistory}
            onAddSearchHistory={addSearchHistory}
            mapCenter={mapCenterPt}
            onSearchPins={setSearchPins}
            hoverPin={hoverPin}
            onHoverPin={setHoverPin}
            onSearchArea={setSearchArea}
            wpFilter={wpFilter}
            setWpFilter={setWpFilter}
            wpColors={wpColors}
            setWpColors={setWpColors}
            editRequestId={editRequestId}
            onEditHandled={() => setEditRequestId(null)}
            onEditingChange={setEditingWaypointId}
            siteMinElev={siteMinElev}
            setSiteMinElev={setSiteMinElev}
            siteMaxElev={siteMaxElev}
            setSiteMaxElev={setSiteMaxElev}
            siteKinds={siteKinds}
            setSiteKinds={setSiteKinds}
            tempFilter={tempFilter}
            setTempFilter={setTempFilter}
            tempStatus={tempStatus}
          />
        )}

        <div className="map-wrap">
        <Map
          ref={mapRef}
          baseLayer={baseLayer}
          overlays={overlays}
          waypoints={visibleWaypoints}
          tracks={tracks}
          currentTrackPoints={currentTrackPoints}
          selectedWaypoint={selectedWaypoint}
          onMapClick={handleMapClick}
          onMouseMove={setMapCursor}
          onTrackPoint={addTrackPoint}
          isRecordingTrack={isRecordingTrack}
          downloadMode={downloadMode}
          onBboxDrawn={(bbox) => {
            setDownloadBbox(bbox)
            setShowDownloadModal(true)
          }}
          onWaypointClick={setSelectedWaypoint}
          initialViewport={initialViewport}
          onViewportChange={handleViewportChange}
          showPackAreas={activeTab === 'download'}
          onSaveSpot={saveSpotAsWaypoint}
          searchPins={searchPins}
          hoverPin={hoverPin}
          onPinHover={setHoverPin}
          onZoomChange={setZoomLevel}
          onCenterChange={setMapCenterPt}
          siteMinElev={siteMinElev}
          siteMaxElev={siteMaxElev}
          siteKinds={siteKinds}
          tempFilter={tempFilter}
          onTempStatus={setTempStatus}
          wpColors={wpColors}
          onWaypointEdit={(id) => {
            setActiveTab('waypoints')
            setSidebarOpen(true)
            setEditRequestId(id)
          }}
          onWaypointDelete={deleteWaypoint}
          onReportSpot={setReportSpotAt}
          liveReadoutOn={liveReadoutOn}
          onToggleLiveReadout={toggleLiveReadout}
          pickMode={pickMode}
          onAddWaypoint={onAddWaypoint}
          addActive={addMenuOpen || pickMode}
          editingWaypointId={editingWaypointId}
          onWaypointRelocate={relocateWaypoint}
          navTarget={navTarget}
          userFix={userFix}
          onRoute={setNavRoute}
          vehicle={vehicle}
          onNavigate={onNavigate}
          onSunPath={openSunPath}
          sighting={sighting}
        />
        <Legend open={helpPanel === 'legend'} onClose={() => setHelpPanel(null)} />
        <Guide open={helpPanel === 'guide'} onClose={() => setHelpPanel(null)} />
        {liveReadoutOn && (
          <LiveReadout
            navTarget={navTarget}
            navRoute={navRoute}
            onCancelRoute={cancelRoute}
            vehicle={vehicle}
            onVehicleChange={setVehicle}
            onFix={handleFix}
            onCancelNav={cancelNav}
            onOpenInstruments={() => setShowInstruments(true)}
            keepAwake={keepAwake}
            wakeLock={wakeLock}
            onToggleKeepAwake={() => setKeepAwake(v => !v)}
          />
        )}
        {addMenuOpen && (
          <AddWaypointMenu
            onAtLocation={dropAtLocation}
            onPickOnMap={enterPickMode}
            onClose={() => setAddMenuOpen(false)}
          />
        )}
        {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
        {searchArea && (
          <button className="search-area-btn" onClick={() => searchArea.run()}>
            Search this area
          </button>
        )}
        {sighting?.hit && !sightOpen && (
          <div className="sight-chip">
            <Crosshair size={13} />
            <span>
              Sighted point {fmtSightMi(sighting.hit.distance)} out
              {sighting.hit.elevation != null ? ` · ${Math.round(sighting.hit.elevation * 3.28084).toLocaleString()} ft` : ''}
              {sighting.grazing ? ' · grazing, trust the strip' : ''}
            </span>
            <button className="sight-chip-btn" onClick={() => setPendingWaypoint({
              lng: sighting.hit.lng, lat: sighting.hit.lat,
              ...(sighting.hit.elevation != null && { elev_ft: Math.round(sighting.hit.elevation * 3.28084) }),
              prefill: { name: 'Sighted point', icon: 'viewpoint', notes: sighting.note || '' },
            })}>Save</button>
            <button className="sight-chip-x" onClick={() => setSighting(null)} aria-label="Clear sighting"><X size={13} /></button>
          </div>
        )}
        </div>
      </div>

      <StatusBar cursor={mapCursor} zoom={zoomLevel} isRecording={isRecordingTrack} trackPoints={currentTrackPoints.length} />

      {pendingWaypoint && (
        <WaypointModal
          lngLat={pendingWaypoint}
          prefill={pendingWaypoint.prefill}
          onSave={saveWaypoint}
          onCancel={() => setPendingWaypoint(null)}
          labelVocab={[...new Set(waypoints.flatMap(w => w.labels || []))].sort()}
        />
      )}

      {reportSpotAt && (
        <ReportSpotModal
          lngLat={reportSpotAt}
          prefill={reportPrefill}
          onClose={() => { setReportSpotAt(null); setReportPrefill(null) }}
          onSubmitted={(feature) => mapRef.current?.addCommunityFeature?.(feature)}
        />
      )}

      {showInstruments && (
        <FullScreenInstruments
          onClose={() => setShowInstruments(false)}
          keepAwake={keepAwake}
          wakeLock={wakeLock}
          onToggleKeepAwake={() => setKeepAwake(v => !v)}
        />
      )}

      {sunPathAt && (
        <SunPath
          location={sunPathAt}
          onClose={() => setSunPathAt(null)}
          keepAwake={keepAwake}
          wakeLock={wakeLock}
          onToggleKeepAwake={() => setKeepAwake(v => !v)}
        />
      )}

      {sightOpen && (
        <Sight
          onClose={() => setSightOpen(false)}
          onResult={handleSighting}
          onSaveWaypoint={setPendingWaypoint}
        />
      )}

      {showDownloadModal && (
        <DownloadModal
          bbox={downloadBbox}
          getViewBbox={() => {
            const b = mapRef.current?.getMap?.()?.getBounds()
            return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null
          }}
          onClose={() => { setShowDownloadModal(false); setDownloadMode(false); setDownloadBbox(null) }}
          onStartDownload={() => { setDownloadMode(false); setDownloadBbox(null) }}
        />
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtSightMi(m) {
  const mi = m / 1609.34
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi.toFixed(1)} mi`
}

function calculateDistance(points) {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    const dx = (points[i].lng - points[i-1].lng) * 111320 * Math.cos(points[i].lat * Math.PI / 180)
    const dy = (points[i].lat - points[i-1].lat) * 110540
    d += Math.sqrt(dx*dx + dy*dy)
  }
  return Math.round(d / 1609.34 * 100) / 100  // miles
}

function parseGPX(xmlString) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'text/xml')
  const wpts = Array.from(doc.querySelectorAll('wpt')).map(el => {
    const ele = parseFloat(el.querySelector('ele')?.textContent)
    const type = el.querySelector('type')?.textContent
    return {
      id: crypto.randomUUID(),
      lat: parseFloat(el.getAttribute('lat')),
      lng: parseFloat(el.getAttribute('lon')),
      name: el.querySelector('name')?.textContent || 'Imported',
      notes: el.querySelector('desc')?.textContent || '',
      icon: 'generic',
      ...(Number.isFinite(ele) && { elev_ft: Math.round(ele * 3.28084) }),
      ...(() => {
        if (!type) return {}
        const favorite = type === 'fav' || type.endsWith('-fav')
        const status = type.replace(/-?fav$/, '').replace(/-$/, '')
        return {
          ...(favorite && { favorite: true }),
          ...(['been', 'been-nc', 'explore'].includes(status) && { status }),
        }
      })(),
      createdAt: el.querySelector('time')?.textContent || new Date().toISOString(),
    }
  })
  const trks = Array.from(doc.querySelectorAll('trk')).map(el => ({
    id: crypto.randomUUID(),
    name: el.querySelector('name')?.textContent || 'Imported Track',
    points: Array.from(el.querySelectorAll('trkpt')).map(pt => ({
      lat: parseFloat(pt.getAttribute('lat')),
      lng: parseFloat(pt.getAttribute('lon')),
      ele: parseFloat(pt.querySelector('ele')?.textContent || 0),
      time: pt.querySelector('time')?.textContent || '',
    })),
    createdAt: new Date().toISOString(),
  }))
  return { waypoints: wpts, tracks: trks }
}
