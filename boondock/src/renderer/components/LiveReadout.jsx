import { useState, useEffect, useMemo, useRef } from 'react'
import { elevationAt } from '../../shared/elevation'
import { useDeviceHeading } from '../../shared/useDeviceHeading'
import './LiveReadout.css'

// Live instrument cluster (VISION row 89): elevation + speed cells over a
// sliding compass ribbon, all from the device's own sensors. Layout takes
// its cue from Gaia GPS's trip bar (credited in README + Guide Credits);
// the visual design is Boondock's glass system. Mounting starts the GPS
// watch and the orientation listener; unmounting releases both, so the
// toggle in Map.jsx is also the sensor kill switch.

const PX_PER_DEG = 2
const CARDINALS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const CARDINALS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export default function LiveReadout() {
  const [fix, setFix] = useState(null)          // {lat,lng,speed,heading,altitude,at}
  const [geoState, setGeoState] = useState('waiting') // 'waiting'|'ok'|'denied'|'unavailable'
  const [elev, setElev] = useState(null)        // {ft, src:'dem'|'gps'}
  const [stale, setStale] = useState(false)
  const [magQuiet, setMagQuiet] = useState(false)
  const { heading: magHeading, state: magState, request: requestCompass } = useDeviceHeading()
  const fixRef = useRef(null)
  const movingRef = useRef(false)
  const lastSampleRef = useRef(null)
  const tapeRef = useRef(null)
  const contRef = useRef(null)                  // unwrapped heading driving the tape

  // ── GPS watch — same options as track recording ─────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGeoState('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords
        // Hysteresis: a phone magnetometer inside a vehicle is not
        // trustworthy, and GPS course is excellent at speed — so above
        // ~5.6 mph the ribbon follows the GPS course instead
        if (Number.isFinite(c.speed)) {
          if (c.speed >= 2.5) movingRef.current = true
          else if (c.speed < 1.0) movingRef.current = false
        }
        const f = {
          lat: c.latitude, lng: c.longitude,
          speed: c.speed, heading: c.heading, altitude: c.altitude,
          at: Date.now(),
        }
        fixRef.current = f
        setFix(f)
        setGeoState('ok')
        setStale(false)
      },
      (err) => {
        if (err.code === 1) setGeoState('denied')
        else if (err.code === 2) setGeoState('unavailable')
        // Timeouts (code 3) keep waiting; the stale dim covers a feed that stops
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // A fix older than 15 s dims the cells that depend on it
  useEffect(() => {
    const t = setInterval(() => {
      setStale(fixRef.current != null && Date.now() - fixRef.current.at > 15000)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  // ── Elevation — the app's DEM at the live fix, GPS altitude offline ─────
  useEffect(() => {
    if (!fix) return
    const last = lastSampleRef.current
    if (last) {
      const dx = (fix.lng - last.lng) * 111320 * Math.cos(fix.lat * Math.PI / 180)
      const dy = (fix.lat - last.lat) * 110540
      if (dx * dx + dy * dy < 20 * 20) return   // re-sample after ~20 m
    }
    lastSampleRef.current = { lat: fix.lat, lng: fix.lng }
    const fallback = Number.isFinite(fix.altitude)
      ? { ft: Math.round(fix.altitude * 3.28084), src: 'gps' }
      : null
    let live = true
    elevationAt(fix.lng, fix.lat)
      .then((m) => { if (live) setElev(m == null ? fallback : { ft: Math.round(m * 3.28084), src: 'dem' }) })
      .catch(() => { if (live) setElev(fallback) })
    return () => { live = false }
  }, [fix])

  // Desktop browsers implement the orientation event but ship no
  // magnetometer — the listener attaches and nothing ever fires. Call it
  // after a few quiet seconds rather than showing "Reading compass…" forever.
  useEffect(() => {
    if (magState !== 'granted' || magHeading != null) { setMagQuiet(false); return }
    const t = setTimeout(() => setMagQuiet(true), 4000)
    return () => clearTimeout(t)
  }, [magState, magHeading])

  // ── Heading source ──────────────────────────────────────────────────────
  const gpsHeading = Number.isFinite(fix?.heading) ? fix.heading : null
  const useGps = movingRef.current && gpsHeading != null
  const heading = useGps ? gpsHeading : magHeading
  const headingSrc = useGps ? 'gps' : magHeading != null ? 'mag' : null

  // Slide the tape the short way round, staying inside its three rendered
  // turns: jumping by a whole turn is pixel-identical, so it's done with the
  // transition off. React never writes this transform (no style prop on the
  // svg), so the imperative value survives re-renders.
  useEffect(() => {
    const el = tapeRef.current
    if (heading == null || !el) { contRef.current = null; return }
    const write = (deg, animate) => {
      if (!animate) {
        el.style.transition = 'none'
        el.style.transform = `translateX(${-deg * PX_PER_DEG}px)`
        el.getBoundingClientRect()   // flush the jump before re-enabling the slide
        el.style.transition = ''
      } else {
        el.style.transform = `translateX(${-deg * PX_PER_DEG}px)`
      }
    }
    let cur = contRef.current
    if (cur == null) {
      cur = ((heading % 360) + 360) % 360
      write(cur, false)
    } else {
      let target = heading + 360 * Math.round((cur - heading) / 360)
      if (target <= -180 || target >= 540) {
        const shift = target > 0 ? 360 : -360
        cur -= shift
        write(cur, false)
        target -= shift
      }
      write(target, true)
      cur = target
    }
    contRef.current = cur
  }, [heading])

  // The tape spans three compass turns (−360…720) so any heading, plus a
  // wrap of slide either way, always has ticks under the window
  const tape = useMemo(() => {
    const marks = []
    for (let d = -360; d < 720; d += 5) {
      const x = (d + 360) * PX_PER_DEG
      if (d % 45 === 0) {
        const wind = (((d / 45) % 8) + 8) % 8
        const n = wind === 0
        marks.push(<line key={`t${d}`} x1={x} y1={4} x2={x} y2={14} className={n ? 'lr-tick-n' : 'lr-tick-major'} />)
        marks.push(<text key={`c${d}`} x={x} y={25} className={n ? 'lr-card lr-card-n' : 'lr-card'}>{CARDINALS_8[wind]}</text>)
      } else if (d % 15 === 0) {
        marks.push(<line key={`t${d}`} x1={x} y1={6} x2={x} y2={13} className="lr-tick-mid" />)
      } else {
        marks.push(<line key={`t${d}`} x1={x} y1={8} x2={x} y2={12} className="lr-tick" />)
      }
    }
    return marks
  }, [])

  const spd = Number.isFinite(fix?.speed) ? fix.speed : null
  const mph = spd == null ? null : Math.round((spd < 0.45 ? 0 : spd) * 2.23694)

  return (
    <div className="live-readout" role="status" aria-live="off">
      {!fix ? (
        <div className="lr-status">
          {geoState === 'denied'
            ? 'Location blocked — allow location access for this site'
            : geoState === 'unavailable'
              ? 'GPS unavailable on this device'
              : 'Finding GPS…'}
        </div>
      ) : (
        <div className={stale ? 'lr-stale' : undefined}>
          <div className="lr-cells">
            <div className="lr-cell">
              <span className="lr-label">Elevation</span>
              <span className="lr-value lr-fix">
                {elev ? elev.ft.toLocaleString() : '—'}
                <span className="lr-unit">ft</span>
                {elev?.src === 'gps' && <span className="lr-tag">gps</span>}
              </span>
            </div>
            <div className="lr-cell">
              <span className="lr-label">Speed</span>
              <span className="lr-value lr-fix">
                {mph == null ? '—' : mph}
                <span className="lr-unit">mph</span>
              </span>
            </div>
          </div>
          <div className="lr-ribbon">
            {heading != null ? (
              <>
                <svg ref={tapeRef} className="lr-tape" width={2160} height={28}>{tape}</svg>
                <div className="lr-caret" />
                <div className={headingSrc === 'gps' ? 'lr-reading lr-fix' : 'lr-reading'}>
                  {Math.round(heading)}° {CARDINALS_16[Math.round(heading / 22.5) % 16]}
                  <span className="lr-tag">{headingSrc}</span>
                </div>
              </>
            ) : magState === 'needs-permission' ? (
              <button className="lr-compass-btn" onClick={requestCompass}>Enable compass</button>
            ) : (
              <div className="lr-nocompass">
                {magState === 'denied'
                  ? 'Compass access is off — it can be re-allowed in browser settings'
                  : magState === 'granted' && !magQuiet
                    ? 'Reading compass…'
                    : 'No compass on this device — shows GPS direction once moving'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
