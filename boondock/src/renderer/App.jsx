import { useState, useEffect, useRef, useCallback } from 'react'
import Map from './components/Map'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import WaypointModal from './components/WaypointModal'
import DownloadModal from './components/DownloadModal'
import StatusBar from './components/StatusBar'
import { BASE_LAYERS, DEFAULT_BASE, DEFAULT_CENTER, DEFAULT_ZOOM, DEFAULT_OVERLAYS } from '../shared/layers'
import { elevationAt } from '../shared/elevation'
import './styles/app.css'

export default function App() {
  const [waypoints, setWaypoints] = useState([])
  const [tracks, setTracks] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeTab, setActiveTab] = useState('layers')
  const [baseLayer, setBaseLayer] = useState(DEFAULT_BASE)
  const [overlays, setOverlays] = useState(DEFAULT_OVERLAYS)
  const [pendingWaypoint, setPendingWaypoint] = useState(null)
  const [selectedWaypoint, setSelectedWaypoint] = useState(null)
  const [isRecordingTrack, setIsRecordingTrack] = useState(false)
  const [currentTrackPoints, setCurrentTrackPoints] = useState([])
  const [mapCursor, setMapCursor] = useState({ lng: 0, lat: 0 })
  const [mapCenterPt, setMapCenterPt] = useState({ lng: DEFAULT_CENTER[0], lat: DEFAULT_CENTER[1] })
  const [zoomLevel, setZoomLevel] = useState(null)
  const [searchPins, setSearchPins] = useState([])   // numbered POI/search results shown on the map
  const [siteMinElev, setSiteMinElev] = useState(null)   // null = no lower bound
  const [siteMaxElev, setSiteMaxElev] = useState(null)   // null = no upper bound
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
      if (prefs.overlays) {
        const known = Object.fromEntries(
          Object.entries(prefs.overlays).filter(([k]) => k in DEFAULT_OVERLAYS)
        )
        setOverlays({ ...DEFAULT_OVERLAYS, ...known })
      }
      if (typeof prefs.siteMinElev === 'number') setSiteMinElev(prefs.siteMinElev)
      if (typeof prefs.siteMaxElev === 'number') setSiteMaxElev(prefs.siteMaxElev)
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
      overlays,
      siteMinElev,
      siteMaxElev,
    })
  }, [baseLayer, overlays, siteMinElev, siteMaxElev])

  // Save prefs when base layer, overlays, or filters change
  useEffect(() => { if (api && initialViewport) savePrefs() }, [baseLayer, overlays, siteMinElev, siteMaxElev])

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

  // ── Map click → drop waypoint ────────────────────────────────────────────
  const handleMapClick = useCallback((lngLat) => {
    if (downloadMode) return  // bbox drawing mode handles its own clicks
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
    attachElevation(wp.id, wp.lat, wp.lng)
  }, [attachElevation])

  const deleteWaypoint = useCallback((id) => {
    setWaypoints(prev => prev.filter(w => w.id !== id))
    if (selectedWaypoint?.id === id) setSelectedWaypoint(null)
  }, [selectedWaypoint])

  const updateWaypoint = useCallback((id, updates) => {
    setWaypoints(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w))
  }, [])

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
  const saveSpotAsWaypoint = useCallback((s) => {
    if (!s) return
    const iconMap = { campsite: 'camp', rv_park: 'parking', dump: 'generic', water: 'water', trailhead: 'trailhead' }
    const id = crypto.randomUUID()
    setWaypoints(prev => [...prev, {
      id,
      name: s.name || 'Site',
      notes: s.desc || '',
      icon: iconMap[s.kind] || 'generic',
      lat: s.lat,
      lng: s.lng,
      ...(s.elev_ft != null && { elev_ft: Number(s.elev_ft) }),
      createdAt: new Date().toISOString(),
    }])
    if (s.elev_ft == null) attachElevation(id, s.lat, s.lng)
  }, [attachElevation])

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
            onWaypointClick={flyToWaypoint}
            onWaypointDelete={deleteWaypoint}
            onWaypointUpdate={updateWaypoint}
            selectedWaypoint={selectedWaypoint}
            onDownloadBbox={() => {
              setActiveTab('layers')
              setDownloadMode(true)
            }}
            onShowDownloadModal={() => setShowDownloadModal(true)}
            onFlyTo={flyToCoord}
            downloadBbox={downloadBbox}
            searchHistory={searchHistory}
            onAddSearchHistory={addSearchHistory}
            mapCenter={mapCenterPt}
            onSearchPins={setSearchPins}
            siteMinElev={siteMinElev}
            setSiteMinElev={setSiteMinElev}
            siteMaxElev={siteMaxElev}
            setSiteMaxElev={setSiteMaxElev}
          />
        )}

        <Map
          ref={mapRef}
          baseLayer={baseLayer}
          overlays={overlays}
          waypoints={waypoints}
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
          onZoomChange={setZoomLevel}
          onCenterChange={setMapCenterPt}
          siteMinElev={siteMinElev}
          siteMaxElev={siteMaxElev}
        />
      </div>

      <StatusBar cursor={mapCursor} zoom={zoomLevel} isRecording={isRecordingTrack} trackPoints={currentTrackPoints.length} />

      {pendingWaypoint && (
        <WaypointModal
          lngLat={pendingWaypoint}
          onSave={saveWaypoint}
          onCancel={() => setPendingWaypoint(null)}
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
  const wpts = Array.from(doc.querySelectorAll('wpt')).map(el => ({
    id: crypto.randomUUID(),
    lat: parseFloat(el.getAttribute('lat')),
    lng: parseFloat(el.getAttribute('lon')),
    name: el.querySelector('name')?.textContent || 'Imported',
    notes: el.querySelector('desc')?.textContent || '',
    icon: 'generic',
    createdAt: el.querySelector('time')?.textContent || new Date().toISOString(),
  }))
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
