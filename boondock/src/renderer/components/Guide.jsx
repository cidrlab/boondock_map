import { useState } from 'react'
import { X } from './Icons'
import { communityEnabled } from '../../shared/community'
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
        <p><strong>Don&apos;t take our word for the privacy part.</strong> The
        whole app is open source under GPL-3.0, so you can read exactly what it
        does and what it never sends anywhere:
        <a href="https://github.com/cidrlab/boondock_map" target="_blank" rel="noreferrer"> github.com/cidrlab/boondock_map</a>.</p>
        {communityEnabled() && (
        <p><strong>Found a bug, or want something?</strong> The speech-bubble
        button in the top bar sends feedback straight to the project&apos;s
        issue tracker. No account, no sign-up: say what happened and it gets
        read. Leave an email only if you want a reply.</p>
        )}
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
        <p><strong>Appearance</strong> (Layers tab, under Base Map) sets the
        look of the app itself, not the map:</p>
        <ul>
          <li><strong>Auto</strong> follows the basemap — pick Boondock Day and
          the sidebar, toolbar, and cards go light with it.</li>
          <li><strong>Dark</strong> or <strong>Light</strong> pin it either way
          regardless of the map.</li>
          <li><strong>Night Red</strong> is for real darkness: the whole
          interface drops to dim red and the map itself is tinted red, because
          red light at low brightness doesn&apos;t wreck your night vision the
          way a bright screen does. The trade is color: the map and the site
          badges go red, so color stops telling a campsite from a water fill
          until you switch back. The <em>logo</em> inside each site circle
          still does, once you&apos;re zoomed in past about z10.5. Your own
          saved waypoint pins keep their colors.</li>
        </ul>
        <p><strong>Reading the map:</strong></p>
        <ul>
          <li><strong>Map info</strong> — the bottom strip <em>starts
          closed</em>, so the map gets the room. Tap <em>Map info</em> at the
          bottom-right to open it: the cursor&apos;s coordinates and elevation,
          plus the zoom level. Tap the caret again to put it away. It opens
          closed again next launch. Track recording shows there either
          way.</li>
          <li><strong>Click anywhere</strong> to get an info card — coordinates,
          elevation, and what&apos;s there — with a <em>Save waypoint</em>
          button and a <em>Copy coords</em> button for pasting the spot into
          any other app. Click the same spot again to dismiss it.</li>
          <li>Every point card (map clicks, sites, waypoints, roads, trails,
          search results) also carries a <strong>weather card</strong>: current
          conditions, an 8-day forecast strip (tap a day for detail), the
          days-9–16 outlook, and an <strong>air &amp; smoke</strong> line —
          current US AQI and PM2.5, with a second line when the air is forecast
          to get categorically worse in the next few days, which is the version
          of the question that matters when you&apos;re picking a campsite for
          Friday. Forecasts are Open-Meteo model data — mountain
          microclimates can differ, so treat them as planning guidance.</li>
          <li>Click an <strong>MVUM road</strong> (zoomed in past ~z9) for its
          name, the vehicle classes it&apos;s open to, the season, surface and
          length; click a <strong>trail</strong> (past ~z10) to see whether
          it&apos;s hiking or motorized, plus its class and surface. Both
          answer instantly, with no round-trip to an agency server.</li>
          <li>Zoom buttons and the locate-me button are on the right edge, with
          an <strong>add-pin button</strong> that drops a waypoint at your
          location or a point you tap (see the Waypoints tab).</li>
          <li><strong>Live readout</strong> — the gauge button (right edge,
          under the locate button) opens an instrument strip at the top of
          the map: a
          compass ribbon with your heading, plus live speed and elevation.
          Heading is magnetic (<em>mag</em>) while you&apos;re still and
          switches to your GPS direction of travel (<em>gps</em>, true north)
          once you&apos;re moving. Elevation comes from the map&apos;s terrain
          data, or straight from GPS (marked <em>gps</em>) when you&apos;re
          offline. Tap the gauge again to put it away. The sensors need a
          phone — on a desktop the strip shows elevation only. Two buttons sit
          at the foot of it: <em>Full screen</em> for the instrument screen
          below, and <em>Stay awake</em>.</li>
          <li><strong>Stay awake</strong> — the second button under the compass
          holds the screen on, so the map and gauge stay in front of you
          instead of the phone going dark mid-drive. It survives locking and
          unlocking the phone, and the setting is remembered. The same switch
          is in the full-screen gear panel. It needs iOS&nbsp;16.4 or a recent
          desktop browser; where the browser can&apos;t do it the button is
          greyed out and says so rather than pretending.</li>
          <li><strong>Guide me here</strong> — every point card (waypoints,
          sites, search results, map clicks) has a green <em>Guide me here</em>
          button. Tap it and the app draws a straight line to that spot, shows
          the live distance, and puts a green marker on the compass ribbon so
          you know which way to turn. It&apos;s a <strong>beeline</strong>, as
          the crow flies, not turn-by-turn road directions — the honest simple
          version. Close the readout (or its ×) to stop.</li>
          <li><strong>Full-screen instruments</strong> — the <em>Full
          screen</em> button under the live readout (open the gauge first) is
          where this lives now, next to the compass it enlarges rather than
          across the app in the top bar. It opens a standalone compass, speed,
          and elevation screen,
          like a handheld compass, in portrait or landscape. Its gear lets you
          turn each readout on or off, switch the compass between a dial and big
          numbers, size the speed, keep the screen awake, and punch in a
          bearing to steer toward.</li>
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
          Map: the routes you may legally drive, and in what. Self-hosted, so
          it doesn&apos;t depend on the Forest Service&apos;s servers being
          up. Colour answers the question the MVUM
          exists to answer — amber is open to all vehicles including OHVs,
          green is highway-legal vehicles only, violet is a special designation
          you should read the forest&apos;s own map for. A dashed line means the
          permission is seasonal, and thinner dotted amber is a motorized trail
          rather than a road. Tap any route for its vehicle classes and dates.
          One caveat worth knowing: USFS&apos;s bulk file carries geometry for
          only about a quarter of the motorized trails its live service draws,
          so with a connection the map fills the rest in from that service, and
          offline you see the ones we could pre-load.</li>
          <li><strong>BLM roads</strong> — the drive-able road network on BLM
          land, mostly across the West, where a lot of dispersed camping
          happens. Burnt-orange lines for roads open to public motorized use
          (solid) and limited public use (dashed); tap one for its name and
          designation. Off by default, so switch it on in the Overlays. This
          one is still drawn live from BLM&apos;s server, so it needs a
          connection.</li>
          <li><strong>All FS roads</strong> — every Forest Service road
          (RoadCore), served from our own vector tiles rather than an agency
          server. It&apos;s the
          full network, well beyond MVUM&apos;s legal-motorized subset: khaki
          solid where a road is open to some vehicle, faded grey dashes where
          it&apos;s closed. A road appearing here is <strong>not</strong>
          permission to drive it, so cross-check the MVUM and local rules. Off
          by default.</li>
          <li><strong>Hiking trails</strong> — dashed light-blue lines from the
          USFS trails system, served from our own vector tiles too.
          Tap one for who it&apos;s managed for (hiking, stock, bike,
          motorcycle, ATV, 4WD), its class and surface.</li>
          <li><strong>Names &amp; labels</strong> — place names over Satellite,
          plus <strong>highway and interstate numbers</strong> (I-5, US 97, 99W)
          that the imagery layer doesn&apos;t carry on its own. The Boondock
          basemaps show those route numbers all the time, no overlay
          needed.</li>
          <li><strong>Topo lines</strong> — contours only, no background.
          A light terrain texture appears from about z9, index lines from z10,
          and 50–100&nbsp;ft detail fills in as you zoom closer.</li>
          <li><strong>Sites</strong> — the campsite database: green campsites,
          purple RV parks, orange dump stations, blue water fills, pink
          trailheads. Each site is a circle ringed in its type&apos;s color,
          and from about z10.5 the circle carries that type&apos;s logo — a
          tent, an RV, a dump arrow, a water drop, footprints — so you can read
          a spot without going by color alone. Zoomed further out they stay
          plain colored dots, too small for a logo.
          Numbered circles are clusters — click to zoom in. Click
          any dot for details, its data source, and directions —
          <em> Save as waypoint</em> opens the usual waypoint dialog with the
          site&apos;s name filled in, ready to edit. The
          <em> Site Filter</em> checkboxes below the overlays choose which
          types show (<em>All</em> resets), and the elevation sliders under
          them bound the sites by height. Coverage: all 50 states — each
          state&apos;s sites and zones download the first time you view it
          (zoom in past about z5), so visit an area once while online if you
          plan to browse it offline later.</li>
          {communityEnabled() && (
          <li><strong>Community spots</strong> — traveler-reported dumps, water
          fills, campsites, RV parks, and trailheads, drawn as site dots with
          an <em>amber ring</em>. Click empty ground and choose <em>Report a
          spot here for everyone</em> to add one: it appears on your map
          immediately and publishes to everyone after the nightly sync, marked
          <em> unverified</em> until other travelers confirm it. Every
          community card takes <strong>check-ins</strong> — <em>Still
          there</em> or <em>Gone / closed</em> with an optional comment, dated
          — and shows them newest-first. Two independent confirmations promote
          a spot to <em>verified</em>; recent “gone” check-ins add a warning;
          the card always shows when it was last confirmed, so stale info
          reads as stale. Reports are anonymous and filtered for spam;
          <em> Report a problem</em> on any community card flags it for
          review.</li>
          )}
          <li><strong>Boondock zones</strong> — dashed green polygons marking
          Forest Service land within reach of an MVUM road: places where
          dispersed camping is <em>likely</em> allowed. Each shows how much of
          it is reasonably flat. It&apos;s a computed hint, not a promise —
          always confirm district rules and closures.</li>
          <li><strong>Wildfires</strong> — current active fire perimeters across
          the US, drawn as red areas, from the National Interagency Fire Center
          and refreshed every few minutes. A <strong>safety</strong> layer: it
          loads when you switch it on, and tapping a fire shows its name, size,
          and containment. Fire moves fast, so treat it as a heads-up, always
          check official closures, and never head toward an active fire.</li>
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
          <li>Under it, <strong>Find nearby</strong> folds open into chips
          (Gas, Water, Camp, Dump/RV, Rest stop, <strong>Ranger</strong>…) that
          find what&apos;s near the map center. Results are numbered in the list
          <em>and</em> on the map; hovering one highlights the other. The block
          starts folded so it isn&apos;t eating the top of every tab, and it
          remembers how you left it — when it&apos;s folded with a search
          running, the header says which one.</li>
          <li><strong>Ranger</strong> finds ranger stations and forest offices,
          which is where you go for a fire ban, a road closure, or a permit —
          the things this map keeps telling you to verify locally.</li>
          <li>Pan away and a <strong>Search this area</strong> pill appears up
          top to re-run the search where you&apos;re looking.</li>
          <li><strong>Site Filter</strong> (Layers tab): tap a type to show
          only that one, tap more to add them, and <em>All</em> (or selecting
          every type) goes back to everything. Min / Max elevation sliders
          filter the site dots too — handy for staying below snow line, or
          showing only water and dump stations on a supply run. Set an
          elevation limit and the ground in that band <strong>shades
          violet</strong>, so you can see where the country sits even where
          there are no sites to show. The <strong>Temperature Filter</strong> below it goes further:
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
        <p><strong>The add-pin button</strong> (right edge, under the gauge) is
        the quickest way on the phone. Tap it and choose <em>At my location</em>
        to drop a pin where you&apos;re standing (it uses your GPS fix), or
        <em> Pick on the map</em> and then tap the exact spot. Either way the
        save form opens ready to name.</p>
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
        <p><strong>Moving a pin:</strong> while a waypoint is open in the editor
        its map pin pulses and can be <strong>dragged</strong> — drop it on the
        right spot and the coordinates (and elevation) update to match. Handy
        when you saved a rough spot and want to nudge it onto the actual pullout.</p>
        <ul>
          <li><strong>Share a spot you saved</strong> — open a waypoint for
          editing and tap <em>Share with the community</em>. It publishes a
          <em>copy</em>: your waypoint stays private and unchanged, and the
          shared version is public and anonymous, going live after the nightly
          sync. You still pick the type and can reword the name and notes
          before it goes.</li>
        </ul>
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
          <li><strong>MVUM roads</strong>, <strong>hiking trails</strong> and
          <strong> all FS roads</strong> come from vector tilesets we host
          ourselves, fetching only the small slice your screen covers. That
          makes them fast and immune to the Forest Service&apos;s servers going
          down — but they still need a connection today. Storing them for real
          offline use is on the roadmap, alongside packs for the Boondock
          basemap.</li>
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
        <p><strong>Compass access:</strong> the live readout&apos;s compass
        needs motion &amp; orientation access, which iPhone grants separately
        from location — the first time, tap <em>Enable compass</em> on the
        strip and allow it. Decline and the strip still shows your GPS
        direction of travel whenever you&apos;re moving.</p>
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
        <p>Boondock Map is GPL-3.0 open source, built on open data. The code
        is public — read it, check what it does with your data, file an issue,
        or fork it:
        <a href="https://github.com/cidrlab/boondock_map" target="_blank" rel="noreferrer"> github.com/cidrlab/boondock_map</a>.
        Every search result and site names its source on the card; the big
        ones:</p>
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
        <p>Feature ideas from the late, great FreeRoam app; the live
        readout&apos;s layout takes its cue from Gaia GPS. Full license detail
        lives in <code>data/ATTRIBUTION.md</code> in the repository.</p>
      </>
    ),
  },
  {
    id: 'license', label: 'License',
    body: (
      <>
        <p className="guide-warn"><strong>Read this before you rely on it.</strong> Boondock
        Map is a planning tool, not a safety system, and you use it at your own
        risk.</p>

        <p><strong>Everything on this map can be wrong.</strong> It is built
        from public datasets that are incomplete, out of date in places, and
        never checked against the ground:</p>
        <ul>
          <li><strong>Boondock Zones are a computed guess</strong>, not
          permission to camp. They mark Forest Service land near a legal road.
          They know nothing about current closures, fire restrictions, permit
          areas, private inholdings, or whether camping is allowed where
          you&apos;re standing. Confirm with the ranger district before you
          settle in.</li>
          <li><strong>Roads and trails</strong> come from published Forest
          Service data, which lags the real world. A road drawn here may be
          gated, washed out, snowed in, or gone. A road&apos;s vehicle class
          says what is <em>legal</em>, never what is <em>passable</em> in your
          rig today.</li>
          <li><strong>Sites</strong> may be closed, full, moved, or now
          charging. <strong>Community spots</strong> are unverified traveler
          reports until other travelers confirm them.</li>
          <li><strong>Weather</strong> is computer model output for a coarse
          grid cell, not a forecast for your exact spot. Mountain weather
          routinely does something else.</li>
          <li><strong>Elevation and coordinates</strong> are sampled from
          public terrain data and carry their own error.</li>
        </ul>
        <p>Carry a paper map and a real navigation backup, tell someone where
        you&apos;re going and when you&apos;ll be back, and don&apos;t let a
        phone screen be the only thing between you and a bad night. Your
        judgment in the field beats anything on this map.</p>

        <p><strong>No warranty, no liability.</strong> This app and its data
        are provided <em>as is</em>, without warranty of any kind, express or
        implied, including any warranty of merchantability, fitness for a
        particular purpose, or accuracy. To the fullest extent permitted by
        law, the authors, contributors, and CiDR Lab are not liable for any
        injury, loss, damage, or expense arising out of the use of this app or
        reliance on anything it shows you. Decisions you make in the field are
        yours.</p>

        <p><strong>The app is free software.</strong> Boondock Map is licensed
        under the <strong>GNU General Public License, version 3 or later
        (GPL-3.0-or-later)</strong>. In plain terms: you may use, copy, study,
        modify, and share it, for any purpose, at no cost, forever. If you
        distribute a modified version, it has to stay under the same license
        with its source available, so nobody can take this work, close it up,
        and start charging for it. That is the point of the choice: the apps
        this one replaces got bought, paywalled, or shut down.</p>
        <p>The source is at
        <a href="https://github.com/cidrlab/boondock_map" target="_blank" rel="noreferrer"> github.com/cidrlab/boondock_map</a>.
        The full license text ships with the app as the
        <code> LICENSE</code> file and is published at
        <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noreferrer"> gnu.org/licenses/gpl-3.0</a>.
        Sections 15 and 16 there are the formal versions of the no-warranty and
        no-liability paragraphs above.</p>

        <p><strong>The map data has its own licenses.</strong> The GPL covers
        this app&apos;s code, not the data drawn on it. OpenStreetMap and
        Overture places carry their own terms (ODbL and others), Recreation.gov
        campgrounds are CC-BY 4.0, weather is CC-BY 4.0 from Open-Meteo, and
        Forest Service and BLM layers are US public domain. Each source is
        named on the card it appears on, listed in the Credits tab, and set out
        in full in <code>data/ATTRIBUTION.md</code>. If you reuse the data,
        follow the data license, not this one.</p>

        <p>Boondock Map is free and always will be. Donations are welcome and
        never required.</p>
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
