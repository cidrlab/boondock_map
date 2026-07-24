import { useEffect, useRef, useState } from 'react'
import { WAYPOINT_ICON_COMPONENTS, Crosshair } from './Icons'
import { SITE_KINDS } from '../../shared/layers'
import { submitSpot, pendingFeature, addPendingReport } from '../../shared/community'

import './WaypointModal.css'

// Community report — same dialog bones as WaypointModal, but this one
// publishes to everyone: the Worker screens it, the nightly merge ships it
// (see shared/community.js). Waypoints stay private; this is its opposite.

const KIND_ICON = { campsite: 'camp', rv_park: 'parking', dump: 'dump', water: 'water', trailhead: 'trailhead' }

export default function ReportSpotModal({ lngLat, onClose, onSubmitted }) {
  const [kind, setKind] = useState('dump')
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)   // {held} after a successful submit
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleSubmit = async () => {
    if (!name.trim() || busy || done) return
    setBusy(true)
    setError(null)
    try {
      const res = await submitSpot({
        kind,
        name: name.trim(),
        desc: desc.trim(),
        lng: lngLat.lng,
        lat: lngLat.lat,
      })
      const feature = pendingFeature({
        id: res.id, kind, name: name.trim(), desc: desc.trim(),
        lng: lngLat.lng, lat: lngLat.lat,
      })
      addPendingReport(feature)
      onSubmitted?.(feature)
      setDone({ held: res.held })
    } catch (e) {
      setError(e.message || 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="wp-modal" onClick={e => e.stopPropagation()}>
        <div className="wp-modal-header">
          <h3>Report a spot</h3>
          <div className="wp-modal-coord">
            <Crosshair size={12} />
            <span>{lngLat.lat.toFixed(5)}, {lngLat.lng.toFixed(5)}</span>
          </div>
        </div>

        {done ? (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 14px' }}>
              {done.held
                ? 'Thanks — your report is in. It needs a quick review before it publishes, so it may take a few days to appear for everyone.'
                : 'Thanks — your report is in. It shows on your map now and publishes to everyone after the next nightly sync, marked unverified until other travelers confirm it.'}
            </p>
            <div className="wp-modal-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-secondary, rgba(232,238,244,.65))', lineHeight: 1.5, margin: '0 0 10px' }}>
              Add a place other boondockers should know about — a dump, water
              fill, campsite. Public and anonymous; it publishes after the
              nightly sync.
            </p>

            <div className="wp-modal-icons">
              {SITE_KINDS.map(k => {
                const IC = WAYPOINT_ICON_COMPONENTS[KIND_ICON[k.id]]
                const isActive = kind === k.id
                return (
                  <button
                    key={k.id}
                    className={`wp-icon-btn ${isActive ? 'active' : ''}`}
                    onClick={() => setKind(k.id)}
                    title={k.label}
                    style={isActive ? { borderColor: k.color, color: k.color } : {}}
                  >
                    <IC size={16} />
                    <span>{k.label}</span>
                  </button>
                )
              })}
            </div>

            <input
              ref={inputRef}
              placeholder="Name (e.g. Chevron — RV dump + water)"
              value={name}
              maxLength={80}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKey}
            />

            <textarea
              placeholder="What should people know? Cost, access, hours, condition… (optional)"
              value={desc}
              maxLength={280}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={handleKey}
              rows={3}
            />

            {error && (
              <div style={{ fontSize: 12, color: '#f87171', margin: '0 0 10px' }}>{error}</div>
            )}

            <div className="wp-modal-actions">
              <button className="btn-primary" onClick={handleSubmit} disabled={!name.trim() || busy}>
                {busy ? 'Sending…' : 'Submit report'}
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>

            <p style={{ fontSize: 10, color: 'var(--text-tertiary, rgba(232,238,244,.4))', lineHeight: 1.5, margin: '10px 0 0' }}>
              No account needed. To limit spam, a salted hash of your
              connection is kept — never your address itself, and it is never
              published.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
