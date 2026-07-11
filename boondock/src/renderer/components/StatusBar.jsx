import { useState, useEffect } from 'react'
import { Activity } from './Icons'
import { elevationAt } from '../../shared/elevation'
import './StatusBar.css'

function formatDD(lat, lng) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
function formatDMS(lat, lng) {
  function toDMS(val, pos, neg) {
    const dir = val >= 0 ? pos : neg
    const abs = Math.abs(val)
    const d = Math.floor(abs)
    const m = Math.floor((abs - d) * 60)
    const s = ((abs - d - m / 60) * 3600).toFixed(1)
    return `${d}°${String(m).padStart(2,'0')}'${s}"${dir}`
  }
  return `${toDMS(lat, 'N', 'S')}  ${toDMS(lng, 'E', 'W')}`
}

export default function StatusBar({ cursor, zoom, isRecording, trackPoints }) {
  const [showDMS, setShowDMS] = useState(false)
  const [elevFt, setElevFt] = useState(null)
  const coordStr = showDMS ? formatDMS(cursor.lat, cursor.lng) : formatDD(cursor.lat, cursor.lng)

  // Debounced elevation under the cursor, from browser-cached DEM tiles
  useEffect(() => {
    if (!cursor.lat && !cursor.lng) return
    let live = true
    const t = setTimeout(() => {
      elevationAt(cursor.lng, cursor.lat)
        .then(m => { if (live) setElevFt(m == null ? null : Math.round(m * 3.28084)) })
        .catch(() => {})
    }, 120)
    return () => { live = false; clearTimeout(t) }
  }, [cursor.lat, cursor.lng])

  return (
    <footer className="statusbar">
      <div className="sb-left">
        {isRecording && (
          <div className="sb-rec">
            <span className="sb-rec-dot" />
            <Activity size={12} />
            <span>{trackPoints} pts</span>
          </div>
        )}
      </div>
      <div className="sb-right">
        {zoom != null && <span className="sb-elev">z{zoom.toFixed(1)}</span>}
        {elevFt != null && <span className="sb-elev">{elevFt.toLocaleString()} ft</span>}
        <button className="sb-coord" onClick={() => setShowDMS(v => !v)}
          title={showDMS ? 'Switch to DD' : 'Switch to DMS'}>
          <span className="sb-coord-badge">{showDMS ? 'DMS' : 'DD'}</span>
          <span>{coordStr}</span>
        </button>
      </div>
    </footer>
  )
}
