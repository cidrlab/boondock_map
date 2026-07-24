import { useState } from 'react'
import { X } from './Icons'
import './Guide.css'

// User guide. Standing rule (CLAUDE.md): when a user-facing feature changes,
// update the matching tab here in the same commit.

const TABS = [
  {
    id: 'welcome', label: 'Welcome',
    body: (
      <>
        <p><strong>Boondock Map</strong> is a free, open-source map for dispersed
        camping — finding legal forest roads, likely boondocking areas, and
        campsites, then getting there with your own notes on board. No account,
        no tracking: everything you save lives on your device.</p>
        <p>The basic loop:</p>
        <ol>
          <li><strong>Scout</strong> — turn on the layers you care about (MVUM
          roads, boondock zones, sites) and explore an area.</li>
          <li><strong>Mark</strong> — click the map or a search result and save
          waypoints for spots worth trying.</li>
          <li><strong>Pack</strong> — download offline maps for the area before
          you lose signal.</li>
          <li><strong>Go</strong> — navigate out with the Directions links, then
          record what you found: been there, camped, ratings, labels.</li>
        </ol>
        <p>Flip through the tabs above for each part of the app. The
        <strong> ?</strong> button beside the book in the top bar is the map
        legend — what every color and symbol means.</p>
      </>
    ),
  },
  {
    id: 'map', label: 'Map',
    body: (
      <>
        <p><strong>Basemaps</strong> (Layers tab): <em>Boondock</em> — our own
        terrain-shaded night map; <em>Boondock Day</em> — the same map in
        daylight colors; <em>Satellite</em> — aerial imagery for scouting
        clearings and road surfaces (zooming in very close scales the last
        available imagery, so remote areas go soft instead of blank).</p>
        <p><strong>Reading the map:</strong></p>
        <ul>
          <li>Move the mouse and the bottom bar shows the cursor&apos;s
          coordinates and elevation; the zoom level sits bottom-right.</li>
          <li><strong>Click anywhere</strong> to get an info card — coordinates,
          elevation, and what&apos;s there — with a <em>Save waypoint</em>
          button and a <em>Copy coords</em> button for pasting the spot into
          any other app. Click the same spot again to dismiss it.</li>
          <li>Every point card (map clicks, sites, waypoints, roads, trails,
          search results) also carries a <strong>weather card</strong>: current
          conditions, an 8-day forecast strip (tap a day for detail), and the
          days-9–16 outlook. Forecasts are Open-Meteo model data — mountain
          microclimates can differ, so treat them as planning guidance.</li>
          <li>Click an <strong>MVUM road</strong> (zoomed in past ~z9) for its
          route name and vehicle class; click a <strong>trail</strong> (past
          ~z10) to see whether it&apos;s hiking or motorized, plus surface
          info.</li>
          <li>Zoom buttons and the locate-me button are on the right edge.</li>
          <li><strong>Record</strong> (top bar) starts a GPS track: your path
          draws on the map as you move, and <em>Stop</em> names and saves it
          to the Tracks tab. Tracks ride along in GPX export.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'layers', label: 'Layers',
    body: (
      <>
        <p>Overlays stack on the basemap. Each appears from a sensible zoom so
        the map stays clean when zoomed out:</p>
        <ul>
          <li><strong>MVUM roads</strong> — the Forest Service Motor Vehicle Use
          Map: the legal motorized routes, drawn in the official USFS colors
          (see the legend for classes).</li>
          <li><strong>Hiking trails</strong> — dashed light-blue lines from the
          USFS trails system.</li>
          <li><strong>Topo lines</strong> — contours only, no background.
          A light terrain texture appears from about z9, index lines from z10,
          and 50–100&nbsp;ft detail fills in as you zoom closer.</li>
          <li><strong>Sites</strong> — the campsite database: green campsites,
          purple RV parks, orange dump stations, blue water fills, pink
          trailheads. Numbered circles are clusters — click to zoom in. Click
          any dot for details, its data source, and directions —
          <em> Save as waypoint</em> opens the usual waypoint dialog with the
          site&apos;s name filled in, ready to edit. The
          <em> Site Filter</em> checkboxes below the overlays choose which
          types show (<em>All</em> resets), and the elevation sliders under
          them bound the sites by height. Coverage: all 50 states — each
          state&apos;s sites and zones download the first time you view it
          (zoom in past about z5), so visit an area once while online if you
          plan to browse it offline later.</li>
          <li><strong>Boondock zones</strong> — dashed green polygons marking
          Forest Service land within reach of an MVUM road: places where
          dispersed camping is <em>likely</em> allowed. Each shows how much of
          it is reasonably flat. It&apos;s a computed hint, not a promise —
          always confirm district rules and closures.</li>
          <li><strong>Temperature Filter</strong> (bottom of the Layers tab) —
          find where the weather will suit you. Pick a window (next 7–16
          days), then set any of: <em>no day hotter than</em>, <em>no night
          colder than</em>, or an <em>average temperature</em> range. A dashed
          blue area shades everywhere in view whose forecast fits all your
          limits, and site dots outside it are hidden. Pan the map and it
          re-checks the new area; drag the temperature sliders and the shape
          updates instantly. Slide a limit to its end (“Any”) to drop it, or
          hit <em>Clear</em>.</li>
          <li><strong>Names</strong> — extra town and place labels.</li>
          <li><strong>Public land</strong> — land-ownership tint: green Forest
          Service, blue state land, and other agencies per the legend.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'find', label: 'Find',
    body: (
      <>
        <p>The <strong>Points tab</strong> is the search home:</p>
        <ul>
          <li>The search box takes place names, your waypoint names, or raw
          coordinates (like <code>48.5, -121.9</code>).</li>
          <li>The chips below it (Gas, Water, Camp, Dump/RV…) find what&apos;s
          near the map center. Results are numbered in the list <em>and</em> on
          the map; hovering one highlights the other.</li>
          <li>Pan away and a <strong>Search this area</strong> pill appears up
          top to re-run the search where you&apos;re looking.</li>
          <li><strong>Site Filter</strong> (Layers tab): type checkboxes plus
          Min / Max elevation sliders filter the site dots — handy for staying
          below snow line, or showing only water and dump stations on a supply
          run. The <strong>Temperature Filter</strong> below it goes further:
          it hides sites whose 7–16-day forecast breaks your heat, cold, or
          average-temperature limits, and shades the areas that qualify.</li>
          <li>Every result card names its <strong>data source</strong> with a
          confidence hint, and has <strong>Directions</strong> links (Apple or
          Google Maps) plus <strong>Copy coords</strong> to take the location
          anywhere else.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'waypoints', label: 'Waypoints',
    body: (
      <>
        <p><strong>Saving:</strong> click the map (or a search result) →
        <em> Save waypoint</em>. Pick an icon type, name it, and optionally set
        everything else right there: visit status, favorite, labels, pin color,
        notes.</p>
        <p><strong>Visit status</strong> shows as a small badge on the pin:
        green <em>Been &amp; stayed</em>, orange <em>Been, not camped</em>,
        red <em>Explore</em> (want to go), or none. <strong>Favorite</strong>
        turns the badge into a circled star.</p>
        <p><strong>Labels</strong> are your own quick tags (“view”, “shady”,
        “rough road”). Once used, they become one-tap checkmarks on every
        save/edit form — and filter chips above the waypoint list.</p>
        <p><strong>On the map:</strong> click a pin for its popup — status,
        labels, ratings, elevation, <em>Directions</em>, <em>Edit</em>, and
        <em>Delete</em> (tap twice to confirm).</p>
        <p><strong>In the list:</strong> the pencil opens the full editor,
        which adds ★ ratings for Quiet, Cleanliness, and Accessibility, plus a
        trashcan to delete. Elevation attaches automatically to every save.</p>
      </>
    ),
  },
  {
    id: 'offline', label: 'Offline',
    body: (
      <>
        <p>The <strong>Offline tab</strong> manages map packs — tiles stored on
        your device so the map works with zero signal.</p>
        <ul>
          <li>Frame the area you want on screen, open Offline →
          <em> Download</em>, pick the layer and zoom depth, and it saves to
          the device. Bigger zoom depth = more detail = more storage.</li>
          <li>Downloadable today: <strong>USGS Topo</strong> and
          <strong> BLM land status</strong>. Offline packs for the Boondock
          basemap and satellite are on the roadmap.</li>
          <li>Downloaded areas are outlined on the map while you&apos;re in the
          Offline tab; the tab lists each pack with its size, and you can
          delete packs anytime.</li>
          <li>Your waypoints, tracks, and settings are always offline — they
          never leave the device to begin with.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'phone', label: 'Phone',
    body: (
      <>
        <p><strong>Install on iPhone:</strong> open the app&apos;s web address
        in Safari → Share button → <em>Add to Home Screen</em>. It installs
        like an app, full screen, and keeps working offline for anything
        you&apos;ve downloaded.</p>
        <p><strong>Moving waypoints between devices</strong> uses GPX files —
        the universal waypoint format (Gaia, Garmin, etc. all read it):</p>
        <ol>
          <li>On the source device: toolbar <strong>share icon → Export
          GPX</strong>. That saves one file with all waypoints and tracks.</li>
          <li>Get the file to the other device — AirDrop, iCloud Drive, or
          email to yourself.</li>
          <li>On the destination: toolbar <strong>folder icon → Import
          GPX</strong> and pick the file.</li>
        </ol>
        <p>GPX carries names, notes, coordinates, elevation, icon, status, and
        favorites. Labels, star ratings, and custom pin colors stay on the
        original device for now — automatic sync between devices is on the
        roadmap.</p>
      </>
    ),
  },
  {
    id: 'credits', label: 'Credits',
    body: (
      <>
        <p>Boondock Map is GPL-3.0 open source, built on open data. Every
        search result and site names its source on the card; the big ones:</p>
        <ul>
          <li><strong>OpenStreetMap</strong> contributors — basemap data and
          community-mapped sites (ODbL).</li>
          <li><strong>OpenFreeMap / OpenMapTiles</strong> — vector basemap
          tiles.</li>
          <li><strong>USGS &amp; Mapzen terrain</strong> (via AWS) — elevation
          and hillshading; USGS topo maps.</li>
          <li><strong>US Forest Service</strong> — MVUM roads, trails, land
          ownership (public domain).</li>
          <li><strong>BLM</strong> — land status (public domain).</li>
          <li><strong>Recreation.gov RIDB</strong> — federal campgrounds
          (CC-BY-4.0).</li>
          <li><strong>WA DNR</strong> — state recreation sites.</li>
          <li><strong>Overture Maps</strong> — additional places data.</li>
          <li><strong>Open-Meteo</strong> — weather forecasts on point cards
          and behind the temperature filter (CC-BY 4.0).</li>
        </ul>
        <p>Feature ideas from the late, great FreeRoam app. Full license detail
        lives in <code>data/ATTRIBUTION.md</code> in the repository.</p>
      </>
    ),
  },
]

export default function Guide({ open, onClose }) {
  const [tab, setTab] = useState('welcome')
  const active = TABS.find(t => t.id === tab) || TABS[0]

  return (
    <div className="guide-root">
      {open && (
        <div className="guide-panel">
          <div className="guide-hdr">
            <span>Using Boondock Map</span>
            <button className="btn-ghost" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          </div>
          <div className="guide-tabs">
            {TABS.map(t => (
              <button
                key={t.id}
                className={`guide-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >{t.label}</button>
            ))}
          </div>
          <div className="guide-body">{active.body}</div>
        </div>
      )}
    </div>
  )
}
