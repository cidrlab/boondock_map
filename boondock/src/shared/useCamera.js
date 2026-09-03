import { useState, useEffect } from 'react'

/**
 * Stage plumbing shared by the camera-overlay views (Sun path's AR, the
 * sighting mode): the rear camera stream, and the stage's size in CSS pixels.
 * Moved out of SunPath.jsx when row 139 grew a second camera view.
 */

/** Rear camera, released the moment the view leaves the camera mode or closes. */
export function useCamera(active) {
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

/** Stage size in CSS pixels, tracked so overlays stay honest on rotate. */
export function useSize(ref) {
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
