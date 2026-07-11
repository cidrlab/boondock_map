import { useState, useRef, useEffect } from 'react'
import { BASE_LAYERS, OVERLAY_LAYERS } from '../../shared/layers'
import { listPacks, deletePack, storageEstimate } from '../../shared/offlineTiles'
import { parseCoords, formatCoords } from '../../shared/parseCoords'
import { useGeocoder } from '../../shared/useGeocoder'
import { usePoiSearch, POI_CATEGORIES } from '../../shared/usePoiSearch'
import {
  MapPin, Layers, Route, Download, Search, X, Edit3, Trash2,
  Loader, Navigation, MapPinPlus, Crosshair,
  WAYPOINT_ICON_COMPONENTS, WAYPOINT_COLORS,
} from './Icons'
import './Sidebar.css'

const WAYPOINT_ICONS = ['generic','camp','water','hazard','trailhead','viewpoint','fuel','parking']

export default function Sidebar({
  activeTab, setActiveTab, waypoints, tracks,
  overlays, setOverlays, baseLayer, setBaseLayer,
  onWaypointClick, onWaypointDelete, onWaypointUpdate,
  selectedWaypoint, onShowDownloadModal, downloadBbox,
  onFlyTo, searchHistory, onAddSearchHistory, mapCenter,
}) {
  const [query, setQuery] = useState('')
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

  const coordResult = parseCoords(query)
  const isSearching = query.trim().length >= 2
  const isCoord = !!coordResult
  const isGeoSearch = isSearching && !isCoord

  const filteredWaypoints = isCoord || !isSearching
    ? waypoints
    : waypoints.filter(w =>
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

  const startEdit = (wp) => { setEditingId(wp.id); setEditName(wp.name); setEditNotes(wp.notes || '') }
  const saveEdit = (id) => { onWaypointUpdate(id, { name: editName, notes: editNotes }); setEditingId(null) }

  const tabs = [
    { id: 'waypoints', Icon: MapPin,   label: 'Points' },
    { id: 'tracks',    Icon: Route,    label: 'Tracks' },
    { id: 'layers',    Icon: Layers,   label: 'Layers' },
    { id: 'download',  Icon: Download, label: 'Offline' },
  ]

  return (
    <aside className="sidebar">
      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <nav className="sidebar-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <t.Icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

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
                className={`geo-item ${i === selectedGeoIdx ? 'focused' : ''}`}
                onClick={() => flyToGeoResult(r)}
                onMouseEnter={() => setSelectedGeoIdx(i)}
              >
                <div className="geo-icon-wrap"><MapPin size={14} /></div>
                <div className="geo-info">
                  <div className="geo-name">{r.name}</div>
                  <div className="geo-sub">{r.displayName}</div>
                </div>
                <button className="geo-pin-btn" title="Drop waypoint" onClick={e => { e.stopPropagation(); flyToGeoResult(r, true) }}>
                  <MapPinPlus size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* POI quick-search chips */}
        <div className="poi-chips">
          {POI_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`poi-chip ${poiCategory === cat.id ? 'active' : ''}`}
              onClick={() => {
                if (poiCategory === cat.id) { poiClear() }
                else { poiSearch(cat.id, mapCenter) }
              }}
            >{cat.label}</button>
          ))}
        </div>

        {/* POI results */}
        {(poiResults.length > 0 || poiLoading) && (
          <div className="poi-results">
            {poiLoading && <div className="geo-loading">Finding nearby…</div>}
            {poiResults.map(r => (
              <div
                key={r.id}
                className="geo-item"
                onClick={() => onFlyTo({ lat: r.lat, lng: r.lng })}
              >
                <div className="geo-icon-wrap"><MapPin size={14} /></div>
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
              <span className="chip chip-muted">{waypoints.length}</span>
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
                const iconColor = WAYPOINT_COLORS[wp.icon] || WAYPOINT_COLORS.generic
                return (
                  <li
                    key={wp.id}
                    className={`wp-item ${selectedWaypoint?.id === wp.id ? 'selected' : ''}`}
                    onClick={() => onWaypointClick(wp)}
                  >
                    {editingId === wp.id ? (
                      <div className="wp-edit" onClick={e => e.stopPropagation()}>
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
                        <div className="wp-edit-actions">
                          <button className="btn-primary" style={{padding:'5px 14px',fontSize:12}} onClick={() => saveEdit(wp.id)}>Save</button>
                          <button className="btn-secondary" style={{padding:'5px 14px',fontSize:12}} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="wp-dot" style={{ background: iconColor }}>
                          <IconC size={12} color="white" />
                        </div>
                        <div className="wp-info">
                          <div className="wp-name">{wp.name}</div>
                          <div className="wp-meta">{wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}</div>
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
            <div className="section-hdr">Base Map</div>
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

            <div className="section-hdr" style={{ marginTop: 20 }}>Overlays</div>
            <div className="overlay-grid">
              {Object.entries(OVERLAY_LAYERS).map(([id, layer]) => (
                <button
                  key={id}
                  className={`overlay-btn ${overlays[id] ? 'active' : ''}`}
                  onClick={() => setOverlays(o => ({ ...o, [id]: !o[id] }))}
                  title={layer.description}
                >
                  <span className="overlay-btn-label">{layer.label}</span>
                </button>
              ))}
            </div>
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
