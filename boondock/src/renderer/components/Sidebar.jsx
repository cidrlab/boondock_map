import { useState, useRef, useEffect } from 'react'
import { BASE_LAYERS, OVERLAY_LAYERS, SITE_KINDS } from '../../shared/layers'
import { THEMES } from '../../shared/theme'
import { listPacks, deletePack, storageEstimate } from '../../shared/offlineTiles'
import { WP_STATUS_META, WP_STATUS_OPTIONS, WP_RATING_KEYS, statusBadgeColor, matchesWpFilter } from '../../shared/waypointMeta'
import { parseCoords, formatCoords } from '../../shared/parseCoords'
import { windowRange, FORECAST_DAYS } from '../../shared/weather'
import { useGeocoder } from '../../shared/useGeocoder'
import { usePoiSearch, POI_CATEGORIES } from '../../shared/usePoiSearch'
import { communityEnabled } from '../../shared/community'
import {
  MapPin, Layers, Route, Download, Search, X, Edit3, Trash2, ChevronDown,
  Loader, Navigation, MapPinPlus, Crosshair,
  WAYPOINT_ICON_COMPONENTS, WAYPOINT_COLORS,
} from './Icons'
import './Sidebar.css'

// Collapsible sidebar section (VISION row 74). The Layers tab kept growing —
// Appearance pushed the filters below the fold — so each block folds away and
// remembers that per device.
const COLLAPSE_KEY = 'boondock-collapsed-sections'

// Elevation filter ceiling. Denali is 20,310 ft — the highest point in the US
// per the 2015 USGS GPS resurvey — so 20,500 clears it and the top of the
// slider genuinely means "no upper limit" (VISION row 68). It used to stop at
// 8,250, which silently hid every site above that.
const MAX_ELEV_FT = 20500

function Section({ id, title, collapsed, onToggle, first, children }) {
  return (
    <div style={first ? undefined : { marginTop: 20 }}>
      <button
        className={`section-hdr section-toggle ${collapsed ? 'collapsed' : ''}`}
        onClick={() => onToggle(id)}
        aria-expanded={!collapsed}
      >
        <span>{title}</span>
        <ChevronDown size={12} className="section-caret" />
      </button>
      {!collapsed && children}
    </div>
  )
}

const WAYPOINT_ICONS = ['generic','camp','water','hazard','trailhead','viewpoint','fuel','parking']

const SHEET_STATES = ['peek', 'half', 'full']

export default function Sidebar({
  activeTab, setActiveTab, waypoints, tracks,
  overlays, setOverlays, baseLayer, setBaseLayer, theme, setTheme,
  onWaypointClick, onWaypointDelete, onWaypointUpdate,
  selectedWaypoint, onShowDownloadModal, downloadBbox, onShareWaypoint,
  onFlyTo, searchHistory, onAddSearchHistory, mapCenter,
  isMobile, onSearchPins, hoverPin, onHoverPin, onSearchArea,
  siteMinElev, setSiteMinElev, siteMaxElev, setSiteMaxElev,
  siteKinds, setSiteKinds,
  tempFilter, setTempFilter, tempStatus,
  wpFilter, setWpFilter, wpColors, setWpColors, editRequestId, onEditHandled, onEditingChange,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY)) || {} } catch { return {} }
  })
  // defaultCollapsed lets a block start folded without that first click being
  // a no-op — an unset key has to read as "closed" for those, not "open"
  const toggleSection = (id, defaultCollapsed = false) => setCollapsed(prev => {
    const next = { ...prev, [id]: !(prev[id] ?? defaultCollapsed) }
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState('peek')
  const sheetDragY = useRef(null)

  const sheetStep = (dir) => setSheet(s => {
    const i = SHEET_STATES.indexOf(s) + dir
    return SHEET_STATES[Math.max(0, Math.min(SHEET_STATES.length - 1, i))]
  })

  const handleTabClick = (id) => {
    if (isMobile) {
      if (id === activeTab && sheet !== 'peek') { setSheet('peek'); return }
      setActiveTab(id)
      if (sheet === 'peek') setSheet('half')
    } else {
      setActiveTab(id)
    }
  }
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [selectedGeoIdx, setSelectedGeoIdx] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const searchRef = useRef(null)
  const historyRef = useRef(null)

  const { results: geoResults, loading: geoLoading, search: geoSearch, clear: geoClear } = useGeocoder()
  const { results: poiResults, loading: poiLoading, activeCategory: poiCategory, search: poiSearch, clear: poiClear } = usePoiSearch()
  // Starts folded — an unset key means closed for this one (VISION row 104)
  const poiChipsCollapsed = collapsed.poi ?? true
  const activePoi = POI_CATEGORIES.find(c => c.id === poiCategory)

  const coordResult = parseCoords(query)
  const isSearching = query.trim().length >= 2
  const isCoord = !!coordResult
  const isGeoSearch = isSearching && !isCoord

  const detailFiltered = waypoints.filter(w => matchesWpFilter(w, wpFilter))
  const filteredWaypoints = isCoord || !isSearching
    ? detailFiltered
    : detailFiltered.filter(w =>
        w.name.toLowerCase().includes(query.toLowerCase()) ||
        (w.notes || '').toLowerCase().includes(query.toLowerCase())
      )

  // Show/hide history dropdown
  const visibleHistory = searchHistory || []
  const historySlice = showAllHistory ? visibleHistory : visibleHistory.slice(0, 3)
  const hasMoreHistory = visibleHistory.length > 3

  // Close history when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target) &&
          searchRef.current && !searchRef.current.contains(e.target)) {
        setShowHistory(false)
        setShowAllHistory(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (isGeoSearch) { geoSearch(query, mapCenter); setSelectedGeoIdx(0); setShowHistory(false) }
    else { geoClear() }
  }, [query, isGeoSearch])

  // Mirror whichever result list is active onto the map as numbered pins
  useEffect(() => {
    const active = poiResults.length ? poiResults : geoResults
    onSearchPins?.(active.map(r => ({ lat: r.lat, lng: r.lng, name: r.name, detail: r.detail || null })))
  }, [poiResults, geoResults])

  // "Search this area": offer a re-run when the map leaves the searched spot
  const lastPoiCenterRef = useRef(null)
  useEffect(() => {
    if (!poiCategory || !lastPoiCenterRef.current || !mapCenter?.lat) {
      onSearchArea?.(null)
      return
    }
    const c = lastPoiCenterRef.current
    const dx = (mapCenter.lng - c.lng) * 111320 * Math.cos(mapCenter.lat * Math.PI / 180)
    const dy = (mapCenter.lat - c.lat) * 110540
    const movedM = Math.hypot(dx, dy)
    onSearchArea?.(movedM > 2500 ? {
      run: () => {
        lastPoiCenterRef.current = { ...mapCenter }
        poiSearch(poiCategory, mapCenter)
        onSearchArea?.(null)
      },
    } : null)
  }, [mapCenter, poiCategory])

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); geoClear(); setShowHistory(false); return }
    if (isCoord && e.key === 'Enter') { onFlyTo(coordResult); setQuery(''); return }
    if (isGeoSearch && geoResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedGeoIdx(i => Math.min(i + 1, geoResults.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedGeoIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter')     { flyToGeoResult(geoResults[selectedGeoIdx]); return }
    }
  }

  const flyToGeoResult = (result, dropWaypoint = false) => {
    if (!result) return
    const coord = result.bbox
      ? { lat: result.lat, lng: result.lng, bbox: result.bbox }
      : { lat: result.lat, lng: result.lng }
    onFlyTo(coord, dropWaypoint)
    // Add to search history
    onAddSearchHistory?.({
      name: result.name || result.displayName,
      displayName: result.displayName,
      lat: result.lat,
      lng: result.lng,
      bbox: result.bbox || null,
    })
    setQuery(''); geoClear(); setShowHistory(false)
  }

  const flyToHistoryItem = (item) => {
    const coord = item.bbox
      ? { lat: item.lat, lng: item.lng, bbox: item.bbox }
      : { lat: item.lat, lng: item.lng }
    onFlyTo(coord)
    setShowHistory(false); setShowAllHistory(false)
  }

  const [editStatus, setEditStatus] = useState('unknown')
  const [editFavorite, setEditFavorite] = useState(false)
  const [editLabels, setEditLabels] = useState([])
  const [confirmDel, setConfirmDel] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [editRatings, setEditRatings] = useState({})
  const [editColor, setEditColor] = useState(null)

  // Label vocabulary = every label ever used across waypoints
  const labelVocab = [...new Set(waypoints.flatMap(w => w.labels || []))].sort()

  const startEdit = (wp) => {
    setConfirmDel(false)
    setEditingId(wp.id)
    setEditName(wp.name)
    setEditNotes(wp.notes || '')
    setEditStatus(wp.status || 'unknown')
    setEditFavorite(!!wp.favorite)
    setEditLabels(wp.labels || [])
    setEditRatings(wp.ratings || {})
    setEditColor(wp.color || null)
  }
  const saveEdit = (id) => {
    onWaypointUpdate(id, {
      name: editName,
      notes: editNotes,
      status: editStatus === 'unknown' ? undefined : editStatus,
      favorite: editFavorite || undefined,
      labels: editLabels.length ? editLabels : undefined,
      ratings: Object.keys(editRatings).length ? editRatings : undefined,
      color: editColor || undefined,
    })
    setEditingId(null)
  }
  // Popup "Edit waypoint" hands off here
  useEffect(() => {
    if (!editRequestId) return
    const wp = waypoints.find(w => w.id === editRequestId)
    if (wp) startEdit(wp)
    onEditHandled?.()
  }, [editRequestId])

  // Tell the app which waypoint is open in the editor, so its map pin becomes
  // draggable (VISION row 94). Covers every exit path (save/cancel/delete).
  useEffect(() => { onEditingChange?.(editingId) }, [editingId])

  const toggleEditLabel = (l) => setEditLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  const addNewLabel = () => {
    const l = newLabel.trim().toLowerCase()
    if (l && !editLabels.includes(l)) setEditLabels(prev => [...prev, l])
    setNewLabel('')
  }

  const tabs = [
    { id: 'waypoints', Icon: MapPin,   label: 'Points' },
    { id: 'tracks',    Icon: Route,    label: 'Tracks' },
    { id: 'layers',    Icon: Layers,   label: 'Layers' },
    { id: 'download',  Icon: Download, label: 'Offline' },
  ]

  return (
    <aside className={`sidebar ${isMobile ? `sheet-${sheet}` : ''}`}>
      {/* ── Sheet header: grip + tabs (tabs double as the drag handle) ── */}
      <div
        className="sheet-header"
        onPointerDown={e => { sheetDragY.current = e.clientY }}
        onPointerUp={e => {
          if (sheetDragY.current == null) return
          const d = e.clientY - sheetDragY.current
          sheetDragY.current = null
          if (d < -40) sheetStep(1)
          else if (d > 40) sheetStep(-1)
        }}
      >
        <div className="sheet-grip" />
        <nav className="sidebar-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => handleTabClick(t.id)}
            >
              <t.Icon size={16} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* ── Search ────────────────────────────────────────────────────── */}
      <div className="search-wrapper">
        <div className="search-input-row">
          <div className="search-icon-wrap">
            {geoLoading ? <Loader size={15} className="spin" /> : <Search size={15} />}
          </div>
          <input
            ref={searchRef}
            placeholder="Search places, coords, waypoints…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (!query && visibleHistory.length > 0) setShowHistory(true) }}
            autoComplete="off" spellCheck={false}
          />
          {query && (
            <button className="search-clear" onClick={() => { setQuery(''); geoClear() }}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search history dropdown */}
        {showHistory && !query && historySlice.length > 0 && (
          <div className="search-history" ref={historyRef}>
            <div className="search-history-hdr">Recent searches</div>
            {historySlice.map((item, i) => (
              <div key={i} className="search-history-item" onClick={() => flyToHistoryItem(item)}>
                <Search size={12} />
                <div className="search-history-info">
                  <div className="search-history-name">{item.name}</div>
                  {item.displayName && item.displayName !== item.name && (
                    <div className="search-history-sub">{item.displayName}</div>
                  )}
                </div>
              </div>
            ))}
            {hasMoreHistory && !showAllHistory && (
              <button className="search-history-more" onClick={() => setShowAllHistory(true)}>
                View all ({visibleHistory.length})
              </button>
            )}
            {showAllHistory && visibleHistory.length > 3 && (
              <button className="search-history-more" onClick={() => setShowAllHistory(false)}>
                Show less
              </button>
            )}
          </div>
        )}

        {/* Coordinate match */}
        {isCoord && (
          <div className="coord-card">
            <div className="coord-card-top">
              <Crosshair size={14} color="var(--accent)" />
              <span className="coord-label">Coordinates detected</span>
            </div>
            <div className="coord-dd">{coordResult.lat.toFixed(5)}, {coordResult.lng.toFixed(5)}</div>
            <div className="coord-actions">
              <button className="btn-primary" style={{flex:1,padding:'6px 12px',fontSize:12}} onClick={() => {
                onFlyTo(coordResult); setQuery('')
                onAddSearchHistory?.({ name: `${coordResult.lat.toFixed(5)}, ${coordResult.lng.toFixed(5)}`, lat: coordResult.lat, lng: coordResult.lng })
              }}>
                <Navigation size={13} /> Fly here
              </button>
              <button className="btn-secondary" style={{flex:1,padding:'6px 12px',fontSize:12}} onClick={() => {
                onFlyTo(coordResult, true); setQuery('')
                onAddSearchHistory?.({ name: `${coordResult.lat.toFixed(5)}, ${coordResult.lng.toFixed(5)}`, lat: coordResult.lat, lng: coordResult.lng })
              }}>
                <MapPinPlus size={13} /> Drop pin
              </button>
            </div>
          </div>
        )}

        {/* Geocoder results */}
        {isGeoSearch && (geoResults.length > 0 || geoLoading) && (
          <div className="geo-results">
            {geoLoading && geoResults.length === 0 && <div className="geo-loading">Searching…</div>}
            {geoResults.map((r, i) => (
              <div
                key={r.id}
                className={`geo-item ${i === selectedGeoIdx || hoverPin === i ? 'focused' : ''}`}
                onClick={() => flyToGeoResult(r)}
                onMouseEnter={() => { setSelectedGeoIdx(i); onHoverPin?.(i) }}
                onMouseLeave={() => onHoverPin?.(null)}
              >
                <div className="geo-icon-wrap geo-num">{i + 1}</div>
                <div className="geo-info">
                  <div className="geo-name">{r.name}</div>
                  <div className="geo-sub">
                    {r.distanceMi != null && (
                      <span className="geo-dist">
                        {r.distanceMi < 10 ? r.distanceMi.toFixed(1) : Math.round(r.distanceMi)} mi
                      </span>
                    )}
                    {r.displayName}
                  </div>
                </div>
                <button className="geo-pin-btn" title="Drop waypoint" onClick={e => { e.stopPropagation(); flyToGeoResult(r, true) }}>
                  <MapPinPlus size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* POI quick-search chips — folded away by default (VISION row 104).
            Twelve pills wrap to four rows and this block sits above every
            tab, so it was pushing each tab's real content below the fold. The
            header names the active search when closed, so a filter can never
            be on with nothing on screen to say so. */}
        <div className="poi-chips-block">
          <button
            className={`section-hdr section-toggle poi-chips-hdr ${poiChipsCollapsed ? 'collapsed' : ''}`}
            onClick={() => toggleSection('poi', true)}
            aria-expanded={!poiChipsCollapsed}
          >
            <span>Find nearby{poiChipsCollapsed && activePoi ? ` · ${activePoi.label}` : ''}</span>
            <ChevronDown size={12} className="section-caret" />
          </button>
          {!poiChipsCollapsed && (
            <div className="poi-chips">
              {POI_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`poi-chip ${poiCategory === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    if (poiCategory === cat.id) {
                      poiClear()
                      lastPoiCenterRef.current = null
                    } else {
                      lastPoiCenterRef.current = { ...mapCenter }
                      poiSearch(cat.id, mapCenter)
                    }
                  }}
                >{cat.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* POI results */}
        {(poiResults.length > 0 || poiLoading) && (
          <div className="poi-results">
            {poiLoading && <div className="geo-loading">Finding nearby…</div>}
            {poiResults.map((r, i) => (
              <div
                key={r.id}
                className={`geo-item ${hoverPin === i ? 'focused' : ''}`}
                onClick={() => onFlyTo({ lat: r.lat, lng: r.lng })}
                onMouseEnter={() => onHoverPin?.(i)}
                onMouseLeave={() => onHoverPin?.(null)}
              >
                <div className="geo-icon-wrap geo-num">{i + 1}</div>
                <div className="geo-info">
                  <div className="geo-name">{r.name}</div>
                  <div className="geo-sub">{r.distanceLabel}{r.tags?.cuisine ? ` · ${r.tags.cuisine}` : ''}{r.tags?.brand ? ` · ${r.tags.brand}` : ''}</div>
                </div>
                <button className="geo-pin-btn" title="Drop waypoint" onClick={e => {
                  e.stopPropagation()
                  onFlyTo({ lat: r.lat, lng: r.lng }, true)
                }}>
                  <MapPinPlus size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="sidebar-content">

        {/* WAYPOINTS */}
        {activeTab === 'waypoints' && (
          <div>
            <div className="section-hdr">
              <span>Waypoints</span>
              <span className="chip chip-muted">{filteredWaypoints.length}{detailFiltered.length !== waypoints.length ? ` / ${waypoints.length}` : ''}</span>
            </div>

            <div className="wp-filter-row">
              <button
                className={`poi-chip ${wpFilter.favorite ? 'active' : ''}`}
                onClick={() => setWpFilter(f => ({ ...f, favorite: !f.favorite }))}
              >★ Favorites</button>
              {WP_STATUS_OPTIONS.filter(o => o.id !== 'unknown').map(o => (
                <button
                  key={o.id}
                  className={`poi-chip ${wpFilter.status === o.id ? 'active' : ''}`}
                  style={wpFilter.status === o.id ? { borderColor: WP_STATUS_META[o.id].color, color: WP_STATUS_META[o.id].color } : {}}
                  onClick={() => setWpFilter(f => ({ ...f, status: f.status === o.id ? null : o.id }))}
                >{o.label}</button>
              ))}
              {labelVocab.map(l => (
                <button
                  key={l}
                  className={`poi-chip ${wpFilter.labels.includes(l) ? 'active' : ''}`}
                  onClick={() => setWpFilter(f => ({
                    ...f,
                    labels: f.labels.includes(l) ? f.labels.filter(x => x !== l) : [...f.labels, l],
                  }))}
                >{l}</button>
              ))}
            </div>

            {filteredWaypoints.length === 0 && !isCoord && (
              <div className="empty">
                <MapPin size={28} color="var(--text-muted)" />
                <p>{query ? `No match for "${query}"` : 'Click the map to drop a waypoint'}</p>
              </div>
            )}

            <ul className="wp-list">
              {filteredWaypoints.map(wp => {
                const IconC = WAYPOINT_ICON_COMPONENTS[wp.icon] || MapPin
                const iconColor = wp.color || wpColors?.[wp.icon] || WAYPOINT_COLORS[wp.icon] || WAYPOINT_COLORS.generic
                return (
                  <li
                    key={wp.id}
                    className={`wp-item ${selectedWaypoint?.id === wp.id ? 'selected' : ''}`}
                    onClick={() => onWaypointClick(wp)}
                  >
                    {editingId === wp.id ? (
                      <div className="wp-edit" onClick={e => e.stopPropagation()}>
                        <div className="wp-edit-loc">
                          <Crosshair size={11} />
                          <span>{wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}{wp.elev_ft != null ? ` · ${wp.elev_ft.toLocaleString()} ft` : ''}</span>
                        </div>
                        <div className="wp-edit-hint">Drag the pin on the map to move it</div>
                        <input value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                        <textarea placeholder="Notes…" value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
                        <div className="icon-picker">
                          {WAYPOINT_ICONS.map(iconId => {
                            const IC = WAYPOINT_ICON_COMPONENTS[iconId] || MapPin
                            return (
                              <button
                                key={iconId}
                                className={wp.icon === iconId ? 'active' : ''}
                                onClick={() => onWaypointUpdate(wp.id, { icon: iconId })}
                                title={iconId}
                                style={wp.icon === iconId ? { color: WAYPOINT_COLORS[iconId] } : {}}
                              ><IC size={16} /></button>
                            )
                          })}
                        </div>
                        <div className="wp-status-row wp-status-wrap">
                          {WP_STATUS_OPTIONS.map(o => {
                            const color = WP_STATUS_META[o.id]?.color || null
                            return (
                              <button
                                key={o.id}
                                className={`wp-status-btn ${editStatus === o.id ? 'active' : ''}`}
                                style={editStatus === o.id && color ? { borderColor: color, color } : {}}
                                onClick={() => setEditStatus(o.id)}
                              >
                                {color && <span className="wp-status-dot" style={{ background: color }} />}
                                {o.label}
                              </button>
                            )
                          })}
                          <button
                            className={`wp-status-btn ${editFavorite ? 'active' : ''}`}
                            style={editFavorite ? { borderColor: '#fbbf24', color: '#fbbf24' } : {}}
                            onClick={() => setEditFavorite(f => !f)}
                          >
                            {editFavorite ? '★' : '☆'} Favorite
                          </button>
                        </div>

                        <div className="wp-labels-edit">
                          {labelVocab.map(l => (
                            <button
                              key={l}
                              className={`poi-chip ${editLabels.includes(l) ? 'active' : ''}`}
                              onClick={() => toggleEditLabel(l)}
                            >{editLabels.includes(l) ? '✓ ' : ''}{l}</button>
                          ))}
                          {editLabels.filter(l => !labelVocab.includes(l)).map(l => (
                            <button key={l} className="poi-chip active" onClick={() => toggleEditLabel(l)}>✓ {l}</button>
                          ))}
                          <input
                            className="wp-label-input"
                            placeholder="Add label…"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNewLabel() } }}
                          />
                        </div>

                        <div className="wp-color-row">
                          <span>Pin color</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <input
                              type="color"
                              value={editColor || WAYPOINT_COLORS[wp.icon] || WAYPOINT_COLORS.generic}
                              onChange={e => setEditColor(e.target.value)}
                            />
                            {editColor && (
                              <button className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setEditColor(null)}>Reset</button>
                            )}
                          </span>
                        </div>
                        <div className="wp-ratings-edit">
                          {WP_RATING_KEYS.map(rk => (
                            <div className="wp-rating-row" key={rk.id}>
                              <span>{rk.label}</span>
                              <span className="wp-rating-stars">
                                {[1, 2, 3, 4, 5].map(v => (
                                  <button
                                    key={v}
                                    className={editRatings[rk.id] >= v ? 'on' : ''}
                                    onClick={() => setEditRatings(prev => ({
                                      ...prev,
                                      [rk.id]: prev[rk.id] === v ? undefined : v,
                                    }))}
                                  >★</button>
                                ))}
                              </span>
                            </div>
                          ))}
                        </div>
                        {communityEnabled() && (
                          <button
                            className="btn-secondary"
                            style={{ width: '100%', justifyContent: 'center', padding: '5px 10px', fontSize: 11.5, marginBottom: 8 }}
                            title="Publish a copy of this spot to the community layer"
                            onClick={() => { setEditingId(null); onShareWaypoint?.(wp) }}
                          >Share with the community</button>
                        )}
                        <div className="wp-edit-actions">
                          <button className="btn-primary" style={{padding:'5px 14px',fontSize:12}} onClick={() => saveEdit(wp.id)}>Save</button>
                          <button className="btn-secondary" style={{padding:'5px 14px',fontSize:12}} onClick={() => setEditingId(null)}>Cancel</button>
                          <button
                            className="btn-danger"
                            style={{ marginLeft: 'auto', padding: '5px 9px', fontSize: 11 }}
                            title="Delete waypoint"
                            onClick={() => {
                              if (confirmDel) { setEditingId(null); onWaypointDelete(wp.id) }
                              else setConfirmDel(true)
                            }}
                          ><Trash2 size={13} />{confirmDel ? 'Delete?' : ''}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="wp-dot" style={{ background: iconColor, position: 'relative' }}>
                          <IconC size={12} color="white" />
                          {(() => {
                            const c = statusBadgeColor(wp)
                            if (!c) return null
                            return wp.favorite
                              ? <span className="wp-visit-star" style={{ color: c }}>★</span>
                              : <span className="wp-visit-badge" style={{ background: c }} />
                          })()}
                        </div>
                        <div className="wp-info">
                          <div className="wp-name">{wp.name}</div>
                          <div className="wp-meta">{wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}{wp.elev_ft != null ? ` · ${wp.elev_ft.toLocaleString()} ft` : ''}</div>
                          {wp.notes && <div className="wp-notes">{wp.notes}</div>}
                        </div>
                        <div className="wp-actions">
                          <button className="btn-ghost" onClick={e => { e.stopPropagation(); startEdit(wp) }} title="Edit">
                            <Edit3 size={14} />
                          </button>
                          <button className="btn-ghost" onClick={e => { e.stopPropagation(); onWaypointDelete(wp.id) }} title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* TRACKS */}
        {activeTab === 'tracks' && (
          <div>
            <div className="section-hdr">
              <span>Tracks</span>
              <span className="chip chip-muted">{tracks.length}</span>
            </div>
            {tracks.length === 0 && (
              <div className="empty">
                <Route size={28} color="var(--text-muted)" />
                <p>Use Record in the toolbar to start a track</p>
              </div>
            )}
            <ul className="track-list">
              {tracks.map(t => (
                <li key={t.id} className="track-item">
                  <Route size={14} color="var(--accent)" />
                  <div className="track-info">
                    <div className="track-name">{t.name}</div>
                    <div className="track-meta">{t.points?.length || 0} pts{t.distance ? ` · ${t.distance} mi` : ''}</div>
                  </div>
                  <span className="chip chip-muted">{new Date(t.createdAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* LAYERS */}
        {activeTab === 'layers' && (
          <div>
            <Section id="base" title="Base Map" first={true} collapsed={collapsed.base} onToggle={toggleSection}>
            <div className="layer-grid">
              {Object.values(BASE_LAYERS).map(l => (
                <button
                  key={l.id}
                  className={`layer-card ${baseLayer === l.id ? 'active' : ''}`}
                  onClick={() => setBaseLayer(l.id)}
                  title={l.description}
                >
                  <span className="layer-card-label">{l.label}</span>
                </button>
              ))}
            </div>
            </Section>

            <Section id="theme" title="Appearance" first={false} collapsed={collapsed.theme} onToggle={toggleSection}>
            <div className="theme-grid">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  className={`layer-card theme-card ${theme === t.id ? 'active' : ''}`}
                  onClick={() => setTheme(t.id)}
                  title={t.description}
                >
                  <span className={`theme-swatch theme-swatch-${t.id}`} />
                  <span className="layer-card-label">{t.label}</span>
                </button>
              ))}
            </div>
            </Section>

            <Section id="overlay" title="Overlays" first={false} collapsed={collapsed.overlay} onToggle={toggleSection}>
            <div className="overlay-grid">
              {Object.entries(OVERLAY_LAYERS).map(([id, layer]) => {
                // Names & Labels is for imagery; the Boondock bases already
                // carry names and route numbers, and switching it on there
                // used to draw every town's name a second time (row 121).
                const redundant = id === 'names' && BASE_LAYERS[baseLayer]?.custom
                return (
                <button
                  key={id}
                  className={`overlay-btn ${overlays[id] && !redundant ? 'active' : ''} ${redundant ? 'overlay-btn-na' : ''}`}
                  onClick={() => { if (!redundant) setOverlays(o => ({ ...o, [id]: !o[id] })) }}
                  disabled={redundant}
                  title={redundant
                    ? 'This map already has names and route numbers — the overlay is for Satellite'
                    : layer.description}
                >
                  <span className="overlay-btn-label">{layer.label}</span>
                </button>
                )
              })}
            </div>
            </Section>

            <Section id="sites" title="Site Filter" first={false} collapsed={collapsed.sites} onToggle={toggleSection}>
            <p className="dl-info">
              Tap a type to show only that one, tap another to add it. Set an
              elevation limit and the ground in that band shades violet, so the
              filter shows you where the country sits instead of only removing
              dots.
            </p>
            <div className="site-kind-row">
              <button
                className={`poi-chip ${siteKinds == null ? 'active' : ''}`}
                onClick={() => setSiteKinds(null)}
              >All</button>
              {SITE_KINDS.map(k => {
                const on = siteKinds == null || siteKinds.includes(k.id)
                return (
                  <button
                    key={k.id}
                    className={`poi-chip ${on ? 'active' : ''}`}
                    style={on ? { borderColor: k.color, color: k.color } : {}}
                    // Isolate, then add (VISION row 109). From "everything
                    // shown", clicking a kind narrows to just that one, which
                    // is what a filter is for — it used to subtract, so the
                    // first click on Trailhead hid trailheads. Clicking more
                    // kinds adds them, and selecting them all, or clicking the
                    // last one off, lands back on All rather than on an empty
                    // map with no way out.
                    onClick={() => setSiteKinds(prev => {
                      if (prev == null) return [k.id]
                      const next = prev.includes(k.id)
                        ? prev.filter(x => x !== k.id)
                        : [...prev, k.id]
                      return next.length === 0 || next.length === SITE_KINDS.length ? null : next
                    })}
                  >{on ? '✓ ' : ''}{k.label}</button>
                )
              })}
            </div>
            <div className="elev-filter">
              <label>
                Min elevation
                <span>{siteMinElev == null ? 'Any' : `${siteMinElev.toLocaleString()} ft`}</span>
              </label>
              <input
                type="range" min={0} max={20000} step={250}
                value={siteMinElev ?? 0}
                onChange={e => {
                  const v = +e.target.value
                  const next = v <= 0 ? null : v
                  setSiteMinElev(next)
                  if (next != null && siteMaxElev != null && next > siteMaxElev) setSiteMaxElev(null)
                }}
              />
              <label style={{ marginTop: 10 }}>
                Max elevation
                <span>{siteMaxElev == null ? 'Any' : `${siteMaxElev.toLocaleString()} ft`}</span>
              </label>
              <input
                type="range" min={1000} max={MAX_ELEV_FT} step={250}
                value={siteMaxElev ?? MAX_ELEV_FT}
                onChange={e => {
                  const v = +e.target.value
                  const next = v >= MAX_ELEV_FT ? null : v
                  setSiteMaxElev(next)
                  if (next != null && siteMinElev != null && siteMinElev > next) setSiteMinElev(null)
                }}
              />
            </div>
            </Section>

            <Section id="temp" title="Temperature Filter" first={false} collapsed={collapsed.temp} onToggle={toggleSection}>
            <p className="dl-info">
              Filter by the forecast: where your chosen days fit your limits,
              the map shades blue and sites outside it are hidden. Start the
              window today or later — handy when you leave on Friday and
              today's weather is beside the point. Slide a limit to its edge
              for “Any”. Forecasts: Open-Meteo, up to 16 days out.
            </p>
            <TempFilter tempFilter={tempFilter} setTempFilter={setTempFilter} tempStatus={tempStatus} />
            </Section>

          </div>
        )}

        {/* OFFLINE */}
        {activeTab === 'download' && (
          <div>
            <div className="section-hdr">Offline Maps</div>
            <p className="dl-info">Save map areas to this device — they render automatically when you have no signal.</p>
            <button className="btn-primary full-width" onClick={onShowDownloadModal}>
              <Download size={15} /> Download area
            </button>
            <OfflinePacks />
          </div>
        )}
      </div>
    </aside>
  )
}

// Temperature filter controls — forecast window plus three kinds of limit.
// A limit slid to its extreme end reads as null = “Any” (off), mirroring the
// elevation sliders; conflicting pairs clear the other side the same way.
// "next 10 days" stops being true once the window can start later, so say
// which days it actually covers (VISION row 119).
const startLabel = (d) => !d ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`

function windowLabel(f) {
  const { start, len, end } = windowRange(f)
  const capped = end >= FORECAST_DAYS && (f.startDay || 0) + (f.days || 0) > FORECAST_DAYS
  return `${len} days${start ? ` (days ${start + 1}\u2013${end})` : ''}${capped ? ', to the 16-day limit' : ''}`
}

function TempFilter({ tempFilter, setTempFilter, tempStatus }) {
  const f = tempFilter
  const active = f.maxHi != null || f.minLo != null || f.avgLo != null || f.avgHi != null
  const set = (patch) => setTempFilter(prev => ({ ...prev, ...patch }))
  const fmt = (v) => v == null ? 'Any' : `${v}°F`
  return (
    <div className="elev-filter">
      <label>Starting<span>{startLabel(f.startDay)}</span></label>
      <input
        type="range" min={0} max={9} step={1} value={f.startDay ?? 0}
        onChange={e => set({ startDay: +e.target.value })}
      />
      <label style={{ marginTop: 10 }}>Window<span>{windowLabel(f)}</span></label>
      <input
        type="range" min={7} max={16} step={1} value={f.days}
        onChange={e => set({ days: +e.target.value })}
      />
      <label style={{ marginTop: 10 }}>No day hotter than<span>{fmt(f.maxHi)}</span></label>
      <input
        type="range" min={30} max={110} step={1} value={f.maxHi ?? 110}
        onChange={e => {
          const v = +e.target.value
          const maxHi = v >= 110 ? null : v
          set({ maxHi, ...(maxHi != null && f.minLo != null && f.minLo > maxHi ? { minLo: null } : {}) })
        }}
      />
      <label style={{ marginTop: 10 }}>No night colder than<span>{fmt(f.minLo)}</span></label>
      <input
        type="range" min={-20} max={70} step={1} value={f.minLo ?? -20}
        onChange={e => {
          const v = +e.target.value
          const minLo = v <= -20 ? null : v
          set({ minLo, ...(minLo != null && f.maxHi != null && f.maxHi < minLo ? { maxHi: null } : {}) })
        }}
      />
      <label style={{ marginTop: 10 }}>Average at least<span>{fmt(f.avgLo)}</span></label>
      <input
        type="range" min={0} max={90} step={1} value={f.avgLo ?? 0}
        onChange={e => {
          const v = +e.target.value
          const avgLo = v <= 0 ? null : v
          set({ avgLo, ...(avgLo != null && f.avgHi != null && f.avgHi < avgLo ? { avgHi: null } : {}) })
        }}
      />
      <label style={{ marginTop: 10 }}>Average at most<span>{fmt(f.avgHi)}</span></label>
      <input
        type="range" min={10} max={100} step={1} value={f.avgHi ?? 100}
        onChange={e => {
          const v = +e.target.value
          const avgHi = v >= 100 ? null : v
          set({ avgHi, ...(avgHi != null && f.avgLo != null && f.avgLo > avgHi ? { avgLo: null } : {}) })
        }}
      />
      <div className="temp-status">
        <span>
          {!active && 'Set any limit to activate'}
          {active && tempStatus?.state === 'loading' && 'Fetching forecast grid…'}
          {active && tempStatus?.state === 'error' && 'Forecast unavailable — no connection?'}
          {active && tempStatus?.state === 'ok' &&
            `Fits ${tempStatus.pass} of ${tempStatus.total} forecast points in view · ${new Date(tempStatus.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          {active && (tempStatus == null || tempStatus.state === 'idle') && '…'}
        </span>
        {active && (
          <button
            className="poi-chip"
            onClick={() => set({ maxHi: null, minLo: null, avgLo: null, avgHi: null })}
          >Clear</button>
        )}
      </div>
    </div>
  )
}

function OfflinePacks() {
  const [packs, setPacks] = useState([])
  const [storage, setStorage] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const refresh = () => {
      listPacks().then(p => { setPacks(p); setLoading(false) })
      storageEstimate().then(setStorage)
    }
    refresh()
    window.addEventListener('boondock-packs-changed', refresh)
    const ch = 'BroadcastChannel' in window ? new BroadcastChannel('boondock-packs') : null
    ch?.addEventListener('message', refresh)
    return () => {
      window.removeEventListener('boondock-packs-changed', refresh)
      ch?.close()
    }
  }, [])

  if (loading) return null
  if (!packs.length) return (
    <div className="empty" style={{ marginTop: 20 }}>
      <Download size={24} color="var(--text-muted)" />
      <p>No offline packs yet</p>
    </div>
  )
  return (
    <div>
      <ul className="pack-list">
        {packs.map(p => (
          <li key={p.id} className="pack-item">
            <Download size={14} color="var(--accent)" />
            <div className="wp-info">
              <div className="wp-name">{p.name}</div>
              <div className="wp-meta">
                {BASE_LAYERS[p.layerId]?.label || p.layerId} · z{p.minZoom}–{p.maxZoom} · {p.count.toLocaleString()} tiles · {(p.bytes / 1048576).toFixed(1)} MB
              </div>
            </div>
            <button className="btn-ghost" title="Delete pack" onClick={() => deletePack(p.id)}>
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      {storage?.usage > 0 && (
        <p className="dl-info" style={{ marginTop: 10 }}>
          Device storage used: {(storage.usage / 1048576).toFixed(0)} MB of {(storage.quota / 1073741824).toFixed(1)} GB available
        </p>
      )}
    </div>
  )
}
