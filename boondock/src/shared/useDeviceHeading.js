import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * useDeviceHeading — magnetic heading of the top edge of the screen, in
 * degrees clockwise from magnetic north, from the device orientation sensor.
 *
 * All the platform mess lives here so nothing else has to know it: iOS
 * ships a fused, tilt-compensated webkitCompassHeading but gates it behind
 * a permission that must be requested from a user tap; Android fires
 * absolute alpha/beta/gamma on its own event name and needs the azimuth
 * derived by hand. Relative (non-absolute) orientation is never used — a
 * compass that silently drifts off north is worse than none.
 *
 * Returns { heading, state, request }:
 *   heading  degrees 0–360, or null before the first usable event
 *   state    'unsupported' | 'needs-permission' | 'granted' | 'denied'
 *   request  call from a user gesture — the iOS permission tap
 */

const EVENT = typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window
  ? 'deviceorientationabsolute'
  : 'deviceorientation'

export function useDeviceHeading() {
  const supported = typeof window.DeviceOrientationEvent !== 'undefined'
  const gated = supported && typeof window.DeviceOrientationEvent.requestPermission === 'function'
  const [heading, setHeading] = useState(null)
  const [state, setState] = useState(supported ? (gated ? 'needs-permission' : 'granted') : 'unsupported')
  const lastRef = useRef(0)
  const listeningRef = useRef(false)

  const handler = useCallback((e) => {
    // The sensor fires up to ~60 Hz; a readout needs a few Hz
    const now = performance.now()
    if (now - lastRef.current < 150) return
    let h = null
    if (e.webkitCompassHeading != null && e.webkitCompassHeading >= 0) {
      h = e.webkitCompassHeading
    } else if ((e.absolute || e.type === 'deviceorientationabsolute') && Number.isFinite(e.alpha)) {
      // Azimuth of the device's top edge from the absolute Z-X'-Y'' angles.
      // Gamma drops out for that axis; this reduces to 360 − alpha anywhere
      // short of vertical and flips correctly past it.
      const a = e.alpha * Math.PI / 180
      const b = (e.beta ?? 0) * Math.PI / 180
      h = Math.atan2(-Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b)) * 180 / Math.PI
    }
    if (h == null) return
    // Rotate into the screen's frame so a rotated phone still reads its top
    // edge. Portrait (angle 0) is the derivation-checked case; the landscape
    // sign still needs an on-device look.
    const angle = screen.orientation?.angle ?? window.orientation ?? 0
    lastRef.current = now
    setHeading(((h + angle) % 360 + 360) % 360)
  }, [])

  const listen = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener(EVENT, handler)
  }, [handler])

  useEffect(() => {
    if (!supported) return
    if (!gated) {
      listen()
    } else {
      // Resolves without any dialog when a previous visit granted; rejects
      // when there's no decision yet and the call isn't inside a user
      // gesture — the "Enable compass" tap covers that path.
      window.DeviceOrientationEvent.requestPermission()
        .then((res) => {
          if (res === 'granted') { setState('granted'); listen() }
          else setState('denied')
        })
        .catch(() => setState('needs-permission'))
    }
    return () => {
      if (listeningRef.current) {
        window.removeEventListener(EVENT, handler)
        listeningRef.current = false
      }
    }
  }, [supported, gated, listen, handler])

  const request = useCallback(() => {
    window.DeviceOrientationEvent.requestPermission()
      .then((res) => {
        if (res === 'granted') { setState('granted'); listen() }
        else setState('denied')
      })
      .catch(() => setState('denied'))
  }, [listen])

  return { heading, state, request }
}
