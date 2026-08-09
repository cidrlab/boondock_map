import { useState, useEffect, useMemo } from 'react'
import { useLiveSensors } from '../../shared/useLiveSensors'
import { relativeTurn } from '../../shared/geo'
import { X, Settings } from './Icons'
import './FullScreenInstruments.css'

// Full-screen instrument mode (VISION row 95): a standalone handheld-compass
// screen — compass + speed + elevation (+ optional coordinates) and nothing
// else. Works in portrait and landscape. Feeds off the shared live-sensor hook
// (row 89). Per Tim: adjustable speed size, a compass-style chooser, a punch-in
// target bearing to steer toward, and an independent on/off toggle per element.

const CARD16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
]
const STYLES = [{ id: 'dial', label: 'Dial' }, { id: 'numbers', label: 'Numbers' }]
const ELEMENTS = [
  { id: 'compass', label: 'Compass' },
  { id: 'speed', label: 'Speed' },
  { id: 'elevation', label: 'Elevation' },
  { id: 'coords', label: 'Coordinates' },
]
const QUICK_BEARINGS = [['N', 0], ['E', 90], ['S', 180], ['W', 270]]
const PREF_KEY = 'boondock-instruments'

function cardinal(deg) { return CARD16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16] }

// Static compass rose: ticks every 15°, cardinal letters every 45°. Rotated as
// a whole by −heading so your direction of travel sits under the top pointer.
function useRose() {
  return useMemo(() => {
    const R = 92, C = 100
    const marks = []
    for (let d = 0; d < 360; d += 15) {
      const major = d % 45 === 0
      const a = d * Math.PI / 180
      const r1 = major ? R - 12 : R - 7
      const x1 = C + r1 * Math.sin(a), y1 = C - r1 * Math.cos(a)
      const x2 = C + R * Math.sin(a), y2 = C - R * Math.cos(a)
      marks.push(<line key={`k${d}`} x1={x1} y1={y1} x2={x2} y2={y2} className={d === 0 ? 'fi-tick-n' : major ? 'fi-tick-maj' : 'fi-tick'} />)
    }
    const letters = []
    const L = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]]
    for (const [txt, d] of L) {
      const a = d * Math.PI / 180, r = R - 26
      letters.push(
        <text key={`l${d}`} x={C + r * Math.sin(a)} y={C - r * Math.cos(a)} dy="0.35em"
          className={d === 0 ? 'fi-card fi-card-n' : 'fi-card'}>{txt}</text>
      )
    }
    return [...marks, ...letters]
  }, [])
}

export default function FullScreenInstruments({ onClose, keepAwake, wakeLock, onToggleKeepAwake }) {
  const { fix, geoState, elev, stale, heading, headingSrc, magState, magQuiet, requestCompass, mph } = useLiveSensors()
  const rose = useRose()

  const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {} } catch { return {} } }, [])
  const [show, setShow] = useState(() => ({ compass: true, speed: true, elevation: true, coords: false, ...(saved.show || {}) }))
  const [style, setStyle] = useState(saved.style || 'dial')
  const [speedScale, setSpeedScale] = useState(saved.speedScale || 1)
  const [target, setTarget] = useState(saved.target ?? null)   // punched-in bearing, 0..359 or null
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ show, style, speedScale, target })) } catch { /* private mode */ }
  }, [show, style, speedScale, target])

  // Escape exits full-screen
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { panel ? setPanel(false) : onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, panel])

  const turn = (target != null && heading != null) ? relativeTurn(heading, target) : null
  const turnHint = turn == null ? null : Math.abs(turn) < 8 ? 'on course' : `${Math.round(Math.abs(turn))}° ${turn < 0 ? 'left' : 'right'}`

  const noCompass = heading == null
  const compassMsg = magState === 'denied'
    ? 'Compass access is off'
    : magState === 'granted' && !magQuiet ? 'Reading compass…'
      : 'No compass here — shows GPS course once moving'

  return (
    <div className="fi-root" role="dialog" aria-label="Full-screen instruments">
      <div className="fi-topbar">
        <button className="fi-icon-btn" onClick={onClose} aria-label="Exit full screen" title="Exit"><X size={18} /></button>
        <span className="fi-title">Instruments</span>
        <button className={`fi-icon-btn ${panel ? 'active' : ''}`} onClick={() => setPanel(p => !p)} aria-label="Instrument settings" title="Settings"><Settings size={17} /></button>
      </div>

      {!fix && !show.compass ? null : null}

      <div className={`fi-stage ${stale ? 'fi-stale' : ''}`}>
        {show.compass && (
          <div className="fi-compass">
            {noCompass && magState === 'needs-permission' ? (
              <button className="fi-enable" onClick={requestCompass}>Enable compass</button>
            ) : noCompass ? (
              <div className="fi-nocompass">{compassMsg}</div>
            ) : style === 'numbers' ? (
              <div className="fi-numbers">
                <div className="fi-num-deg">{Math.round(heading)}<span className="fi-num-unit">°</span></div>
                <div className="fi-num-card">{cardinal(heading)}<span className="fi-src">{headingSrc}</span></div>
              </div>
            ) : (
              <svg className="fi-dial" viewBox="0 0 200 200">
                <circle cx="100" cy="100" r="96" className="fi-dial-face" />
                <g transform={`rotate(${-heading} 100 100)`}>
                  {rose}
                  {target != null && (
                    <g transform={`rotate(${target} 100 100)`}>
                      <polygon points="100,8 95,20 105,20" className="fi-target-mark" />
                    </g>
                  )}
                </g>
                <polygon points="100,2 92,20 108,20" className="fi-pointer" />
                <text x="100" y="98" className="fi-dial-deg">{Math.round(heading)}°</text>
                <text x="100" y="120" className="fi-dial-card">{cardinal(heading)}</text>
                <text x="100" y="136" className="fi-dial-src">{headingSrc}</text>
              </svg>
            )}
            {target != null && !noCompass && (
              <div className="fi-turn">
                <span className="fi-turn-b">{Math.round(target)}° {cardinal(target)}</span>
                <span className="fi-turn-h">{turnHint}</span>
              </div>
            )}
          </div>
        )}

        <div className="fi-readouts">
          {show.speed && (
            <div className="fi-readout">
              <span className="fi-r-label">Speed</span>
              <span className="fi-r-value fi-fix" style={{ fontSize: `${2.4 * speedScale}rem` }}>
                {mph == null ? '—' : mph}<span className="fi-r-unit">mph</span>
              </span>
            </div>
          )}
          {show.elevation && (
            <div className="fi-readout">
              <span className="fi-r-label">Elevation</span>
              <span className="fi-r-value fi-fix">
                {elev ? elev.ft.toLocaleString() : '—'}<span className="fi-r-unit">ft{elev?.src === 'gps' ? ' gps' : ''}</span>
              </span>
            </div>
          )}
          {show.coords && (
            <div className="fi-readout">
              <span className="fi-r-label">Coordinates</span>
              <span className="fi-r-coords fi-fix">
                {fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)}` : '—'}
              </span>
            </div>
          )}
        </div>

        {!fix && (
          <div className="fi-gps-note">
            {geoState === 'denied' ? 'Location blocked — allow it for this site'
              : geoState === 'unavailable' ? 'GPS unavailable on this device' : 'Finding GPS…'}
          </div>
        )}
      </div>

      {panel && (
        <div className="fi-panel" onClick={e => e.stopPropagation()}>
          <div className="fi-panel-sec">
            <div className="fi-panel-hdr">Show</div>
            <div className="fi-chips">
              {ELEMENTS.map(el => (
                <button key={el.id} className={`fi-chip ${show[el.id] ? 'on' : ''}`}
                  onClick={() => setShow(s => ({ ...s, [el.id]: !s[el.id] }))}>{el.label}</button>
              ))}
            </div>
          </div>
          <div className="fi-panel-sec">
            <div className="fi-panel-hdr">Compass style</div>
            <div className="fi-chips">
              {STYLES.map(st => (
                <button key={st.id} className={`fi-chip ${style === st.id ? 'on' : ''}`} onClick={() => setStyle(st.id)}>{st.label}</button>
              ))}
            </div>
          </div>
          <div className="fi-panel-sec">
            <div className="fi-panel-hdr">Speed size</div>
            <input type="range" min="0.7" max="2" step="0.1" value={speedScale}
              onChange={e => setSpeedScale(+e.target.value)} className="fi-range" />
          </div>
          <div className="fi-panel-sec">
            <div className="fi-panel-hdr">Screen</div>
            <div className="fi-chips">
              <button
                className={`fi-chip ${keepAwake && wakeLock?.supported !== false ? 'on' : ''}`}
                onClick={onToggleKeepAwake}
                disabled={wakeLock?.supported === false}
              >Stay awake</button>
            </div>
            {wakeLock?.supported === false && (
              <div className="fi-panel-note">
                This browser can&apos;t hold the screen on — it needs iOS&nbsp;16.4
                or a recent desktop browser.
              </div>
            )}
          </div>
          <div className="fi-panel-sec">
            <div className="fi-panel-hdr">Steer toward a bearing</div>
            <div className="fi-chips">
              {QUICK_BEARINGS.map(([lbl, deg]) => (
                <button key={lbl} className={`fi-chip ${target === deg ? 'on' : ''}`} onClick={() => setTarget(deg)}>{lbl}</button>
              ))}
              <input className="fi-bearing" type="number" min="0" max="359" placeholder="°"
                value={target ?? ''} onChange={e => {
                  const v = e.target.value
                  setTarget(v === '' ? null : Math.max(0, Math.min(359, Math.round(+v))))
                }} />
              {target != null && <button className="fi-chip" onClick={() => setTarget(null)}>Clear</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
