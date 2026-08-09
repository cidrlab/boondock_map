import { useState, useEffect } from 'react'
import { communityEnabled } from '../../shared/community'
import { SITE_KINDS } from '../../shared/layers'
import { siteBadgeSvg } from '../../shared/siteIcons'
import './Legend.css'

// Swatches come from each service's own legend endpoint, so what the legend
// shows is literally what the map draws — no hand-copied hex values to drift.
const MVUM_LEGEND = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/legend?f=json'

// "Couldn't load" is not the same as "you're offline" — saying the wrong one
// sends people to check their signal when the provider is down (VISION row 87)
const failReason = () =>
  navigator.onLine === false ? 'offline' : 'unavailable'

const swatch = (it) => `data:${it.contentType};base64,${it.imageData}`

let mvumLegendPromise = null
function fetchMvumLegend() {
  if (!mvumLegendPromise) {
    mvumLegendPromise = fetch(MVUM_LEGEND)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(d => {
        const pick = (layerId, take) =>
          (d.layers?.find(l => l.layerId === layerId)?.legend || [])
            .filter(it => it.label)
            .slice(0, take)
            .map(it => ({ label: it.label, src: swatch(it) }))
        return { roads: pick(1, 4), trails: pick(2, 3), failed: false }
      })
      .catch(() => ({ roads: [], trails: [], failed: failReason() }))
  }
  return mvumLegendPromise
}

// BLM surface-management palette, taken from the renderer of
// lands/BLM_Natl_SMA_LimitedScale (sibling of the cached tile service the map
// draws, same symbology standard), read 2026-07-25. Hardcoded on purpose: the
// legend has to work offline, and the cached service's own /legend endpoint
// returns fully transparent swatch images, so there is nothing to fetch.
// Cross-check: USFS #cceac6 and State #b3e3ef match the two values this legend
// already carried, which is what confirms it's the right palette.
// Ordered by what a boondocker cares about, not BLM's layer order.
const SMA_AGENCIES = [
  ['#fee679', 'Bureau of Land Management (BLM)'],
  ['#cceac6', 'US Forest Service (USFS)'],
  ['#b3e3ef', 'State'],
  ['#cabddc', 'National Park Service (NPS)'],
  ['#7fcca7', 'US Fish & Wildlife (USFWS)'],
  ['#ffffb3', 'Bureau of Reclamation (USBR)'],
  ['#fdb46c', 'Bureau of Indian Affairs (BIA)'],
  ['#fbb4ce', 'Department of Defense (DOD)'],
  ['#e4c49f', 'Other federal'],
  ['#8fb5be', 'Local government'],
  ['#895a44', 'Alaska Native allotment'],
  ['#cf8c4b', 'Alaska Native lands'],
  ['#ffffff', 'Private or unknown'],
]

// Site rows draw the real badge from shared/siteIcons.js, so the legend can
// only ever show what the map actually draws. Labels are spelled out here —
// SITE_KINDS' short chip labels ("Dump", "Water") are too terse for a legend.
const SITE_LABELS = { dump: 'Dump station', water: 'Water fill' }
const siteLabel = (k) => SITE_LABELS[k.id] || k.label

// 18px badge — the width the cluster bubble and area swatches already use
const badge = (kind, opts) => ({ __html: siteBadgeSvg(kind, 18, opts) })

export default function Legend({ open, onClose }) {
  const [mvum, setMvum] = useState(null)

  useEffect(() => {
    if (open && !mvum) fetchMvumLegend().then(setMvum)
  }, [open, mvum])

  return (
    <div className="legend-root">
      {open && (
        <div className="legend-panel">
          <div className="legend-hdr">
            Legend
            <button className="btn-ghost" onClick={onClose} title="Close" style={{ padding: 2 }}>×</button>
          </div>

          <div className="legend-section">Sites</div>
          {SITE_KINDS.map(k => (
            <div className="legend-row" key={k.id}>
              <span className="legend-badge" dangerouslySetInnerHTML={badge(k.id)} />{siteLabel(k)}
            </div>
          ))}
          <div className="legend-note">
            Each site is a circle ringed in its type&apos;s color, with that
            type&apos;s logo inside from about z10.5 — zoomed further out they
            stay plain colored dots.
          </div>
          <div className="legend-row">
            <span className="legend-cluster">7</span>Several sites — tap to zoom in
          </div>
          {communityEnabled() && (
            <div className="legend-row">
              <span className="legend-badge" dangerouslySetInnerHTML={badge('campsite', { ring: '#fbbf24' })} />
              Amber ring — community-reported
            </div>
          )}

          <div className="legend-section">Waypoint badges</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#22c55e' }} />Been &amp; stayed</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#fb923c' }} />Been, not camped</div>
          <div className="legend-row"><span className="legend-dot" style={{ background: '#F9322B' }} />Want to explore</div>
          <div className="legend-row">
            <span style={{
              width: 14, height: 14, borderRadius: '50%', background: '#10151c',
              border: '1px solid #e8eef4', color: '#e8eef4', fontSize: 9,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>★</span>
            Favorite — circled star, status color
          </div>

          <div className="legend-section">Areas</div>
          <div className="legend-row"><span className="legend-swatch legend-wildfire" />Active wildfire (NIFC, live)</div>
          <div className="legend-row"><span className="legend-swatch legend-zone" />Boondock Zone β — USFS land near a legal MVUM road</div>
          <div className="legend-row"><span className="legend-swatch legend-temp" />Temperature filter — forecast fits your limits here</div>
          <div className="legend-row"><span className="legend-swatch legend-pack" />Offline map pack you've downloaded</div>

          <div className="legend-section">Public Land — who manages it</div>
          {SMA_AGENCIES.map(([c, label]) => (
            <div className="legend-row" key={label}>
              <span className="legend-swatch legend-swatch-land" style={{ background: c }} />{label}
            </div>
          ))}
          <div className="legend-note">
            Dispersed camping is usually allowed on BLM and Forest Service land
            and usually isn&apos;t elsewhere, but that is a rule of thumb, not a
            permission — check the managing office. <strong>Private or
            unknown</strong> is not public land.
          </div>
          <div className="legend-note">
            A checkerboard means ownership alternates section by section, common
            on old railroad-grant land: the legal square may be the one beside
            the one you&apos;re parked on.
          </div>

          <div className="legend-section">MVUM (official USFS legend)</div>
          {!mvum && <div className="legend-note">Loading…</div>}
          {mvum && [...mvum.roads, ...mvum.trails].map(it => (
            <div className="legend-row" key={it.label}>
              <img className="legend-img" src={it.src} alt="" />{it.label}
            </div>
          ))}
          {mvum && !mvum.roads.length && (
            <div className="legend-note">
              {mvum.failed === 'offline'
                ? 'Legend needs a connection.'
                : "Legend unavailable — the USFS service isn't responding."}
            </div>
          )}

          <div className="legend-section">Lines</div>
          <div className="legend-row"><span className="legend-swatch legend-trail" />Hiking trail (USFS)</div>
          <div className="legend-row"><span className="legend-swatch legend-blm-road" />BLM road — public motorized use</div>
          <div className="legend-row"><span className="legend-swatch legend-roadcore-open" />All FS road — open to some vehicle</div>
          <div className="legend-row"><span className="legend-swatch legend-roadcore-closed" />All FS road — closed to vehicles</div>
          <div className="legend-note">Topo Lines: brown USGS contours with elevation figures.</div>
        </div>
      )}
    </div>
  )
}
