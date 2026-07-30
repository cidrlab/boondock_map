import { useState, useEffect } from 'react'
import { Navigation, Crosshair, X } from './Icons'
import './AddWaypointMenu.css'

// Add-waypoint chooser (VISION row 93). The map's add-pin control opens this;
// it offers the two placement modes Tim asked for — at the phone's current GPS
// fix, or a point picked by tapping the map. The geolocation call lives here
// with its own error line so a denied or failed fix is stated honestly rather
// than silently doing nothing (same posture as the live readout's states).

export default function AddWaypointMenu({ onAtLocation, onPickOnMap, onClose }) {
  const [status, setStatus] = useState('idle')   // 'idle' | 'locating' | 'error'
  const [errMsg, setErrMsg] = useState('')

  const atLocation = () => {
    if (!navigator.geolocation) {
      setStatus('error')
      setErrMsg('This device has no location sensor')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => onAtLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setStatus('error')
        setErrMsg(err.code === 1
          ? 'Location blocked — allow location access for this site'
          : "Couldn't get a fix — try again in the open sky")
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="addwp-overlay" onClick={onClose}>
      <div className="addwp-menu" onClick={e => e.stopPropagation()} role="menu">
        <div className="addwp-hdr">
          <span>Add a waypoint</span>
          <button className="btn-ghost addwp-close" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>

        <button className="addwp-opt" onClick={atLocation} disabled={status === 'locating'}>
          <Navigation size={17} />
          <span className="addwp-opt-text">
            <strong>{status === 'locating' ? 'Finding your location…' : 'At my location'}</strong>
            <small>Drop a pin where you are right now</small>
          </span>
        </button>

        <button className="addwp-opt" onClick={onPickOnMap}>
          <Crosshair size={17} />
          <span className="addwp-opt-text">
            <strong>Pick on the map</strong>
            <small>Then tap the spot to place it</small>
          </span>
        </button>

        {status === 'error' && <div className="addwp-err">{errMsg}</div>}
      </div>
    </div>
  )
}
