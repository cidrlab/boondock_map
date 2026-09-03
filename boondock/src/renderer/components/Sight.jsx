import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useDeviceAttitude } from '../../shared/useDeviceHeading'
import { useCamera, useSize } from '../../shared/useCamera'
import { directionAngles, sightFix, MAX_SIGHT_M } from '../../shared/sight'
import { declination, WMM_VALID_TO } from '../../shared/geomag'
import { sunPosition } from '../../shared/sun'
import { parseCoords } from '../../shared/parseCoords'
import { X, Camera, Compass, Crosshair, Sun, Loader } from './Icons'
import './Sight.css'

/**
 * Sight a point (VISION row 139) — aim the phone at something you can see (a
 * forest road cut, a meadow, a saddle), tap, and the app estimates where that
 * point sits on the map by walking the aim line through the elevation model
 * until it meets the ground. The fire lookout's Osborne Firefinder, with the
 * DEM standing in for the second tower.
 *
 * The compass is the weak link, and the view is honest about it in three
 * layers: the reading is corrected from magnetic to true north with the
 * embedded World Magnetic Model (geomag.js, pinned to NOAA's official test
 * values); "Align on the sun" measures the residual device bias against the
 * one landmark whose true bearing is always known exactly (sun.js, pinned to
 * the USNO); and what lands on the map is never just a pin — it is the strip
 * of ground the stated sensor error actually spans, re-marched through the
 * terrain, which stretches for miles when the geometry grazes a ridge and
 * says so.
 *
 * Manual mode takes a typed true bearing and pitch instead — the desktop
 * path, and the paper-map workflow (read a bearing from a real compass,
 * let the terrain fix the distance).
 */

const PREF_KEY = 'boondock-sight'
const SMOOTH_N = 10          // ~0.3 s of attitude samples at the hook's 30 Hz
const MAX_MI = Math.round(MAX_SIGHT_M / 1609.34)   // the engine's reach, in the copy's units

const fmtMi = (m) => {
  const mi = m / 1609.34
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi.toFixed(1)} mi`
}
const fmtFt = (m) => (m == null ? '—' : `${Math.round(m * 3.28084).toLocaleString()} ft`)

export default function Sight({ onClose, onResult, onSaveWaypoint }) {
  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {} } catch { return {} } }, [])
  const canCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
    && typeof window.DeviceOrientationEvent !== 'undefined'
  const handheld = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

  const [mode, setMode] = useState(() => (canCamera && handheld ? 'camera' : 'manual'))
  const [loc, setLoc] = useState(null)                 // {lat, lng, acc, pinned}
  const [locError, setLocError] = useState(null)
  const [trim, setTrim] = useState(saved.trim || 0)    // device bias on top of declination, degrees
  const [aligned, setAligned] = useState(false)        // sun alignment done this session
  const [coordText, setCoordText] = useState('')
  const [manualAz, setManualAz] = useState('')
  const [manualPitch, setManualPitch] = useState('0')
  const [busy, setBusy] = useState(null)               // 0..1 while the terrain is read
  const [result, setResult] = useState(null)           // sightFix output + the frozen aim
  const [error, setError] = useState(null)

  const [zoom, setZoom] = useState(1)                  // view magnification, 1–8× (row 140)
  const stageRef = useRef(null)
  const videoRef = useRef(null)
  const size = useSize(stageRef)
  const { basis, angles, state: sensorState, request: requestSensor } = useDeviceAttitude()
  const { stream, error: camError } = useCamera(mode === 'camera')

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ trim })) } catch { /* private mode */ }
  }, [trim])
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream }, [stream])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // The observer is where the phone is standing: follow the GPS while open,
  // unless coordinates were typed, which pins them
  useEffect(() => {
    if (!navigator.geolocation) { setLocError('This device has no location service'); return }
    const id = navigator.geolocation.watchPosition(
      (p) => setLoc(prev => (prev?.pinned ? prev : {
        lat: p.coords.latitude, lng: p.coords.longitude,
        acc: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null,
      })),
      () => setLoc(prev => { if (!prev) setLocError('Location is off — enter coordinates below'); return prev }),
      { enableHighAccuracy: true, maximumAge: 5000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  const applyCoords = () => {
    const p = parseCoords(coordText)
    if (!p) { setLocError('Could not read those coordinates'); return }
    setLoc({ lat: p.lat, lng: p.lng, acc: null, pinned: true })
    setLocError(null); setCoordText('')
  }

  // Magnetic → true correction for this spot, from the embedded WMM2025
  const decl = useMemo(() => (loc ? declination(loc.lat, loc.lng) : null), [loc])
  const modelStale = new Date().getUTCFullYear() >= WMM_VALID_TO

  // Where the camera points, smoothed over the last few samples — the numbers
  // the crosshair reads and the capture freezes. Azimuth is averaged as a
  // vector so 359° and 1° meet at 0°, not at 180°.
  const ringRef = useRef([])
  const aim = useMemo(() => {
    if (!basis) return null
    const a = directionAngles(basis.forward)
    const ring = ringRef.current
    ring.push(a)
    if (ring.length > SMOOTH_N) ring.shift()
    let sx = 0, sy = 0, sp = 0
    for (const s of ring) {
      sx += Math.sin(s.azimuth * Math.PI / 180)
      sy += Math.cos(s.azimuth * Math.PI / 180)
      sp += s.pitch
    }
    const azMag = ((Math.atan2(sx, sy) * 180 / Math.PI) % 360 + 360) % 360
    return { azMag, pitch: sp / ring.length }
  }, [basis])
  const azTrue = aim != null && decl != null ? ((aim.azMag + decl + trim) % 360 + 360) % 360 : null

  // The sun is the one landmark whose true bearing is known everywhere: aim
  // the crosshair at it and one tap measures the whole compass error at once
  // (declination residue, the truck's magnetism, everything). The bearing is
  // computed at tap time — the sun moves a quarter degree a minute.
  const sunUp = useMemo(
    () => (loc ? sunPosition(new Date(), loc.lat, loc.lng).apparent > 0 : false),
    [loc, busy])   // busy toggles re-check it; exactness only matters at the tap
  const alignToSun = () => {
    if (azTrue == null || !loc) return
    const sun = sunPosition(new Date(), loc.lat, loc.lng)
    if (sun.apparent <= 0) return
    let d = sun.azimuth - azTrue
    d = ((d + 540) % 360) - 180
    if (Math.abs(d) > 30) { setError(`That reads ${Math.abs(Math.round(d))}° off the sun — aim the crosshair at the sun itself, then tap again`); return }
    setTrim(t => t + d)
    setAligned(true)
    setError(null)
  }

  const run = useCallback(async (azimuth, pitch, sigmas) => {
    if (!loc) return
    setBusy(0); setError(null); setResult(null)
    try {
      const fix = await sightFix({
        lat: loc.lat, lng: loc.lng, azimuth, pitch,
        ...sigmas, onProgress: setBusy,
      })
      if (fix.noBase) setError('No elevation data covers where you are standing — this needs a connection the first time')
      else if (!fix.hit) setError(fix.coverage < 0.9
        ? 'Too much elevation data is missing along that line to call it — try again on a better connection'
        : `That line clears every ridge within ${MAX_MI} mi — nothing to land on. Aim at ground, not sky`)
      else setResult({ ...fix, azimuth, pitch, eye: { lat: loc.lat, lng: loc.lng } })
    } catch {
      setError('Reading the terrain failed — the elevation tiles need a connection the first time')
    } finally {
      setBusy(null)
    }
  }, [loc])

  const sightNow = () => {
    if (azTrue == null || !aim) return
    // Compass error dominates; a sun alignment removes the bias and leaves the noise
    run(azTrue, aim.pitch, { azSigma: aligned ? 1.5 : 3, pitchSigma: 1 })
  }
  const sightManual = () => {
    const az = parseFloat(manualAz), p = parseFloat(manualPitch)
    if (!Number.isFinite(az)) { setError('Bearing needs a number of degrees, 0–360 from true north'); return }
    if (!Number.isFinite(p) || p < -89 || p > 89) { setError('Pitch is the angle above (+) or below (−) level, in degrees'); return }
    run(((az % 360) + 360) % 360, p, { azSigma: 1, pitchSigma: 0.5 })
  }

  const provenance = (r) =>
    `Sighted from ${r.eye.lat.toFixed(5)}, ${r.eye.lng.toFixed(5)} · ${Math.round(r.azimuth)}° true · pitch ${r.pitch >= 0 ? '+' : ''}${r.pitch.toFixed(1)}° · ${fmtMi(r.hit.distance)}`

  // The note rides along so a save from the map chip keeps the provenance too
  const show = () => { onResult?.({ ...result, note: provenance(result) }); onClose() }
  const save = () => {
    onResult?.({ ...result, note: provenance(result) })
    onSaveWaypoint?.({
      lng: result.hit.lng, lat: result.hit.lat,
      ...(result.hit.elevation != null && { elev_ft: Math.round(result.hit.elevation * 3.28084) }),
      prefill: { name: 'Sighted point', icon: 'viewpoint', notes: provenance(result) },
    })
    onClose()
  }

  // Pinch to zoom the camera view (row 140). Purely an aiming aid: the
  // crosshair is the centre of projection, so magnifying the pixels around it
  // changes nothing about the ray — which is also why a centred CSS scale is
  // enough and no device zoom API needs trusting.
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)
  const pinchSpan = () => { const [a, b] = [...pointersRef.current.values()]; return Math.hypot(a.x - b.x, a.y - b.y) }
  const onStageDown = (e) => {
    if (mode !== 'camera') return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    // Capture only once a second finger lands: capturing on the first press
    // would retarget its pointerup to the stage and swallow the click on any
    // button inside it (the zoom pill, Align on the sun)
    if (pointersRef.current.size === 2) {
      e.currentTarget.setPointerCapture?.(e.pointerId)
      pinchRef.current = { d0: pinchSpan(), z0: zoom }
    }
  }
  const onStageMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinchRef.current && pointersRef.current.size === 2) {
      setZoom(Math.min(8, Math.max(1, pinchRef.current.z0 * pinchSpan() / pinchRef.current.d0)))
    }
  }
  const onStageUp = (e) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) pinchRef.current = null
  }
  const cycleZoom = () => setZoom(z => (z >= 8 ? 1 : z >= 4 ? 8 : z >= 2 ? 4 : 2))

  const camReady = mode === 'camera' && basis && stream
  const needsHelp = mode === 'camera' && !camReady

  return (
    <div className="si-root" role="dialog" aria-label="Sight a point">
      <div className="si-top">
        <button className="si-icon-btn" onClick={onClose} aria-label="Close sighting" title="Close"><X size={18} /></button>
        <div className="si-title">
          <span className="si-title-main">Sight a point</span>
          <span className="si-title-sub">
            {loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}${loc.acc != null ? ` · GPS ±${loc.acc} m` : ''}${loc.pinned ? ' · typed' : ''}` : 'waiting for a location'}
          </span>
        </div>
        <div className="si-modes">
          <button className={`si-mode ${mode === 'camera' ? 'active' : ''}`} onClick={() => setMode('camera')}
            disabled={!canCamera} title={canCamera ? 'Aim with the camera' : 'Needs a device with a camera and a compass'}>
            <Camera size={15} /> Camera
          </button>
          <button className={`si-mode ${mode === 'manual' ? 'active' : ''}`} onClick={() => setMode('manual')} title="Type a bearing instead">
            <Compass size={15} /> Manual
          </button>
        </div>
      </div>

      <div className={`si-stage ${mode === 'camera' ? 'si-stage-cam' : ''}`} ref={stageRef}
        onPointerDown={onStageDown} onPointerMove={onStageMove} onPointerUp={onStageUp} onPointerCancel={onStageUp}>
        {mode === 'camera' && (
          <video ref={videoRef} className="si-video" autoPlay playsInline muted
            style={zoom > 1 ? { transform: `scale(${zoom})` } : undefined} />
        )}

        {camReady && (
          <svg className="si-overlay" viewBox={`0 0 ${size.w} ${size.h}`} width={size.w} height={size.h}>
            <line className="si-cross" x1={size.w / 2 - 34} y1={size.h / 2} x2={size.w / 2 - 10} y2={size.h / 2} />
            <line className="si-cross" x1={size.w / 2 + 10} y1={size.h / 2} x2={size.w / 2 + 34} y2={size.h / 2} />
            <line className="si-cross" x1={size.w / 2} y1={size.h / 2 - 34} x2={size.w / 2} y2={size.h / 2 - 10} />
            <line className="si-cross" x1={size.w / 2} y1={size.h / 2 + 10} x2={size.w / 2} y2={size.h / 2 + 34} />
            <circle className="si-cross" cx={size.w / 2} cy={size.h / 2} r="3.2" />
          </svg>
        )}

        {camReady && (
          <button className="si-zoom" onClick={cycleZoom}
            title="Zoom the view to aim precisely — pinch for fine control. An aiming aid only; zoom changes nothing about the estimate">
            {Number.isInteger(zoom) ? zoom : zoom.toFixed(1)}×
          </button>
        )}

        {camReady && sunUp && (
          <button className="si-sun-align" onClick={alignToSun}
            title="Aim the crosshair at the sun, then tap — measures the compass error against the one bearing that is always known">
            <Sun size={14} /> {aligned ? 'Re-align on the sun' : 'Align on the sun'}
          </button>
        )}

        {needsHelp && (
          <div className="si-blocker">
            {camError === 'denied' ? <p>Camera access is off. Turn it on for this site, or use Manual.</p>
              : camError ? <p>No camera available here. Manual mode takes a typed bearing instead.</p>
                : sensorState === 'needs-permission' ? (
                  <><p>Sighting needs the motion and orientation sensor.</p>
                    <button className="si-btn" onClick={requestSensor}>Enable compass</button></>
                ) : sensorState === 'denied' ? <p>Motion access is off. Manual mode works without it.</p>
                  : sensorState === 'unsupported' ? <p>This device reports no orientation sensor. Use Manual mode.</p>
                    : !basis ? <p>Waiting for the compass…</p>
                      : <p>Starting the camera…</p>}
            {(camError || sensorState === 'denied' || sensorState === 'unsupported') && (
              <button className="si-btn" onClick={() => setMode('manual')}>Switch to Manual</button>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <div className="si-manual">
            <p className="si-manual-lede">A bearing from a known point, the terrain finds the distance —
              the fire-lookout method. Bearings here are from <b>true</b> north (a paper-map bearing),
              not a raw compass needle.</p>
            <label className="si-field">
              <span>Bearing, ° true</span>
              <input inputMode="decimal" placeholder="297.5" value={manualAz}
                onChange={(e) => setManualAz(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sightManual() }} />
            </label>
            <label className="si-field">
              <span>Pitch, ° above level</span>
              <input inputMode="decimal" value={manualPitch}
                onChange={(e) => setManualPitch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sightManual() }} />
            </label>
            {!loc && (
              <div className="si-field">
                <span>Standing at</span>
                <div className="si-loc-row">
                  <input className="si-coord" placeholder="44.09182, -121.76290" value={coordText}
                    onChange={(e) => setCoordText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyCoords() }} />
                  <button className="si-btn si-btn-sm" onClick={applyCoords}>Set</button>
                </div>
              </div>
            )}
            <button className="si-btn si-primary" onClick={sightManual} disabled={!loc || busy != null}>
              {busy != null ? <><Loader size={14} className="si-spin" /> Reading terrain… {Math.round(busy * 100)}%</> : <>Sight</>}
            </button>
          </div>
        )}

        {busy != null && mode === 'camera' && (
          <div className="si-busy"><Loader size={16} className="si-spin" /> Reading terrain… {Math.round(busy * 100)}%</div>
        )}
      </div>

      <div className="si-bottom">
        {mode === 'camera' && (
          <>
            <div className="si-readout">
              <div className="si-read-item">
                <span className="si-read-label">Bearing</span>
                <span className="si-read-value">{azTrue != null ? `${azTrue.toFixed(1)}°` : '—'}<small> true</small></span>
              </div>
              <div className="si-read-item">
                <span className="si-read-label">Pitch</span>
                <span className="si-read-value">{aim ? `${aim.pitch >= 0 ? '+' : ''}${aim.pitch.toFixed(1)}°` : '—'}</span>
              </div>
              <button className="si-btn si-primary si-shutter" onClick={sightNow}
                disabled={!loc || azTrue == null || busy != null}>
                <Crosshair size={16} /> Sight
              </button>
            </div>
            {decl != null && (
              <p className="si-note">
                Compass corrected {decl >= 0 ? '+' : ''}{decl.toFixed(1)}° magnetic→true (WMM2025)
                {trim !== 0 ? `, ${trim >= 0 ? '+' : ''}${trim.toFixed(1)}° device trim${aligned ? ' from the sun' : ''}` : ''}.
                {!aligned && ' A phone compass still wanders a few degrees — align on the sun when it\'s out.'}
                {modelStale && ' The magnetic model has aged out (valid to 2030) and needs updating.'}
              </p>
            )}
            {trim !== 0 && (
              <p className="si-note"><button className="si-link" onClick={() => { setTrim(0); setAligned(false) }}>Reset device trim</button></p>
            )}
          </>
        )}

        {error && <p className="si-note si-err">{error}</p>}

        {result && (
          <div className="si-result">
            <div className="si-facts">
              <div className="si-fact"><span className="si-fact-label">Distance</span>
                <span className="si-fact-value">{fmtMi(result.hit.distance)}</span></div>
              <div className="si-fact"><span className="si-fact-label">Elevation</span>
                <span className="si-fact-value">{fmtFt(result.hit.elevation)}</span></div>
              <div className="si-fact"><span className="si-fact-label">Point</span>
                <span className="si-fact-value">{result.hit.lat.toFixed(4)}, {result.hit.lng.toFixed(4)}</span></div>
              <div className="si-fact"><span className="si-fact-label">Aim error spans</span>
                <span className="si-fact-value">{fmtMi(result.near)}–{result.openEnded ? 'beyond range' : fmtMi(result.far)}</span></div>
            </div>
            {result.grazing && (
              <p className="si-note si-warn">Grazing hit: the line meets this slope at a shallow angle, so a small
                aim change moves the answer a long way. Trust the strip drawn on the map, not the pin alone.</p>
            )}
            {result.openEnded && (
              <p className="si-note si-warn">Aiming a touch higher clears every ridge in range — if what you sighted
                is past the far ridge, it is beyond this estimate.</p>
            )}
            {(result.coverage < 0.995 || result.gapBeforeHit) && (
              <p className="si-note si-warn">Some elevation tiles were missing along the line
                ({Math.round(result.coverage * 100)}% read), and a missing tile can hide a nearer ridge —
                re-sight on a better connection to be sure.</p>
            )}
            <div className="si-actions">
              <button className="si-btn si-primary" onClick={show}>Show on map</button>
              <button className="si-btn" onClick={save}>Save waypoint</button>
              <button className="si-btn" onClick={() => setResult(null)}>Sight again</button>
            </div>
          </div>
        )}

        {!result && !error && (
          <p className="si-note">
            {mode === 'camera'
              ? 'Put the crosshair on something on the ground — a road cut, a meadow, a saddle — and tap Sight. Pinch to zoom in on it first. The estimate lands where that line first meets the terrain.'
              : `The estimate lands where the bearing line first meets the terrain, out to ${MAX_MI} mi.`}
          </p>
        )}
      </div>
    </div>
  )
}
