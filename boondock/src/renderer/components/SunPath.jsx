import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  sunPosition, sunTrack, sunTimes, solarCoords, solarDay,
  horizonProfile, horizonAt, skyVector,
} from '../../shared/sun'
import { useDeviceAttitude } from '../../shared/useDeviceHeading'
import { parseCoords } from '../../shared/parseCoords'
import { X, Settings, Sun, Camera, Compass, Crosshair, Mountain, Loader } from './Icons'
import './SunPath.css'

/**
 * Sun path viewer (VISION row 132) — where the sun tracks across the sky from
 * a given spot on a given day, drawn over the camera in AR or as a sun-path
 * dome when there is no camera or no compass to hang one on. Tim's ask, after
 * PhotoPills: hold the phone up, see the arc, scrub the time, and know before
 * you park whether the panel will see anything at eight in the morning.
 *
 * Two things separate this from a generic sun calculator. The ridgeline scan
 * reads the app's own DEM and reports when the sun clears the terrain rather
 * than the sea horizon, which in a canyon is a different hour entirely. And
 * the panel aim is solved against that same terrain, so the answer accounts
 * for the wall the sun has to climb over.
 *
 * The ephemeris is pinned in `sun.test.mjs` against MET Norway and the US
 * Naval Observatory. What is *not* pinned, and cannot be without a phone in
 * hand, is the AR alignment: the sensor reads magnetic north and the sun is
 * computed from true north, a difference of 8–16° across the western states,
 * on top of whatever bias the magnetometer picks up inside a vehicle. Hence
 * the drag-to-align, and hence the alignment warning in the view.
 */

const RAD = Math.PI / 180
const PREF_KEY = 'boondock-sunpath'
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const CARDINALS = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]

const clock = (t) => t == null ? '—' : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const hourLabel = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric' }).replace(/\s/g, '').toLowerCase()
const dayLabel = (t) => new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
const hm = (mins) => mins == null ? '—' : `${Math.floor(mins / 60)}h ${String(Math.round(mins % 60)).padStart(2, '0')}m`
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

/** The instant of the solstice nearest a given year, to the hour. */
function solsticeAt(year, month) {
  let best = null
  for (let d = 17; d <= 25; d++) {
    for (let h = 0; h < 24; h += 2) {
      const t = new Date(Date.UTC(year, month, d, h))
      const v = (month === 5 ? 1 : -1) * solarCoords(t).declination
      if (!best || v > best.v) best = { v, t }
    }
  }
  return best.t
}

/** Rear camera, released the moment the view leaves AR or closes. */
function useCamera(active) {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!active) { setStream(null); setError(null); return }
    if (!navigator.mediaDevices?.getUserMedia) { setError('unsupported'); return }
    let dead = false, live = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((st) => {
        if (dead) { st.getTracks().forEach(t => t.stop()); return }
        live = st
        setStream(st)
      })
      .catch((e) => { if (!dead) setError(e?.name === 'NotAllowedError' ? 'denied' : 'failed') })
    return () => { dead = true; live?.getTracks().forEach(t => t.stop()) }
  }, [active])
  return { stream, error }
}

/** Stage size in CSS pixels, tracked so the projection stays honest on rotate. */
function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect
      setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export default function SunPath({ onClose, location, keepAwake, wakeLock, onToggleKeepAwake }) {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {} } catch { return {} } }, [])
  const canAR = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof window.DeviceOrientationEvent !== 'undefined'

  // AR is the point on a phone and a curiosity on a laptop, where the only
  // camera faces the wrong way, so a desktop opens on the dome unless asked
  const handheld = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const [mode, setMode] = useState(() => (saved.mode || (canAR && handheld ? 'ar' : 'dome')))
  const [when, setWhen] = useState(() => Date.now())
  const [nowTs, setNowTs] = useState(() => Date.now())   // the wall clock, ticking whether or not the view follows it
  const [live, setLive] = useState(true)
  const [loc, setLoc] = useState(() => (Number.isFinite(location?.lat) && Number.isFinite(location?.lng)
    ? { lat: location.lat, lng: location.lng, name: location.name || '' } : null))
  const [locError, setLocError] = useState(null)
  const [fov, setFov] = useState(saved.fov || 60)
  const [align, setAlign] = useState(saved.align || 0)
  const [showSolstices, setShowSolstices] = useState(saved.showSolstices ?? true)
  const [panel, setPanel] = useState(false)
  const [coordText, setCoordText] = useState('')
  const [horizon, setHorizon] = useState(null)
  const [scan, setScan] = useState(null)     // 0..1 while the DEM ring is read

  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const size = useSize(stageRef)
  const { basis, angles, state: sensorState, request: requestSensor } = useDeviceAttitude({ offsetDeg: align })
  const { stream, error: camError } = useCamera(mode === 'ar')

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ mode, fov, align, showSolstices })) } catch { /* private mode */ }
  }, [mode, fov, align, showSolstices])

  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])

  // The clock ticks either way: it drives the view while the view follows it,
  // and marks where the sun is *now* once you have scrubbed away from that
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { if (live) setWhen(nowTs) }, [live, nowTs])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { panel ? setPanel(false) : onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, panel])

  // Nothing to compute without a point; ask the device once on open
  const askLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocError('This device has no location service'); return }
    setLocError('locating')
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, name: 'My location' }); setLocError(null); setHorizon(null) },
      () => setLocError('Location is off. Enter coordinates, or use the map centre'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    )
  }, [])
  // Open where you are standing, which is what the question usually means.
  // A point that came from a map pin is left exactly where it was put.
  const askedRef = useRef(false)
  useEffect(() => {
    if (askedRef.current) return
    if (!loc || location?.locate) { askedRef.current = true; askLocation() }
  }, [loc, location, askLocation])

  // ── the day, the sun, the ridge ─────────────────────────────────────────
  const day = startOfDay(when)
  const track = useMemo(
    () => (loc ? sunTrack(new Date(day), loc.lat, loc.lng, { stepMin: 4 }) : []),
    [day, loc])
  const times = useMemo(
    () => (loc ? sunTimes(new Date(day), loc.lat, loc.lng, horizon ? { horizon } : {}) : null),
    [day, loc, horizon])
  const sun = useMemo(
    () => (loc ? sunPosition(new Date(when), loc.lat, loc.lng) : null),
    [when, loc])
  const nowSun = useMemo(
    () => (loc ? sunPosition(new Date(nowTs), loc.lat, loc.lng) : null),
    [loc, nowTs])
  const solstices = useMemo(() => {
    if (!loc || !showSolstices) return null
    const year = new Date(day).getFullYear()
    return {
      june: sunTrack(solsticeAt(year, 5), loc.lat, loc.lng, { stepMin: 8 }),
      december: sunTrack(solsticeAt(year, 11), loc.lat, loc.lng, { stepMin: 8 }),
    }
  }, [loc, day, showSolstices])
  const collection = useMemo(
    () => (loc ? solarDay(new Date(day), loc.lat, loc.lng, { horizon }) : null),
    [day, loc, horizon])

  const runScan = useCallback(async () => {
    if (!loc || scan != null) return
    setScan(0)
    try {
      const p = await horizonProfile(loc.lat, loc.lng, { onProgress: setScan })
      setHorizon(p)
      if (!p) setLocError('No elevation data covers this point')
    } catch {
      setLocError('Ridgeline scan failed. The elevation tiles need a connection the first time')
    } finally {
      setScan(null)
    }
  }, [loc, scan])

  // ── projection ──────────────────────────────────────────────────────────
  // One focal length for both axes: the camera preview fills the stage with a
  // uniform scale, so degrees per pixel is the same across and down. `fov` is
  // how wide the *screen* is in degrees, which is the thing a user can see and
  // correct, rather than a lens spec the browser will not tell us.
  const focal = size.w ? (size.w / 2) / Math.tan(fov / 2 * RAD) : 0
  const project = useCallback((az, alt) => {
    if (!basis || !focal) return null
    const v = skyVector(az, alt)
    const z = dot3(v, basis.forward)
    if (z <= 0.08) return null                       // behind the camera, or grazing it
    return { x: size.w / 2 + focal * dot3(v, basis.right) / z, y: size.h / 2 - focal * dot3(v, basis.up) / z }
  }, [basis, focal, size.w, size.h])

  // Drag the sky sideways to line the overlay up with what you can actually
  // see. One drag absorbs magnetic declination and magnetometer bias together.
  const dragRef = useRef(null)
  const onPointerDown = (e) => {
    if (mode !== 'ar' || !focal) return
    dragRef.current = { x: e.clientX, align }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    setAlign(dragRef.current.align + (dx / focal) / RAD)
  }
  const onPointerUp = () => { dragRef.current = null }

  const minutes = Math.round((when - day) / 60000)
  const setMinutes = (m) => { setLive(false); setWhen(day + m * 60000) }
  const shiftDay = (n) => { setLive(false); setWhen(when + n * 86400000) }
  const goNow = () => { const t = Date.now(); setNowTs(t); setLive(true); setWhen(t) }

  const applyCoords = () => {
    const p = parseCoords(coordText)
    if (!p) { setLocError('Could not read those coordinates'); return }
    setLoc({ lat: p.lat, lng: p.lng, name: '' })
    setHorizon(null); setLocError(null); setCoordText('')
  }

  // Times are the device's, which is right where you are standing and worth
  // saying out loud when the point is a long way east or west of you.
  const tzNote = useMemo(() => {
    if (!loc) return null
    const deviceH = -new Date(when).getTimezoneOffset() / 60
    const solarH = loc.lng / 15
    const gap = solarH - deviceH
    return Math.abs(gap) < 1.5 ? null
      : `Times are your device's. This point runs about ${Math.abs(Math.round(gap))} h ${gap > 0 ? 'ahead of' : 'behind'} your clock by the sun.`
  }, [loc, when])

  const arReady = mode === 'ar' && basis && stream
  const belowHorizon = sun && sun.apparent < (horizon ? horizonAt(horizon, sun.azimuth) : 0)

  return (
    <div className="sp-root" role="dialog" aria-label="Sun path">
      <div className="sp-top">
        <button className="sp-icon-btn" onClick={onClose} aria-label="Close sun path" title="Close"><X size={18} /></button>
        <div className="sp-title">
          <span className="sp-title-main">Sun path</span>
          <span className="sp-title-sub">{loc ? (loc.name || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`) : 'no location yet'}</span>
        </div>
        <div className="sp-modes">
          <button className={`sp-mode ${mode === 'ar' ? 'active' : ''}`} onClick={() => setMode('ar')}
            disabled={!canAR} title={canAR ? 'Camera view' : 'Needs a device with a camera and a compass'}>
            <Camera size={15} /> AR
          </button>
          <button className={`sp-mode ${mode === 'dome' ? 'active' : ''}`} onClick={() => setMode('dome')} title="Sun path dome">
            <Compass size={15} /> Dome
          </button>
        </div>
        <button className={`sp-icon-btn ${panel ? 'active' : ''}`} onClick={() => setPanel(p => !p)} aria-label="Sun path settings" title="Settings">
          <Settings size={17} />
        </button>
      </div>

      <div className={`sp-stage sp-stage-${mode}`} ref={stageRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {mode === 'ar' && <video ref={videoRef} className="sp-video" autoPlay playsInline muted />}

        {mode === 'ar' && arReady && loc && (
          <ArOverlay size={size} project={project} track={track} solstices={solstices} horizon={horizon}
            times={times} sun={sun} nowSun={live ? null : nowSun} when={when} loc={loc} />
        )}

        {mode === 'dome' && loc && (
          <Dome track={track} solstices={solstices} horizon={horizon} times={times} sun={sun}
            nowSun={live ? null : nowSun} loc={loc} />
        )}

        {mode === 'ar' && !arReady && (
          <div className="sp-blocker">
            {camError === 'denied' ? <p>Camera access is off. Turn it on for this site, or use the Dome view.</p>
              : camError ? <p>No camera available here. The Dome view shows the same sun path without one.</p>
                : sensorState === 'needs-permission' ? (
                  <><p>AR needs the motion and orientation sensor.</p>
                    <button className="sp-btn" onClick={requestSensor}>Enable compass</button></>
                ) : sensorState === 'denied' ? <p>Motion access is off. The Dome view works without it.</p>
                  : sensorState === 'unsupported' ? <p>This device reports no orientation sensor. Use the Dome view.</p>
                    : !basis ? <p>Waiting for the compass…</p>
                      : <p>Starting the camera…</p>}
            {(camError || sensorState === 'denied' || sensorState === 'unsupported') && (
              <button className="sp-btn" onClick={() => setMode('dome')}>Switch to Dome</button>
            )}
          </div>
        )}

        {!loc && (
          <div className="sp-blocker">
            <p>{locError === 'locating' ? 'Finding your location…' : locError || 'Waiting for a location'}</p>
            <button className="sp-btn" onClick={askLocation}>Use my location</button>
          </div>
        )}

        {mode === 'ar' && arReady && (
          <div className="sp-align-hint">Drag sideways to line the sky up with what you see · {align >= 0 ? '+' : ''}{align.toFixed(1)}°</div>
        )}
      </div>

      <div className="sp-bottom">
        <div className="sp-readout">
          <div className="sp-read-main">
            <span className="sp-read-time">{clock(when)}</span>
            <span className="sp-read-day">{dayLabel(when)}</span>
          </div>
          {sun && (
            <div className="sp-read-pos">
              <span><b>{Math.round(sun.azimuth)}°</b> az</span>
              <span><b>{sun.apparent.toFixed(1)}°</b> alt</span>
              {belowHorizon && <span className="sp-below">{horizon ? 'behind the ridge' : 'below the horizon'}</span>}
            </div>
          )}
        </div>

        <div className="sp-scrub">
          <input type="range" min="0" max="1439" step="1" value={Math.min(1439, Math.max(0, minutes))}
            onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Time of day" />
          <div className="sp-scrub-marks">
            {times?.sunrise != null && <Mark day={day} t={times.sunrise} label="rise" />}
            {times?.solarNoon != null && <Mark day={day} t={times.solarNoon} label="noon" />}
            {times?.sunset != null && <Mark day={day} t={times.sunset} label="set" />}
          </div>
        </div>

        <div className="sp-dates">
          <button className="sp-btn sp-btn-sm" onClick={() => shiftDay(-1)} aria-label="Previous day">‹</button>
          <input className="sp-date" type="date" value={new Date(day - new Date(day).getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split('-').map(Number)
              if (!y) return
              const next = new Date(when); next.setFullYear(y, m - 1, d)
              setLive(false); setWhen(next.getTime())
            }} />
          <button className="sp-btn sp-btn-sm" onClick={() => shiftDay(1)} aria-label="Next day">›</button>
          <button className={`sp-btn sp-btn-sm ${live ? 'active' : ''}`} onClick={goNow}>Now</button>
        </div>

        {times && (
          <div className="sp-facts">
            <Fact label="Sunrise" value={times.polar ? (times.polar === 'above' ? 'no sunset' : 'no sunrise') : clock(times.sunrise)} />
            <Fact label="Solar noon" value={`${clock(times.solarNoon)} · ${times.noonAltitude.toFixed(0)}°`} />
            <Fact label="Sunset" value={times.polar ? '—' : clock(times.sunset)} />
            <Fact label="Daylight" value={hm(times.dayMinutes)} />
            <Fact label="Golden hour" value={`${clock(times.goldenMorning[0])}–${clock(times.goldenMorning[1])} · ${clock(times.goldenEvening[0])}–${clock(times.goldenEvening[1])}`} wide />
          </div>
        )}

        <div className="sp-solar">
          <div className="sp-solar-head">
            <Mountain size={14} />
            <span>Solar siting</span>
            {!horizon && (
              <button className="sp-btn sp-btn-sm" onClick={runScan} disabled={scan != null || !loc}>
                {scan != null ? <><Loader size={12} className="sp-spin" /> {Math.round(scan * 100)}%</> : 'Scan ridgeline'}
              </button>
            )}
            {horizon && <button className="sp-btn sp-btn-sm" onClick={() => setHorizon(null)}>Clear ridge</button>}
          </div>
          {collection && (
            <div className="sp-facts sp-facts-solar">
              {horizon ? <>
                <Fact label="Sun clears the ridge" value={clock(times?.terrainRise)} />
                <Fact label="Ridge takes it back" value={clock(times?.terrainSet)} />
                <Fact label="Direct sun" value={hm(times?.terrainMinutes)} />
                <Fact label="Highest ridge" value={`${Math.round(Math.max(...horizon.angles))}°`} />
                <Fact label="Cost of this ridge" wide
                  value={collection.shadedPct == null ? '—'
                    : `${collection.shadedPct}% off an aimed panel, ${collection.flatShadedPct}% off a flat roof, against an open site`} />
              </> : <>
                <Fact label="Direct sun" value={hm(collection.openSkyMinutes)} />
                <Fact label="Horizon" value="flat, so far. Scan the ridgeline for the real one" wide />
              </>}
              <Fact label="Best panel aim"
                value={`${Math.round(collection.best.tilt)}° tilt toward ${Math.round(collection.best.face)}°`} />
              <Fact label="Aiming beats a flat roof" value={collection.gainPct == null ? '—' : `+${collection.gainPct}%`} />
            </div>
          )}
          {horizon && horizon.coverage < 0.995 && (
            <p className="sp-note sp-err">
              Partial scan. {Math.round(horizon.coverage * 100)}% of the sampled points had elevation data,
              and a missing tile reads as flat ground, so the ridge above is a floor rather than the whole
              of it. Scan again on a better connection.
            </p>
          )}
          <p className="sp-note">
            Clear-sky geometry only. No cloud, no haze, and no shade from anything the elevation model
            cannot see (a tree, a rig, a boulder). Compare two spots with it; don't budget amp-hours from it.
          </p>
          {tzNote && <p className="sp-note">{tzNote}</p>}
        </div>
      </div>

      {panel && (
        <div className="sp-panel">
          <div className="sp-panel-head">
            <span>Settings</span>
            <button className="sp-icon-btn" onClick={() => setPanel(false)} aria-label="Close settings"><X size={16} /></button>
          </div>

          <label className="sp-field">
            <span>Screen field of view <b>{Math.round(fov)}°</b></span>
            <input type="range" min="25" max="110" step="1" value={fov} onChange={(e) => setFov(Number(e.target.value))} />
            <small>How wide the camera view is across the screen. Widen or narrow it until the marks sit on the
              landmarks they name. Only affects AR.</small>
          </label>

          <label className="sp-field">
            <span>Compass alignment <b>{align >= 0 ? '+' : ''}{align.toFixed(1)}°</b></span>
            <input type="range" min="-40" max="40" step="0.5" value={align} onChange={(e) => setAlign(Number(e.target.value))} />
            <small>The sensor reads magnetic north; the sun is computed from true north. In the western states
              that gap runs 8–16°, and a magnetometer sitting in a truck adds more. Point at the real sun and
              align to it. <button className="sp-link" onClick={() => setAlign(0)}>Reset</button></small>
          </label>

          <label className="sp-check">
            <input type="checkbox" checked={showSolstices} onChange={(e) => setShowSolstices(e.target.checked)} />
            <span>Show the solstice arcs, the highest and lowest paths of the year</span>
          </label>

          {wakeLock?.supported !== false && (
            <label className="sp-check">
              <input type="checkbox" checked={!!keepAwake} onChange={onToggleKeepAwake} />
              <span>Keep the screen on</span>
            </label>
          )}

          <div className="sp-field">
            <span>Location</span>
            <div className="sp-loc-row">
              <button className="sp-btn sp-btn-sm" onClick={askLocation}><Crosshair size={13} /> My location</button>
            </div>
            <div className="sp-loc-row">
              <input className="sp-coord" placeholder="48.41711, -121.81849" value={coordText}
                onChange={(e) => setCoordText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCoords() }} />
              <button className="sp-btn sp-btn-sm" onClick={applyCoords}>Set</button>
            </div>
            {locError && locError !== 'locating' && <small className="sp-err">{locError}</small>}
          </div>

          {angles && (
            <p className="sp-note">
              Sensor: {angles.north === 'compass' ? 'fused compass' : 'absolute orientation'} ·
              α {Math.round(angles.alpha)}° β {Math.round(angles.beta)}° γ {Math.round(angles.gamma)}°
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Fact({ label, value, wide }) {
  return (
    <div className={`sp-fact ${wide ? 'wide' : ''}`}>
      <span className="sp-fact-label">{label}</span>
      <span className="sp-fact-value">{value}</span>
    </div>
  )
}

function Mark({ day, t, label }) {
  const pct = Math.max(0, Math.min(100, ((t - day) / 60000) / 1440 * 100))
  return <span className="sp-mark" style={{ left: `${pct}%` }}>{label}</span>
}

// ── AR overlay ──────────────────────────────────────────────────────────────

/** Split a projected run into the pieces that stay on one side of the lens. */
function segments(points, size) {
  const out = []
  let run = []
  const jump = Math.max(size.w, size.h) * 2
  for (const p of points) {
    if (!p) { if (run.length > 1) out.push(run); run = []; continue }
    const last = run[run.length - 1]
    if (last && Math.hypot(p.x - last.x, p.y - last.y) > jump) { if (run.length > 1) out.push(run); run = [] }
    run.push(p)
  }
  if (run.length > 1) out.push(run)
  return out
}
const d = (seg) => seg.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

function ArOverlay({ size, project, track, solstices, horizon, times, sun, nowSun, when, loc }) {
  const horizonLine = []
  const ridgeLine = []
  for (let a = 0; a <= 360; a += 3) {
    horizonLine.push(project(a, 0))
    if (horizon) ridgeLine.push(project(a, horizonAt(horizon, a)))
  }
  const arc = track.map(s => (s.altitude > -3 ? project(s.azimuth, s.apparent) : null))
  const hours = track.filter(s => s.minutes % 60 === 0 && s.altitude > 0)
  const sunPt = sun ? project(sun.azimuth, sun.apparent) : null
  const nowPt = nowSun ? project(nowSun.azimuth, nowSun.apparent) : null
  const risePt = times?.sunrise != null ? project(sunPosition(new Date(times.sunrise), loc.lat, loc.lng).azimuth, 0) : null
  const setPt = times?.sunset != null ? project(sunPosition(new Date(times.sunset), loc.lat, loc.lng).azimuth, 0) : null

  return (
    <svg className="sp-overlay" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h}>
      {segments(horizonLine, size).map((s, i) => <path key={`h${i}`} className="sp-ar-horizon" d={d(s)} />)}
      {horizon && segments(ridgeLine, size).map((s, i) => <path key={`r${i}`} className="sp-ar-ridge" d={d(s)} />)}

      {CARDINALS.map(([txt, az]) => {
        const p = project(az, 0)
        if (!p) return null
        return <text key={txt} className={`sp-ar-card ${az === 0 ? 'n' : ''}`} x={p.x} y={p.y - 8} textAnchor="middle">{txt}</text>
      })}

      {solstices && ['june', 'december'].map(k => (
        segments(solstices[k].map(s => (s.altitude > -3 ? project(s.azimuth, s.apparent) : null)), size)
          .map((s, i) => <path key={`${k}${i}`} className={`sp-ar-solstice ${k}`} d={d(s)} />)
      ))}

      {segments(arc, size).map((s, i) => <path key={`a${i}`} className="sp-ar-arc" d={d(s)} />)}

      {hours.map(s => {
        const p = project(s.azimuth, s.apparent)
        if (!p) return null
        return (
          <g key={s.t}>
            <circle className="sp-ar-hour" cx={p.x} cy={p.y} r="3" />
            <text className="sp-ar-hour-label" x={p.x} y={p.y - 9} textAnchor="middle">{hourLabel(s.t)}</text>
          </g>
        )
      })}

      {risePt && <g><circle className="sp-ar-event" cx={risePt.x} cy={risePt.y} r="5" />
        <text className="sp-ar-event-label" x={risePt.x} y={risePt.y + 18} textAnchor="middle">rise {clock(times.sunrise)}</text></g>}
      {setPt && <g><circle className="sp-ar-event" cx={setPt.x} cy={setPt.y} r="5" />
        <text className="sp-ar-event-label" x={setPt.x} y={setPt.y + 18} textAnchor="middle">set {clock(times.sunset)}</text></g>}

      {nowPt && <g><circle className="sp-ar-now" cx={nowPt.x} cy={nowPt.y} r="7" />
        <text className="sp-ar-event-label" x={nowPt.x} y={nowPt.y - 13} textAnchor="middle">now</text></g>}

      {sunPt && (
        <g>
          <circle className="sp-ar-sun-glow" cx={sunPt.x} cy={sunPt.y} r="22" />
          <circle className="sp-ar-sun" cx={sunPt.x} cy={sunPt.y} r="9" />
          <text className="sp-ar-sun-label" x={sunPt.x} y={sunPt.y + 30} textAnchor="middle">{clock(when)}</text>
        </g>
      )}
    </svg>
  )
}

// ── Sun path dome ───────────────────────────────────────────────────────────
// Zenith at the centre, horizon at the rim, north up, azimuth clockwise — the
// standard sun-path chart, and the view that works on a laptop with no compass
// and no camera in it.

const R = 150, CX = 190, CY = 175
const domeXY = (az, alt) => {
  const r = R * (1 - Math.max(alt, -8) / 90)
  const a = az * RAD
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) }
}
const domePath = (samples, floor = 0) => {
  const parts = []
  let run = []
  for (const s of samples) {
    if (s.altitude < floor) { if (run.length > 1) parts.push(run); run = []; continue }
    run.push(domeXY(s.azimuth, s.apparent ?? s.altitude))
  }
  if (run.length > 1) parts.push(run)
  return parts.map(p => p.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' ')).join(' ')
}

function Dome({ track, solstices, horizon, times, sun, nowSun, loc }) {
  const ridge = []
  if (horizon) {
    for (let a = 0; a <= 360; a += horizon.azimuthStep) ridge.push(domeXY(a, horizonAt(horizon, a)))
    ridge.push(ridge[0])
  }
  const hours = track.filter(s => s.minutes % 60 === 0 && s.altitude > 1)
  const sunP = sun && sun.apparent > -8 ? domeXY(sun.azimuth, sun.apparent) : null
  const nowP = nowSun && nowSun.apparent > -8 ? domeXY(nowSun.azimuth, nowSun.apparent) : null

  return (
    <svg className="sp-dome" viewBox="0 0 380 350">
      <circle className="sp-dome-face" cx={CX} cy={CY} r={R} />
      {[30, 60].map(alt => <circle key={alt} className="sp-dome-ring" cx={CX} cy={CY} r={R * (1 - alt / 90)} />)}
      {[0, 30, 60].map(alt => (
        <text key={`l${alt}`} className="sp-dome-alt" x={CX + 3} y={CY - R * (1 - alt / 90) + 10}>{alt}°</text>
      ))}
      {Array.from({ length: 24 }, (_, i) => i * 15).map(az => {
        const o = domeXY(az, 0), inn = domeXY(az, az % 45 === 0 ? 6 : 3)
        return <line key={az} className={az % 90 === 0 ? 'sp-dome-tick maj' : 'sp-dome-tick'} x1={o.x} y1={o.y} x2={inn.x} y2={inn.y} />
      })}
      {CARDINALS.map(([txt, az]) => {
        const p = domeXY(az, -7)
        return <text key={txt} className={`sp-dome-card ${az === 0 ? 'n' : ''}`} x={p.x} y={p.y} textAnchor="middle" dy="0.35em">{txt}</text>
      })}

      {ridge.length > 0 && (
        // Shade the band the terrain takes, not the sky it leaves: the rim
        // circle and the skyline as two subpaths, filled even-odd, so the wash
        // sits between them
        <path className="sp-dome-ridge" fillRule="evenodd"
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 1 0 ${CX + R} ${CY} A ${R} ${R} 0 1 0 ${CX - R} ${CY} Z `
            + ridge.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z'} />
      )}

      {solstices && <>
        <path className="sp-dome-solstice june" d={domePath(solstices.june)} />
        <path className="sp-dome-solstice december" d={domePath(solstices.december)} />
      </>}

      <path className="sp-dome-arc" d={domePath(track)} />

      {hours.map(s => {
        const p = domeXY(s.azimuth, s.apparent)
        return (
          <g key={s.t}>
            <circle className="sp-dome-hour" cx={p.x} cy={p.y} r="2.4" />
            <text className="sp-dome-hour-label" x={p.x} y={p.y - 6} textAnchor="middle">{hourLabel(s.t)}</text>
          </g>
        )
      })}

      {times?.sunrise != null && (() => {
        const p = domeXY(sunPosition(new Date(times.sunrise), loc.lat, loc.lng).azimuth, 0)
        return <circle className="sp-dome-event" cx={p.x} cy={p.y} r="3.5" />
      })()}
      {times?.sunset != null && (() => {
        const p = domeXY(sunPosition(new Date(times.sunset), loc.lat, loc.lng).azimuth, 0)
        return <circle className="sp-dome-event" cx={p.x} cy={p.y} r="3.5" />
      })()}

      {nowP && <circle className="sp-dome-now" cx={nowP.x} cy={nowP.y} r="5" />}
      {sunP && <>
        <circle className="sp-dome-sun-glow" cx={sunP.x} cy={sunP.y} r="13" />
        <circle className="sp-dome-sun" cx={sunP.x} cy={sunP.y} r="6" />
      </>}

      {solstices && (
        <g className="sp-dome-key">
          <line className="sp-dome-solstice june" x1="8" y1="12" x2="26" y2="12" />
          <text className="sp-dome-legend" x="30" y="12" dy="0.35em">June solstice</text>
          <line className="sp-dome-solstice december" x1="8" y1="26" x2="26" y2="26" />
          <text className="sp-dome-legend" x="30" y="26" dy="0.35em">December solstice</text>
        </g>
      )}
    </svg>
  )
}
