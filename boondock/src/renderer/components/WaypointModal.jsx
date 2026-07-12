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

const STATUS_OPTIONS = [
  { id: 'been',    label: 'Been there',      color: '#22c55e' },
  { id: 'unknown', label: 'Not sure',        color: null },
  { id: 'explore', label: 'Want to explore', color: '#fb923c' },
]

export default function WaypointModal({ lngLat, onSave, onCancel }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [icon, setIcon] = useState('generic')
  const [status, setStatus] = useState('unknown')
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSave = () => {
    if (!name.trim()) return
    onSave({
      name: name.trim(), notes: notes.trim(), icon,
      lat: lngLat.lat, lng: lngLat.lng,
      ...(status !== 'unknown' && { status }),
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
          {STATUS_OPTIONS.map(o => (
            <button
              key={o.id}
              className={`wp-status-btn ${status === o.id ? 'active' : ''}`}
              style={status === o.id && o.color ? { borderColor: o.color, color: o.color } : {}}
              onClick={() => setStatus(o.id)}
            >
              {o.color && <span className="wp-status-dot" style={{ background: o.color }} />}
              {o.label}
            </button>
          ))}
        </div>

        <div className="wp-modal-actions">
          <button className="btn-primary" onClick={handleSave} disabled={!name.trim()}>Save Waypoint</button>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
