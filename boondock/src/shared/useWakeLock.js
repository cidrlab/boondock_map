import { useState, useEffect, useRef } from 'react'

/**
 * Screen Wake Lock (VISION row 100) — hold the screen on while the map and the
 * compass gauge are up, instead of watching the device sleep mid-drive.
 *
 * Two things make this more than a one-liner:
 *
 * 1. The browser drops the lock whenever the page is hidden — switching apps,
 *    locking the phone, changing tabs. It does not come back on its own, so a
 *    `visibilitychange` listener re-requests it every time the page returns.
 * 2. `request()` rejects for reasons that are not failures worth shouting
 *    about (the tab isn't visible yet, the OS is in power-save). Those are
 *    swallowed; the next visibility change tries again.
 *
 * Support is the honest limit: the API needs a secure context and is absent on
 * older iOS (it landed in 16.4). `supported` says which case you're in so the
 * UI can tell the truth rather than showing a switch that does nothing.
 */

export const wakeLockSupported = () =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator

export function useWakeLock(enabled) {
  const [active, setActive] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!enabled || !wakeLockSupported()) {
      setActive(false)
      return
    }
    let live = true

    const release = () => {
      const s = sentinelRef.current
      sentinelRef.current = null
      s?.release?.().catch(() => {})
    }

    const acquire = async () => {
      if (!live || sentinelRef.current || document.visibilityState !== 'visible') return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (!live) { sentinel.release().catch(() => {}); return }
        sentinelRef.current = sentinel
        setActive(true)
        // The OS can drop it on its own (low battery); reflect that honestly
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
          if (live) setActive(false)
        })
      } catch {
        if (live) setActive(false)   // page hidden or refused — retry on return
      }
    }

    const onVisibility = () => { if (document.visibilityState === 'visible') acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      live = false
      document.removeEventListener('visibilitychange', onVisibility)
      release()
      setActive(false)
    }
  }, [enabled])

  return { supported: wakeLockSupported(), active }
}
