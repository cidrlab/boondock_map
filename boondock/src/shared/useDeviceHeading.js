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

const D2R = Math.PI / 180

/**
 * attitudeBasis — the three axes of the *screen* expressed in the local
 * east/north/up frame, from the device orientation angles.
 *
 * The device frame is the one the spec defines: x across the screen to the
 * right, y up the screen, z out of the glass toward you, and with all three
 * angles zero the phone lies flat with its top edge pointing north. The
 * rotation that carries that frame into the world is Rz(alpha)·Rx(beta)·Ry(gamma),
 * so the columns of the product *are* the device axes. Two checks pin the
 * convention: (0,0,0) leaves the axes as east/north/up, and (0,90,0) — the
 * phone held upright — sends the screen's top edge to the zenith and the rear
 * camera due north.
 *
 * `screenAngle` then rolls the device frame into the screen frame around the
 * glass, which is what the browser has already done to the camera frames and
 * to the CSS pixels the overlay is drawn in. The sign is the one the heading
 * readout above already uses.
 */
export function attitudeBasis(alpha, beta, gamma, screenAngle = 0) {
  const a = alpha * D2R, b = beta * D2R, g = gamma * D2R
  const ca = Math.cos(a), sa = Math.sin(a)
  const cb = Math.cos(b), sb = Math.sin(b)
  const cg = Math.cos(g), sg = Math.sin(g)
  const r00 = ca * cg - sa * sb * sg, r01 = -sa * cb, r02 = ca * sg + sa * sb * cg
  const r10 = sa * cg + ca * sb * sg, r11 = ca * cb, r12 = sa * sg - ca * sb * cg
  const r20 = -cb * sg, r21 = sb, r22 = cb * cg
  const ct = Math.cos(screenAngle * D2R), st = Math.sin(screenAngle * D2R)
  return {
    right: [r00 * ct - r01 * st, r10 * ct - r11 * st, r20 * ct - r21 * st],
    up: [r00 * st + r01 * ct, r10 * st + r11 * ct, r20 * st + r21 * ct],
    forward: [-r02, -r12, -r22],      // out of the back of the phone, where the camera looks
  }
}

/**
 * useDeviceAttitude — the same sensor as `useDeviceHeading`, but kept as a
 * full orientation instead of collapsed to one number, for the AR sun overlay
 * (VISION row 132). A compass answers "which way am I facing"; drawing the sun
 * on a camera feed also needs the tilt and the roll, which no single angle can
 * carry.
 *
 * On Android the absolute event's alpha is already referenced to north, so it
 * is used as it stands. On iOS alpha starts from wherever the phone happened
 * to be, and only `webkitCompassHeading` knows north, so the yaw is shifted by
 * whatever offset makes the two agree — the standard fix, and the same one
 * three.js's DeviceOrientationControls applies with its `alphaOffset`.
 *
 * `offsetDeg` is the user's own nudge on top of that. It exists because the
 * sensor is referenced to *magnetic* north while the sun is computed against
 * *true* north, and the difference runs 8–16° across the western states. There
 * is no magnetic model in the app to correct it with, so the overlay offers a
 * drag-to-align instead, which also absorbs whatever bias the magnetometer
 * picked up from the truck it is sitting in.
 *
 * Samples at ~30 Hz: smooth enough to track a hand, half the sensor's rate.
 */
export function useDeviceAttitude({ offsetDeg = 0 } = {}) {
  const supported = typeof window !== 'undefined' && typeof window.DeviceOrientationEvent !== 'undefined'
  const gated = supported && typeof window.DeviceOrientationEvent.requestPermission === 'function'
  const [angles, setAngles] = useState(null)   // {alpha, beta, gamma, screenAngle, north}
  const [state, setState] = useState(supported ? (gated ? 'needs-permission' : 'granted') : 'unsupported')
  const lastRef = useRef(0)
  const listeningRef = useRef(false)

  const handler = useCallback((e) => {
    const now = performance.now()
    if (now - lastRef.current < 33) return
    if (!Number.isFinite(e.alpha)) return
    lastRef.current = now
    const compass = e.webkitCompassHeading != null && e.webkitCompassHeading >= 0 ? e.webkitCompassHeading : null
    const absolute = e.absolute || e.type === 'deviceorientationabsolute'
    if (compass == null && !absolute) return      // a yaw with no north in it is not worth drawing
    setAngles({
      alpha: e.alpha, beta: e.beta ?? 0, gamma: e.gamma ?? 0,
      screenAngle: screen.orientation?.angle ?? window.orientation ?? 0,
      // iOS: shift alpha so the derived heading matches the fused compass
      yawFix: compass == null ? 0 : (360 - compass) - e.alpha,
      north: compass == null ? 'absolute' : 'compass',
    })
  }, [])

  const listen = useCallback(() => {
    if (listeningRef.current) return
    listeningRef.current = true
    window.addEventListener(EVENT, handler)
  }, [handler])

  useEffect(() => {
    if (!supported) return
    if (!gated) listen()
    else {
      window.DeviceOrientationEvent.requestPermission()
        .then((res) => { if (res === 'granted') { setState('granted'); listen() } else setState('denied') })
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
      .then((res) => { if (res === 'granted') { setState('granted'); listen() } else setState('denied') })
      .catch(() => setState('denied'))
  }, [listen])

  const basis = angles
    ? attitudeBasis(angles.alpha + angles.yawFix + offsetDeg, angles.beta, angles.gamma, angles.screenAngle)
    : null
  return { basis, angles, state, request }
}
