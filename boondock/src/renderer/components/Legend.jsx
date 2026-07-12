import { useState, useEffect } from 'react'
import './Legend.css'

// Official MVUM swatches come from the service's own legend endpoint
const MVUM_LEGEND = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/legend?f=json'
let mvumLegendPromise = null
function fetchMvumLegend() {
  if (!mvumLegendPromise) {
    mvumLegendPromise = fetch(MVUM_LEGEND)
      .then(r => r.json())
      .then(d => {
        const pick = (layerId, take) =>
          (d.layers?.find(l => l.layerId === layerId)?.legend || [])
            .filter(it => it.label)
            .slice(0, take)
            .map(it => ({ label: it.label, src: `data:${it.contentType};base64,${it.imageData}` }))
        return { roads: pick(1, 4), trails: pick(2, 3) }
      })
      .catch(() => ({ roads: [], trails: [] }))
  }
  return mvumLegendPromise
}

const SITE_DOTS = [
  ['#22c55e', 'Campsite'],
  ['#a78bfa', 'RV park'],
  ['#fb923c', 'Dump station'],
  ['#38bdf8', 'Water fill'],
  ['#2dd4bf', 'Trailhead'],
]

export default function Legend() {
  const [open, setOpen] = useState(false)
  const [mvum, setMvum] = useState(null)

  useEffect(() => {
    if (open && !mvum) fetchMvumLegend().then(setMvum)
  }, [open, mvum])

  return (
    <div className="legend-root">
      <button className="legend-toggle" onClick={() => setOpen(o => !o)} title="Map legend">
        {open ? '×' : '?'}
      </button>

      {open && (
        <div className="legend-panel">
          <div className="legend-hdr">Legend</div>

          <div className="legend-section">Sites</div>
          {SITE_DOTS.map(([c, label]) => (
            <div className="legend-row" key={label}>
              <span className="legend-dot" style={{ background: c }} />{label}
            </div>
          ))}
          <div className="legend-row">
            <span className="legend-cluster">7</span>Several sites — tap to zoom in
          </div>

          <div className="legend-section">Waypoint badges</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#22c55e' }} />Been &amp; stayed</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#fb923c' }} />Been, not camped</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#F9322B' }} />Want to explore</div>
          <div className="legend-row"><span style={{ color: '#e8eef4', fontSize: 13 }}>★</span>Favorite — same colors, star shape</div>

          <div className="legend-section">Areas</div>
          <div className="legend-row"><span className="legend-swatch legend-zone" />Boondock Zone β — USFS land near a legal MVUM road</div>
          <div className="legend-row"><span className="legend-swatch legend-pack" />Offline map pack you've downloaded</div>

          <div className="legend-section">Public Land tints</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#cceac6' }} />National Forest (USFS)</div>
          <div className="legend-row"><span className="legend-swatch" style={{ background: '#b3e3ef' }} />State-managed (e.g. WA DNR)</div>
          <div className="legend-note">Other tints follow BLM's official land-status palette.</div>

          <div className="legend-section">MVUM (official USFS legend)</div>
          {!mvum && <div className="legend-note">Loading…</div>}
          {mvum && [...mvum.roads, ...mvum.trails].map(it => (
            <div className="legend-row" key={it.label}>
              <img className="legend-img" src={it.src} alt="" />{it.label}
            </div>
          ))}
          {mvum && !mvum.roads.length && <div className="legend-note">Legend unavailable offline.</div>}

          <div className="legend-section">Lines</div>
          <div className="legend-row"><span className="legend-swatch legend-trail" />Hiking trail (USFS)</div>
          <div className="legend-note">Topo Lines: brown USGS contours with elevation figures.</div>
        </div>
      )}
    </div>
  )
}
