import { communityEnabled } from '../../shared/community'
import { SITE_KINDS } from '../../shared/layers'
import { siteBadgeSvg } from '../../shared/siteIcons'
import './Legend.css'

// The MVUM rows used to be swatch images fetched from the service's /legend
// endpoint. Since row 83 the map draws MVUM from our own vector tiles in our
// own palette, so that legend described someone else's symbology — and it went
// blank whenever the USFS host did. The rows are now plain CSS swatches in
// Legend.css, matching the paint in Map.jsx, and they work offline.

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

          <div className="legend-section">MVUM — who may drive it</div>
          <div className="legend-row"><span className="legend-swatch legend-mvum-all" />Open to all vehicles, including OHVs</div>
          <div className="legend-row"><span className="legend-swatch legend-mvum-highway" />Highway-legal vehicles only</div>
          <div className="legend-row"><span className="legend-swatch legend-mvum-special" />Special designation — read the forest&apos;s own map</div>
          <div className="legend-row"><span className="legend-swatch legend-mvum-all-seasonal" />Dashed: open seasonally, not year-round</div>
          <div className="legend-row"><span className="legend-swatch legend-mvum-trail" />Dotted, thinner: motorized trail, not a road</div>
          <div className="legend-note">
            Tap any route for the vehicle classes and dates USFS published for
            it. That is a record of what was legal, not permission for today —
            closure orders, gates and washouts all outrank it.
          </div>

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
