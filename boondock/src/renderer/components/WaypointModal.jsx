import { useState, useEffect, useRef } from 'react'
import { WAYPOINT_ICON_COMPONENTS, WAYPOINT_COLORS, Crosshair } from './Icons'

import './WaypointModal.css'

const ICONS = [
  { id: 'generic',   label: 'Pin' },
  { id: 'camp',      label: 'Camp' },
  { id: 'water',     label: 'Water' },
  { id: 'hazard',    label: 'Hazard' },
  { id: 'trailhead', label: 'Trail' },
  { id: 'viewpoint', label: 'View' },
  { id: 'fuel',      label: 'Fuel' },
  { id: 'parking',   label: 'Parking' },
]

import { WP_STATUS_META, WP_STATUS_OPTIONS } from '../../shared/waypointMeta'

export default function WaypointModal({ lngLat, onSave, onCancel, labelVocab = [], prefill = null }) {
  const [name, setName] = useState(prefill?.name || '')
  const [notes, setNotes] = useState(prefill?.notes || '')
  const [icon, setIcon] = useState(prefill?.icon || 'generic')
  const [status, setStatus] = useState('unknown')
  const [favorite, setFavorite] = useState(false)
  const [color, setColor] = useState(null)   // null = category default
  const [labels, setLabels] = useState([])
  const [newLabel, setNewLabel] = useState('')
  const inputRef = useRef(null)

  const toggleLabel = (l) =>
    setLabels(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  const addNewLabel = () => {
    const l = newLabel.trim().toLowerCase()
    if (l && !labels.includes(l)) setLabels(prev => [...prev, l])
    setNewLabel('')
  }

  useEffect(() => {
    // Select any prefilled name so typing replaces it in one keystroke
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 50)
  }, [])

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(), notes: notes.trim(), icon,
      lat: lngLat.lat, lng: lngLat.lng,
      ...(lngLat.elev_ft != null && { elev_ft: lngLat.elev_ft }),
      ...(status !== 'unknown' && { status }),
      ...(favorite && { favorite: true }),
      ...(color && color !== WAYPOINT_COLORS[icon] && { color }),
      ...(labels.length && { labels }),
    })
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="wp-modal" onClick={e => e.stopPropagation()}>
        <div className="wp-modal-header">
          <h3>New Waypoint</h3>
          <div className="wp-modal-coord">
            <Crosshair size={12} />
            <span>{lngLat.lat.toFixed(5)}, {lngLat.lng.toFixed(5)}</span>
          </div>
        </div>

        <div className="wp-modal-icons">
          {ICONS.map(i => {
            const IC = WAYPOINT_ICON_COMPONENTS[i.id]
            const isActive = icon === i.id
            return (
              <button
                key={i.id}
                className={`wp-icon-btn ${isActive ? 'active' : ''}`}
                onClick={() => setIcon(i.id)}
                title={i.label}
                style={isActive ? { borderColor: WAYPOINT_COLORS[i.id], color: WAYPOINT_COLORS[i.id] } : {}}
              >
                <IC size={16} />
                <span>{i.label}</span>
              </button>
            )
          })}
        </div>

        <input
          ref={inputRef}
          placeholder="Waypoint name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={handleKey}
        />

        <textarea
          placeholder="Notes (optional)…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onKeyDown={handleKey}
          rows={3}
        />

        <div className="wp-status-row">
          {WP_STATUS_OPTIONS.map(o => {
            const color = WP_STATUS_META[o.id]?.color || null
            return (
              <button
                key={o.id}
                className={`wp-status-btn ${status === o.id ? 'active' : ''}`}
                style={status === o.id && color ? { borderColor: color, color } : {}}
                onClick={() => setStatus(o.id)}
              >
                {color && <span className="wp-status-dot" style={{ background: color }} />}
                {o.label}
              </button>
            )
          })}
          <button
            className={`wp-status-btn wp-fav-btn ${favorite ? 'active' : ''}`}
            style={favorite ? { borderColor: '#fbbf24', color: '#fbbf24' } : {}}
            onClick={() => setFavorite(f => !f)}
            title="Favorite — badge becomes a star"
          >
            {favorite ? '★' : '☆'} Favorite
          </button>
        </div>

        <div className="wp-labels-edit">
          {labelVocab.map(l => (
            <button
              key={l}
              className={`poi-chip ${labels.includes(l) ? 'active' : ''}`}
              onClick={() => toggleLabel(l)}
            >{labels.includes(l) ? '✓ ' : ''}{l}</button>
          ))}
          {labels.filter(l => !labelVocab.includes(l)).map(l => (
            <button key={l} className="poi-chip active" onClick={() => toggleLabel(l)}>✓ {l}</button>
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
              value={color || WAYPOINT_COLORS[icon]}
              onChange={e => setColor(e.target.value)}
            />
            {color && (
              <button className="btn-ghost" style={{ fontSize: 10, padding: '2px 6px' }} onClick={() => setColor(null)}>Reset</button>
            )}
          </span>
        </div>

        <div className="wp-modal-actions">
          <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>Save Waypoint</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
