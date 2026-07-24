# Boondock Map — Vision & Build Plan

**Lead:** Tim Thomas · **Updated:** 2026-07-11

The goal, in Tim's words: recreate the trip workflow he used across Gaia GPS +
Campendium + iOverlander — find free camping on public land, scout the
surroundings with satellite, get there on forest roads — in one free, lean,
beautiful app for desktop, web, and iPhone. The closest prior art is FreeRoam,
now abandoned; its archive is our reference (see below). Free for everyone,
GPL-licensed, donations welcome.

---

## Feature backlog

Living list — every request gets added here, nothing gets dropped.
Status: ✅ built · 🟡 partially built · ⬜ not started

### Tim's requests

| # | Feature | Status |
|---|---------|--------|
| 1 | Find free/dispersed camping (Campendium/iOverlander-style database + workflow) | 🟡 Sites layer live 2026-07-11 — WA baseline, AZ 2026-07-23 (row 57), **all 50 states 2026-07-24 (row 58, 93,908 places)**; dispersed-spot community data still open |
| 2 | Scout areas with satellite imagery around a candidate spot | ✅ ESRI satellite + hybrid layers |
| 3 | Hiking + 4x4 trails and forest roads on the map | 🟡 true MVUM overlay live 2026-07-11 (legal roads by vehicle type, z10+) + USFS/NPS trails |
| 4 | Downloadable offline basemaps | ✅ user-drawn packs render offline on desktop + web (2026-07-11); USGS Topo layer — others + prebuilt region packs pending terms checks |
| 5 | Super lean, low-resource app | 🟡 app is small, but Electron shell is heavy; PWA direction below |
| 6 | Desktop + iPhone + web (GitHub Pages) versions | 🟡 desktop + web live (2026-07-11); iPhone = install the web app from Safari (needs on-device testing) |
| 7 | Looks amazing, CiDR/ERN palette | 🟡 mobile redesign shipped 2026-07-11 (map-first bottom sheet, glass chrome, visible controls, pack footprints); desktop polish + custom basemap next |
| 8 | Free for everyone + public | ✅ GPL-3.0 added 2026-07-11 |
| 9 | Safety: weather forecasting at a spot | 🟡 forecast card built 2026-07-14 on every point popup (row 56, deployed 2026-07-15) — current conditions + 8-day strip + days-9–16 outlook, Open-Meteo. Still open for "safety": NWS watches/warnings/alerts |
| 10 | Safety: road conditions / road types (washboard, clearance, mud) | ⬜ |
| 11 | Nearby points of interest to hike to | 🟡 Overpass POI search exists (trailheads, viewpoints, water…) |
| 12 | Community layer to store/share spot info | ⬜ |
| 13 | Rig/setup profile (RV, tent, overlander…) → "can my rig get there?" | ⬜ |
| 14 | Navigate to a spot via Google Maps / Apple Maps handoff | ⬜ (easy: deep links) |
| 15 | In-app navigation independent of Google/Apple (forest roads aren't in those) | ⬜ (hard: routing engine; FreeRoam used Valhalla) |
| 16 | Area updates: search local social media + state/federal announcements (closures, access) | ⬜ |
| 17 | Paid spots too: RV parks, paid state & federal campgrounds | 🟡 2026-07-11: 66 Recreation.gov federal campgrounds + 27 WA DNR campgrounds merged (CC-BY/as-is, reservable flag, websites); private RV parks via Overture. State Parks camping still a gap (no bulk dataset found) |
| 18 | Amenities on spots (hookups, dump, water, showers…) | ⬜ |
| 19 | Cell phone coverage map (per carrier) | ⬜ |
| 20 | Solar coverage / sun exposure at a spot | ⬜ |
| 21 | Rank spots (ratings + reviews) | ⬜ |
| 22 | Design-forward basemap with elevation markers (custom style: hillshade + labeled contours) | ✅ v1 shipped 2026-07-11 — the Boondock base: OpenFreeMap vector + Mapzen hillshade, CiDR palette, peak elevations in feet; plus Topo Overlay (USGS contours + figures) for any base. Native vector contour lines still a future refinement |
| 23 | Clean water fill stations (free + pay) and dump stations | 🟡 Dump/RV + Water POI chips shipped 2026-07-11 (OSM `sanitary_dump_station` / `water_point`); free-vs-pay detail needs a richer data layer |
| 24 | Baseline list of places to start from | ✅ national 2026-07-24 — WA baseline 2026-07-11, AZ 2026-07-23 (row 57), remaining 48 states in one sweep (row 58); RIDB bulk merges without an API key. FreeRoam's own data unrecoverable (verified) |
| 25 | Everything interactive — hover/click details on roads, places, features | 🟡 v1 2026-07-11: tap MVUM roads for details, basemap roads for names, site cards; empty-ground clicks show coords + elevation with a Save button (info-first); hover elevation + zoom in the status bar |
| 26 | Light daylight basemap | ✅ Boondock Day shipped 2026-07-11 (readability pass same day: peaks/ice/city labels, road opacity ramps) |
| 27 | Numbered search/POI results — numbered pins on the map matching a numbered, pickable list (both directions) | ✅ shipped 2026-07-11; nearby search now anchors to map center |
| 28 | Complete WA RV park + campground coverage | 🟡 Overture Maps merged 2026-07-11 (+756 places incl. The Cedars; Sites now 4,490 w/ 849 trailheads; per-source attribution in data/ATTRIBUTION.md). Next: RIDB bulk (CC-BY, verified no-key download) + WA DNR campgrounds, then other states |
| 29 | Boondocking-likelihood polygons — highlight "this might be a boondocking area" | ✅ national 2026-07-24 — 19,478 slope-graded zones across every state with USFS MVUM data (WA 455 on 2026-07-12, AZ 644 on 2026-07-23, the rest in row 58's sweep; CA 1,918 / CO 1,435 / ID 1,074 lead). Outputs clip to the exact state polygon. v3: closures, BLM land (most of the west's boondocking), water setbacks |
| 30 | FreeRoam-style site filters — by elevation, weather, nearby features (water, views) | 🟡 min + max elevation sliders shipped 2026-07-12 (every site carries elev_ft; persisted); weather filter built 2026-07-14 (row 56, deploy pending); nearby-feature filters still open |
| 31 | AllStays data | ⬜ commercial directory, no public API/licensing surface (checked 2026-07-12) — would require a business licensing conversation with AllStays LLC (Tim's call); not scrapeable under our policy |
| 32 | Waypoint visit status — been there / not sure / want to explore, with green/orange marker badges | ✅ shipped 2026-07-12 (save modal + edit form + list + popups + GPX `<type>` round-trip) |
| 33 | Map legend button | ✅ shipped 2026-07-12 — glass panel: site colors, badges, zones/packs, verified Public Land tints (USFS #cceac6, State #b3e3ef — sampled from the live layer), official USFS MVUM swatches fetched from the service legend API |
| 34 | WA DNR roads layer (state trust lands aren't in MVUM — e.g. Tim's found spot on blue state land) | ⬜ hunt a DNR road dataset on geo.wa.gov; also extend zones to state lands where dispersed camping is allowed |
| 35 | List ↔ map hover sync for search/POI results | ✅ shipped 2026-07-12 (hover a row → ring on the pin; hover a pin → row highlights) |
| 36 | "Search this area" pill after panning away from a POI search | ✅ shipped 2026-07-12 (>2.5 km from last search center) |
| 37 | Directions handoff on every point card (Apple Maps / Google Maps deep links) | ✅ shipped 2026-07-12 — waypoints, sites, search pins, MVUM roads, zone/info cards |
| 38 | CarPlay support with compass + elevation display | ⬜ requires the native iOS (Capacitor) wrapper + CarPlay entitlement — Phase 6 territory |
| 39 | Photo attachments on waypoints | ⬜ deliberately deferred (Tim: keep it slim). Ideas when ready: resize client-side to ~200KB, store per-device in IndexedDB first; community photos later via object storage (R2/B2) — cost scales with adoption, needs a plan |
| 40 | Labels + star ratings on waypoints (quiet/cleanliness/accessibility) → future community crowdsourcing à la FreeRoam | 🟡 personal layer shipped 2026-07-12 (user-defined label chips with shared vocabulary, 3× five-star ratings, in edit form + popups + filters). Community submission/moderation = the big v2; survey-field research (iOverlander/Campendium patterns) queued with the paused research task (#7) |
| 41 | Filter waypoints by their details | ✅ shipped 2026-07-12 — status / favorite / label chips on the Points tab, applied to list + map |
| 42 | Offline packs for more layers (Boondock base, satellite, chosen overlays) | 🟡 BLM Public Land overlay added as a downloadable pack 2026-07-12 (public domain). Boondock base needs a vector+glyph pack pipeline (own phase); satellite/names blocked on ESRI terms verification |
| 43 | Source + credibility on every searchable result | 🟡 shipped 2026-07-12: POI cards cite OpenStreetMap and show a record-detail tier (rich/fair/sparse — documentation completeness, honestly labeled). v2: context scoring (e.g. restroom inside a gas station = likelier real) |
| 44 | Custom waypoint pin colors | ✅ reshipped 2026-07-12 per Tim — color picker lives in the waypoint save modal + edit form (per-waypoint `color` field); the Layers-tab per-category section was removed. Trailhead category recolored rose #f472b6 (amber ≈ dump orange, then teal ≈ water blue) |
| 45 | Tap trails for their identity | ✅ shipped 2026-07-12 — USFS trail identify: name, motorized status, surface, tread (e.g. Church Mountain Trail: non-motorized, native surface) |
| 46 | Delete on every waypoint surface | ✅ shipped 2026-07-12 — two-tap "Confirm delete?" in the marker popup, trashcan (two-tap) in the edit form, existing list delete. Same commit fixed marker popups, which had never actually opened (stopPropagation ate the map click MapLibre needs; setHTML was wiping button listeners) |
| 47 | Labels editable at save time, not just edit | ✅ shipped 2026-07-12 — vocab chips + free-text add in the New Waypoint modal |
| 48 | In-app instructions (book button next to the legend ?) | ✅ shipped 2026-07-12 — 8-tab Guide (Welcome opener, Map, Layers, Find, Waypoints, Offline, Phone, Credits). Same day, per Tim: both help buttons moved into the toolbar's top-right icon group (Tim confirmed he likes the placement); panels drop down top-right. **Standing rule: update Guide.jsx in the same commit as any user-facing feature change** |
| 49 | Waypoints on the phone / cross-device sync | 🟡 works today via GPX: Export (share icon) → AirDrop/iCloud → Import (folder icon) on the phone PWA; carries name, notes, coords, elevation, icon, status, favorite — NOT labels/ratings/pin colors (not in the GPX format; would need a sidecar). Documented in the Guide's Phone tab. v2: extend GPX round-trip with a Boondock extension for the missing fields, then true auto-sync (needs a backend or iCloud file strategy — design decision for Tim) |
| 50 | Copy coordinates from any point popup | ✅ shipped 2026-07-12 — "Copy coords" button rides the Directions row on every point card (map click, waypoints, sites, search results, roads, trails); flips to "✓ Copied". Probe-verified the clipboard receives `lat, lng`. Fixing it surfaced + fixed a latent bug: three popups bound Save to their first `<button>`, which the new Copy button displaced |
| 51 | Topo lines visible from further out | 🟡 shipped 2026-07-12 — added the service's small-scale contour set (labels off, 0.5 opacity) fading in ~z9, handing off to index lines at z10.3. Caveat flagged: in very steep country (North Cascades test tile: ~88% inked pixels) it reads as dense terrain texture — **Tim should eyeball it**; if too busy, options are raising the fade-in to z9.5+ or dropping opacity |
| 52 | Circle around the favorite star badge | ✅ shipped 2026-07-12 — dark disc + status-color ring behind the star on map pins, matching circled star in the waypoint list and the legend |
| 53 | Filter sites by type | ✅ shipped 2026-07-13 — checkbox chips (All + the 5 kinds, dot-colored) in the Layers tab's Site Filter section; persisted in prefs; filters via the same setData path as the elevation filter so cluster counts stay honest. Went with always-visible inline chips instead of the suggested click-popup — one less click and discoverable; say the word to change it |
| 54 | Track recording actually records | ✅ fixed 2026-07-13 — Record had never produced a point: all the downstream plumbing existed but nothing called `watchPosition`. GPS watch added (high-accuracy, error toast). Probe with mocked GPS: 4 points → live red line + status-bar count → Stop → named track saved with 0.22 mi distance. Guide's Map tab now documents it |
| 55 | Far-out topo actually renders | ✅ fixed 2026-07-13 — the z9 far tiles were silently blank: a 512px export of a z9 tile is 1:577,790, 4% outside the small-scale set's 1:600k scale band, so ArcGIS returned empty PNGs. Tiles capped at z8 (in-band, overscaled through the fade). Full-strength test rendered the Cascades as a brown blanket → opacity 0.22: subtle etched relief ~z9–10.3, then index lines. Tim: judge the look live |
| 56 | Temperature trip filter — "no day above / no night below X°" + average-temp range over the next 7–16 days, drawn as a polygon of qualifying area, to pick where to head next; weather info on all features | ✅ built & probe-verified 2026-07-14, committed + deployed 2026-07-15 (Pages run succeeded) — Layers → Temperature Filter: days-ahead slider (7–16, Open-Meteo's max horizon), no-day-hotter-than / no-night-colder-than / average-at-least / average-at-most sliders (°F, extreme end = Any). Viewport is sampled on a cached forecast lattice (~≤520 pts, 0.05°–6.4° cells by zoom), margins contoured by marching squares into a dashed blue polygon; site dots failing the criteria hide via the same setData path as the other filters (sites outside the sampled area stay visible — unknown ≠ failing); re-checks on pan, slider changes recompute instantly from cache. Plus a weather card on every point popup — site, waypoint, ground click, search pin, MVUM road, trail: now-conditions, 8-day strip (hover a day for detail), days-9–16 extremes + model elevation. In Guide (Map/Layers/Find/Credits), Legend, README |
| 57 | Arizona pilot — second state in the Sites + Zones data, on the existing map | ✅ shipped 2026-07-23 — `spots-az.geojson`: 2,649 places (1,430 campsites, 794 RV parks, 51 dumps, 27 water, 347 trailheads; src: OSM 1,784 / Overture 813 / RIDB 52 fed campgrounds — counts from the build log) + `boondock-zones-az.geojson`: 644 slope-graded zones across the 6 AZ national forests. Pipeline now state-parameterized (`build_spots.py az …`, `build_zones.py az …`) with a new exact state-boundary clip (OSM polygon via Nominatim) — a bare bbox let in 86 out-of-state spots (Laughlin NV casinos, Needles/Blythe CA, Lake Mead, Monument Valley UT, Puerto Peñasco MX), all dropped and spot-checked. Map.jsx merges per-state files (`DATA_STATES`). Known gaps: no AZ state-lands source yet (AZ State Parks has no bulk dataset found; state trust land needs a permit — different rules than WA DNR), zones still USFS-only (most western-AZ boondocking is BLM → zones v3) |
| 58 | Populate the rest of the country — all 50 states on the existing map | ✅ shipped 2026-07-24 — **93,908 places** (61,695 campsites, 19,291 RV parks, 10,563 trailheads, 1,616 dumps, 743 water; src: OSM 59,375 / Overture 32,408 / RIDB 2,098 / WA DNR 27) + **19,478 boondock zones**, one spots + one zones file per state, 49 MB total. Data loads lazily per state as the viewport reaches it past ~z4.5 (`shared/stateBounds.js`) — initial page load unchanged, national zoom loads nothing. Pipeline: boundary polygons drive both scripts (Nominatim per state), one national Overture scan split by polygon, RIDB bulk reused, 96 sequential Overpass queries with mirror rotation (1 manual retry: MO trailheads), zones swept state-by-state over ~6 h of polite USFS queries with a per-state MVUM presence probe (IA/CT/RI/NJ/DE/HI + AL/MA/MD legitimately empty — AL's forests have only 221 published MVUM features vs MS's 1,181, checked). Every file validated (parse, bounds, geometry types; CA/CO/ID caught with a GeometryCollection clip defect and rebuilt). Known gaps: no state-lands sources beyond WA DNR, zones still USFS-only (BLM = v3), Aleutians west of the antimeridian excluded |

Guiding scope (Tim, 2026-07-11): replicate the useful features of Campendium +
iOverlander (spot database, amenities, reviews) and Gaia GPS (maps, tracks,
offline) — as one free app.

## Where we left off — session handoff 2026-07-24 (national build)

**Row 58 (national coverage) built on branch `national`** (off main after the
AZ merge + boondockmap.com move): 93,908 places + 19,478 zones, 100
per-state files, 49 MB, every file validated (0 missing, 0 bad). Built by
the state-parameterized pipeline over ~a day of polite sequential queries
(Overpass mirrors, USFS ArcGIS one state at a time, one national Overture
scan split by boundary polygon, RIDB reused). The app no longer
eager-loads data: each state's two files lazy-load when the viewport
reaches them past ~z4.5 (`shared/stateBounds.js`), so the national dataset
adds zero bytes to initial page load and a marathon cross-country session
is the only way to accumulate it all. Probe recipe change: the site now
lives at the Pages root (boondockmap.com) — serve `web/dist` directly on
:4173, no `boondock_map` symlink.

Pipeline hardening found by building at scale: state-polygon clipping
(bbox-rect clips double-draw shared forest between interlocking states),
GeometryCollection fallout from polygon clips (CA/CO first builds collapsed
to one feature each — caught by the polygons-count log line, fixed, rebuilt,
and every output validated), per-state MVUM presence probe (plains states
and HI skip their whole cell sweep).

## Where we left off — session handoff 2026-07-23

The **Arizona pilot (row 57)** is built, probe-verified, and committed on the
`AZ` branch. It is deliberately **not merged** — pushing `main` is what
deploys the live site. To ship: Tim eyeballs it (run the app, fly to
Flagstaff or Sedona with Sites + Boondock Zones on; the statewide view at
~z6 shows the whole picture), then merge `AZ` into `main` and push.

Probe-verified 2026-07-23 (offscreen Electron against the production web
build, four screenshots read): statewide clusters + zones over all six AZ
national forests stopping at the state line; Sedona/Verde Valley density;
Flagstaff z11 zones tracing the Wing Mountain / Fort Valley MVUM roads with
the city and steep Peaks empty; WA unchanged (both states load from the
merged per-state fetch). Boundary-clip spot-check: dropped list was 100%
out-of-state (Laughlin NV, Needles/Blythe CA, Lake Mead, Monument Valley UT,
Puerto Peñasco MX, two RIDB facilities with AZ addresses across the river).

New since 2026-07-15 deploy, riding along in this commit: `data-pipeline/`
scripts state-parameterized + per-state fetch recipes in
`data-pipeline/README.md`; zones outputs now clip to the state box; README
track-recording + Sites bullets un-staled; row 56/9 language corrected to
"deployed 2026-07-15".

## Where we left off — session handoff 2026-07-14 (paused mid-session)

**Resolved 2026-07-15:** the weather feature below was committed ("wip
edits") and the Pages deploy succeeded — it is live. Kept for the probe
recipe and verification notes.

Tim paused until the weekend. **The temperature-filter + popup-weather feature
(row 56) is complete and probe-verified but sits uncommitted in the working
tree** — 9 modified files + new `boondock/src/shared/weather.js` (316
insertions). Nothing is deployed yet; the live site is unchanged.

**Verified before pausing (2026-07-14):**
- Open-Meteo API empirically checked: 16-day daily max/min/mean °F, batch
  multi-location requests (array response; single location returns an
  object), CORS `*`, CC-BY 4.0 / free non-commercial, no key, <10k calls/day.
- 26 Node sanity checks on the grid math all pass (margins, bilinear site
  verdicts, zero-contour placement, saddle cells both ways, missing-node
  holes, day-window slicing).
- `web/` production build clean.
- Offscreen-Electron probe against the built web app, screenshots read:
  Cascades at z9 with "no day hotter than 85°F" → dashed blue polygons over
  the high country (Glacier Peak, Whitehorse, Big Chiwaukum), valleys
  excluded, site clusters only in qualifying areas; status line "Fits 36 of
  187 forecast points in view"; ground-click popup card shows now-conditions
  / 8-day strip (rain day carries ☂ 48%) / days-9–16 outlook + model
  elevation; Clear resets to "Set any limit to activate".

**To resume:**
1. Tim eyeballs the look (fill is `#38bdf8` at 0.13 opacity — subtle on the
   dark base by design; easy to raise if he wants it louder).
2. Commit everything together (Guide/Legend/README/VISION ride along per the
   standing rule) and push — push to `main` auto-deploys the live site.
3. Optional spot-check on desktop Electron (same shared code as the verified
   web build) and on the phone PWA.
4. Probe recipe if needed again: build `web/`, serve `dist` behind a
   `boondock_map` symlink on :4173, offscreen Electron (do NOT
   `disableHardwareAcceleration` — it kills WebGL), drive React range
   sliders via the native value setter + `input` event, reposition the map
   with `window.boondock.savePrefs({center, zoom})` + reload.

## Where we left off — session handoff 2026-07-12

Everything requested through 2026-07-12 is shipped and live except the items
below. Last deployed commits: waypoint UX batch (delete everywhere, labels at
save, marker-popup fix), in-app Guide, toolbar help buttons, copy-coords,
far-out topo, circled favorite star. All probe-verified before push.

**Next up, in rough priority (updated 2026-07-13):**
1. **Tim's visual sign-off**: far-out topo texture (row 55, screenshots shown
   in chat 2026-07-13 — etched-relief look at 0.22 opacity) and the circled
   favorite star (row 52 — screenshot verified at z14.5, looks clean).
2. **Offline packs for the Boondock basemap** (row 42) — vector tile + glyph
   pack pipeline; satellite blocked on ESRI terms check.
3. **Waypoint cross-device sync v2** (row 49) — GPX extension for
   labels/ratings/colors, then an auto-sync design.
4. **DNR roads layer** (row 34), **national spots sweep** beyond WA,
   **zones v3** (closures, BLM, more states), **PMTiles pre-render** for
   MVUM/trails speed. Weather built 2026-07-14 (rows 9/56, deploy pending) —
   remaining weather idea is NWS alerts.
5. Waiting on Tim: RIDB API key (optional), AllStays licensing decision,
   community-layer moderation plan.
6. Paused: deep-research verification re-run (task #7, needs API access).

### Claude's suggested additions

- **Public-land legality helper** — tap a spot → "this is BLM / USFS / private"
  from the land-status layer, plus agency office contact (FreeRoam modeled
  `agency`/`office`/`region` for exactly this).
- **Stay-limit notes** (14-day BLM rules etc.) attached to land type.
- **Check-in / "was it accessible?" freshness signal** — the single biggest
  complaint about crowd-sourced spot data is stale info (FreeRoam modeled
  `check_in` separately from reviews).
- **GPX/data portability first** — import from Gaia/iOverlander exports so
  nobody starts from zero; user data always exportable. (Fear of data lock-in
  is a top reason people hesitate to leave Gaia — research, unverified.)
- **Elevation profile along tracks/roads** (free DEM data).
- **Fix now:** waypoint deletion bug, track recording, offline serving — see
  "Current state" below.

---

## Current state of the app (verified 2026-07-11)

Reviewed every source file. The desktop Electron app launches and works for:
map with 5 base layers + 6 overlays (USGS topo, ESRI satellite/hybrid,
OpenTopo; USFS roads/trails, contours, road labels, BLM land status),
waypoints with 8 categories, Nominatim place search with history, coordinate
parsing (DD/DDM/DMS), Overpass nearby-POI search, GPX import/export, iCloud
sync with live file-watching, viewport persistence, CiDR-branded dark UI.

Broken or missing (all verified by reading the code):

1. **Offline packs are write-only.** Tiles download into `.mbtiles` files, but
   no code path serves them back to the map. Offline in the field = blank map.
   This is the #1 gap vs. the app's stated purpose.
   **FIXED 2026-07-11** — Phase 2 shipped a shared offline engine
   (`shared/offlineTiles.js`): packs in IndexedDB, served via a `boondock://`
   MapLibre protocol, verified end-to-end with network emulation.
2. **Track recording records nothing.** The Record button works, but no GPS
   points are ever captured (`onTrackPoint` is wired in but never called), so
   every recording is silently discarded. Note: desktop Electron geolocation
   is unreliable anyway — tracks really belong on the phone version.
3. **Deleting the last waypoint doesn't stick** (a save-guard skips empty
   lists), so it resurrects on restart. Same guard pattern risks a
   load/save race on tracks. **FIXED 2026-07-11** — saves now gate on load
   completion.
4. **Minor:** waypoint names/notes are injected into popup HTML unescaped (a
   malicious GPX import could inject markup); `webSecurity: false` is enabled
   for local tiles that are never actually loaded; Nominatim/Overpass usage
   needs an identifying User-Agent + throttling before a public release;
   in-memory MBTiles build means big downloads eat RAM.

---

## What the research found

**Caveat:** the deep-research run's search phase succeeded (5 sources) but its
verification phase failed on an account-access error, so the claims below are
**single-source, unverified** except where marked ✅ (verified firsthand
against the GitHub API this session). Re-verification is queued.

- **Gaia GPS** post-Outside: price raised to ~$90/yr bundled with Outside+;
  long-time users angry, first worry is exporting their data (Gaia help-forum
  thread, Sep 2024).
- **iOverlander 2** (2025 rewrite): went freemium — free tier requires
  downloading one region at a time + ads; Pro $5.99/mo, Unlimited $9.99/mo;
  community furious that volunteer-contributed data is now paywalled; website
  data exports removed for non-subscribers (May 2025). People uninstalled.
- **Goat Maps** (indie app by ex-Gaia founders): shut down May 2026 — even a
  polished indie GPS app couldn't reach sustainability in ~2 years. Lesson:
  our zero-server-cost, no-revenue-needed architecture is the survivable shape
  for a free app.
- The niche Tim wants — free, lean, community-data, offline — is exactly the
  hole the market has been tearing open since 2024. FreeRoam died, Goat Maps
  died, incumbents are raising prices and paywalling data.

## FreeRoam archive review ✅ (all verified via GitHub API)

github.com/FreeRoamApp — 10 repos, dormant (last push Jan 2023, most activity
2018–2019), built by a two-person team (design+community / programming).

**Licenses:** client (`free-roam`) is **Unlicense** (public domain — we may
legally reuse anything). Backend (`back-roads`) and most other repos have
**no license** — read for reference only, no code copying. Their `valhalla`
repo is MIT (deploy scripts, not a fork).

**Architecture (their stack, self-hosted in Docker on GCP):** tileserver-gl
serving MBTiles packs — a 16 GB North America basemap, BLM, USFS, **per-carrier
cell coverage (AT&T/Sprint/T-Mobile/Verizon)**, and MVUM "local maps" — plus
Valhalla (routing/navigation) and Pelias (geocoding). Their tile-data GCS
bucket is no longer publicly accessible (checked — 401/403), so the data is
gone; only the recipes remain.

**Feature surface** (from `src/pages`): campgrounds, "overnights" (non-camp
spots), amenities, reviews, check-ins, trips with stops, guides, MVUM
submission, groups/chat/forum, karma + moderation tooling.

**Data model** (from backend `models/`): `user_rig` (rig profiles → Tim's #13
existed there), `cell_tower`, `weather_station`, `hazard`, `check_in`,
review + revision models, `agency`/`office`/`region`, `trip`, `user_karma`,
`ban`, `group_audit_log`.

**Verdict:** don't build *on* it — 2018-era CoffeeScript on a custom framework,
backend unlicensed, data unrecoverable. Build *from* it — it is a verified,
field-tested map of exactly which features and data models this community
needs, and its client code is legally ours to mine for logic (e.g., MVUM
config generation).

---

## Architecture direction

**One web codebase, installed everywhere (PWA-first).**

- Build the map app as a modern web app sharing `boondock/src/shared/` code.
- **Web:** deployed on GitHub Pages at cidrlab.org/boondock_map/. The repo is
  private; the org's GitHub plan allows Pages from private repos, and the
  *site* is public while the *code* stays private (Tim's choice, 2026-07-11).
  Note: GPL source-sharing obligations only bind distributed copies — worth
  revisiting repo visibility before inviting outside contributors.
- **iPhone:** the same app installed via Safari → "Add to Home Screen" (a PWA
  — works offline via service worker + on-device storage). If/when we outgrow
  PWA limits (large offline packs, background GPS), wrap the same code in
  Capacitor for a real App Store app.
- **Desktop:** the same PWA installs from the browser; the existing Electron
  app stays as-is during transition (it's Tim's daily tool) and is retired or
  slimmed (Tauri) later. This is how "super lean" happens — one codebase, no
  Chromium bundled per app.
- **Offline tiles:** move from MBTiles toward **PMTiles** (single-file tile
  archives readable directly by MapLibre over HTTP range requests — the
  ERN/CiDR mapping standard, and static-hostable on Pages with zero server).
  Region packs = downloadable PMTiles files stored on-device.
- **Community layer (later phase):** static-first — community spots as
  versioned GeoJSON/PMTiles in a public repo, contributions via PR-like flow
  or a tiny moderated queue. Zero servers to pay for = the app can't die the
  Goat Maps death. (A real submission backend is a later decision.)
- **Navigation:** phase 1 = deep-link handoff to Apple/Google Maps (trivial).
  In-app off-road routing = Valhalla over OSM+USFS data, precomputed or
  self-hosted — genuinely hard, keep late in the roadmap (FreeRoam ran this;
  it's doable but it's server infrastructure).

## Phased roadmap

- **Phase 0 — Foundations (now):** repo cleanup ✅, license ✅, this doc ✅;
  fix the three verified bugs (offline serving, track recording UX honesty,
  waypoint deletion); good-citizen API headers.
- **Phase 1 — Web app on GitHub Pages:** shared-code web build, IndexedDB
  storage, PWA manifest + service worker, deployed and installable on iPhone.
  *This is the next build step.*
- **Phase 2 — Real offline:** *shipped 2026-07-11* for user-drawn packs —
  download an area (box or current view) into device storage, served to the
  map pack-first/network-fallback on desktop and web, with a pack manager
  (list/size/delete). Remaining: prebuilt PMTiles region packs, more offline
  layers after tile-service terms verification. Speed note: MVUM/trails are
  drawn on demand by USFS servers (inherently slow); pre-rendering them into
  self-hosted PMTiles is the performance + offline fix in one, and matters
  more than native apps for perceived speed.
- **Phase 3 — The boondocking layer:** *first slice shipped 2026-07-11* —
  Sites database (WA baseline) + true MVUM + the Boondock basemap + Topo
  Overlay. Remaining: national spot coverage, RIDB paid campgrounds,
  public-land tap-to-identify, stay-limit info, GPX import from
  Gaia/iOverlander exports.
- **Phase 4 — Safety:** weather forecast at spot (NWS/Open-Meteo), cell
  coverage overlay (FCC data), road-condition notes, area alerts (USFS/BLM
  closures — Tim's #16; social-media search needs feasibility check).
- **Phase 5 — Community:** check-ins, reviews, freshness signals, moderation
  (static-first architecture above); rig profiles + accessibility matching.
- **Phase 6 — Navigation & native:** Maps handoff early (it's trivial — can
  slot into any phase); in-app routing; Capacitor iOS wrapper if PWA limits
  bite; design excellence pass throughout, anchored by a dedicated
  brand/design sprint before public launch.

## Data sources & licensing (to verify before each phase ships)

Verified this session: FreeRoam licenses (above); GPL-3.0 text; CC's own FAQ
recommends against CC licenses for software (creativecommons.org/faq).
Not yet verified (flagged, do before building on them): USGS/USFS/BLM tile
service terms for bulk/offline download; ESRI World Imagery terms (offline
caching is likely restricted — may need to swap satellite sources for offline
packs); OSM ODbL attribution/share-alike duties for derived spot data;
iOverlander data availability post-paywall; Open-Meteo/NWS API terms; FCC
cell-coverage data terms; OpenTopoMap CC-BY-SA.

## Credits & attribution policy

Tim's standing rule (2026-07-11): credit where credit is due, always. Anything
we learn from, adapt, or reuse gets cited — in code comments at the reuse
site, in the README acknowledgments, and in the app's about/credits screen
when one exists. That starts with **FreeRoam** (Austin & Rachel — feature set,
data model, and architecture reference; any reused code from their Unlicense
client gets a source link), and applies equally to data providers (USGS, USFS,
BLM, ESRI, OpenStreetMap contributors, Nominatim, Overpass), libraries
(MapLibre GL, React, Vite, sql.js), and community sources we build on.

## Open questions for Tim

1. ~~Repo visibility~~ Resolved 2026-07-11: repo stays private; the org plan
   allows Pages from private repos, so the site is public and the code is not.
2. For offline satellite: if ESRI's terms block offline caching, acceptable to
   offer USGS imagery (public domain) for offline packs instead?
3. Community layer moderation: who besides you approves submissions long-term?
