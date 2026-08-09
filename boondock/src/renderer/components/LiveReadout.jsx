import { useEffect, useMemo, useRef } from 'react'
import { useLiveSensors } from '../../shared/useLiveSensors'
import { bearingTo, distanceMiles, relativeTurn, formatDistance } from '../../shared/geo'
import { Maximize, Eye } from './Icons'
import './LiveReadout.css'

// Live instrument cluster (VISION row 89): elevation + speed cells over a
// sliding compass ribbon, all from the device's own sensors (now via the
// shared useLiveSensors hook). Layout takes its cue from Gaia GPS's trip bar
// (credited in README + Guide Credits); the visual design is Boondock's glass.
//
// When a navigation target is set (VISION row 90) the ribbon also shows a green
// target pip and the cluster grows a nav row with straight-line distance and a
// turn hint — beeline guidance, honestly labeled as as-the-crow-flies.
//
// A control row at the foot carries the two things you want with the gauge in
// front of you: full-screen instruments (row 103 — it used to be a toolbar
// button, a long way from the compass it opens) and keep-screen-awake
// (row 100).

const PX_PER_DEG = 2
const RIBBON_HALF_DEG = 72   // target pip clamps here, then becomes an edge arrow
const CARDINALS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const CARDINALS_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]

export default function LiveReadout({
  navTarget = null, onFix, onCancelNav,
  onOpenInstruments, keepAwake, wakeLock, onToggleKeepAwake,
}) {
  const { fix, geoState, elev, stale, heading, headingSrc, magState, magQuiet, requestCompass, mph } = useLiveSensors()
  const tapeRef = useRef(null)
  const contRef = useRef(null)                  // unwrapped heading driving the tape

  // Report the live position up so the map can draw the beeline (row 90) —
  // only while navigating, so idle use doesn't re-render App every fix
  useEffect(() => {
    if (navTarget) onFix?.(fix ? { lat: fix.lat, lng: fix.lng } : null)
  }, [fix, navTarget, onFix])

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

  // ── Navigation to a target (row 90) ──────────────────────────────────────
  const nav = useMemo(() => {
    if (!navTarget || !fix) return null
    const target = bearingTo(fix, navTarget)
    const dist = distanceMiles(fix, navTarget)
    const turn = heading == null ? null : relativeTurn(heading, target)
    return { target, dist, turn }
  }, [navTarget, fix, heading])

  const turnHint = (() => {
    if (!nav || nav.turn == null) return null
    if (Math.abs(nav.turn) < 8) return 'straight ahead'
    return `${Math.round(Math.abs(nav.turn))}° ${nav.turn < 0 ? 'left' : 'right'}`
  })()

  const spd = Number.isFinite(fix?.speed) ? fix.speed : null

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
          {navTarget && (
            <div className="lr-nav">
              <svg className="lr-nav-ico" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
              <span className="lr-nav-name">{navTarget.name || 'Target'}</span>
              <span className="lr-nav-dist">{nav ? formatDistance(nav.dist) : '—'}</span>
              {turnHint && <span className="lr-nav-turn">{turnHint}</span>}
              <button className="lr-nav-close" onClick={onCancelNav} aria-label="Stop navigating" title="Stop navigating">×</button>
            </div>
          )}
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
                {nav && (() => {
                  const off = Math.abs(nav.turn) > RIBBON_HALF_DEG
                  const clamped = Math.max(-RIBBON_HALF_DEG, Math.min(RIBBON_HALF_DEG, nav.turn))
                  return (
                    <div className={`lr-target ${off ? 'lr-target-edge' : ''}`} style={{ left: `calc(50% + ${clamped * PX_PER_DEG}px)` }}>
                      {off ? (nav.turn < 0 ? '‹' : '›') : '▾'}
                    </div>
                  )
                })()}
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
      <div className="lr-controls">
        <button className="lr-ctl" onClick={onOpenInstruments}
          title="Full-screen instruments — compass, speed, elevation">
          <Maximize size={13} />
          <span>Full screen</span>
        </button>
        <button
          className={`lr-ctl ${keepAwake && wakeLock?.supported !== false ? 'active' : ''}`}
          onClick={onToggleKeepAwake}
          disabled={wakeLock?.supported === false}
          title={wakeLock?.supported === false
            ? "This browser can't hold the screen on — it needs iOS 16.4 or a recent desktop browser"
            : keepAwake
              ? 'Screen is being kept on — tap to let it sleep normally'
              : 'Keep the screen on while the map is up'}>
          <Eye size={13} />
          <span>Stay awake</span>
        </button>
      </div>
    </div>
  )
}
