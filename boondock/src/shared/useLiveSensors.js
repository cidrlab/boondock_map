import { useState, useEffect, useRef } from 'react'
import { elevationAt } from './elevation'
import { useDeviceHeading } from './useDeviceHeading'

// Shared live-sensor feed — one GPS watch + heading-source selection + DEM
// elevation, extracted from the row-89 LiveReadout so rows 90 (beeline nav)
// and 95 (full-screen instruments) consume the same source. Mounting a
// consumer starts the watch; unmounting releases it. In practice only one
// instrument is mounted at a time (the cluster, or the full-screen takeover),
// so a plain hook stays a single watch without a global singleton.
//
// Behavior is a faithful move of the original logic (Tim office-confirmed the
// compass + elevation on iPhone), including the streaming-GPS elevation fix.

export function useLiveSensors() {
  const [fix, setFix] = useState(null)          // {lat,lng,speed,heading,altitude,at}
  const [geoState, setGeoState] = useState('waiting') // 'waiting'|'ok'|'denied'|'unavailable'
  const [elev, setElev] = useState(null)        // {ft, src:'dem'|'gps'}
  const [stale, setStale] = useState(false)
  const [magQuiet, setMagQuiet] = useState(false)
  const { heading: magHeading, state: magState, request: requestCompass } = useDeviceHeading()
  const fixRef = useRef(null)
  const movingRef = useRef(false)
  const lastSampleRef = useRef(null)
  const sampleSeqRef = useRef(0)
  const elevRef = useRef(null)

  // ── GPS watch — same options as track recording ─────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) { setGeoState('unavailable'); return }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const c = pos.coords
        // Hysteresis: a phone magnetometer inside a vehicle is not trustworthy,
        // and GPS course is excellent at speed, so above ~5.6 mph the heading
        // follows GPS course instead of the magnetometer
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

  useEffect(() => { elevRef.current = elev }, [elev])

  // ── Elevation — the app's DEM at the live fix, GPS altitude offline ──────
  // Lookups are never cancelled on a new fix (a sequence number keeps the
  // newest answer, and any answer beats an empty cell); GPS altitude shows
  // immediately while the tile loads. See VISION row 89's office repro.
  useEffect(() => {
    if (!fix) return
    const last = lastSampleRef.current
    if (last && elevRef.current != null) {
      const dx = (fix.lng - last.lng) * 111320 * Math.cos(fix.lat * Math.PI / 180)
      const dy = (fix.lat - last.lat) * 110540
      if (dx * dx + dy * dy < 20 * 20) return   // re-sample after ~20 m
    }
    lastSampleRef.current = { lat: fix.lat, lng: fix.lng }
    const fallback = Number.isFinite(fix.altitude)
      ? { ft: Math.round(fix.altitude * 3.28084), src: 'gps' }
      : null
    if (fallback) setElev(prev => prev ?? fallback)
    const seq = ++sampleSeqRef.current
    elevationAt(fix.lng, fix.lat)
      .then((m) => setElev(prev => {
        const val = m == null ? fallback : { ft: Math.round(m * 3.28084), src: 'dem' }
        return seq === sampleSeqRef.current ? val : prev ?? val
      }))
      .catch(() => setElev(prev => seq === sampleSeqRef.current ? fallback : prev ?? fallback))
  }, [fix])

  // Desktop browsers implement the orientation event but ship no magnetometer;
  // call it quiet after a few silent seconds rather than "Reading compass…"
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

  const spd = Number.isFinite(fix?.speed) ? fix.speed : null
  const mph = spd == null ? null : Math.round((spd < 0.45 ? 0 : spd) * 2.23694)

  return { fix, geoState, elev, stale, heading, headingSrc, magState, magQuiet, requestCompass, mph }
}
