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
| 1 | Find free/dispersed camping (Campendium/iOverlander-style database + workflow) | 🟡 Sites layer live 2026-07-11 — WA baseline (2,885 OSM spots: camp/RV/dump/water) with popups + save-as-waypoint; national coverage, RIDB paid campgrounds, and dispersed-spot community data next |
| 2 | Scout areas with satellite imagery around a candidate spot | ✅ ESRI satellite + hybrid layers |
| 3 | Hiking + 4x4 trails and forest roads on the map | 🟡 true MVUM overlay live 2026-07-11 (legal roads by vehicle type, z10+) + USFS/NPS trails |
| 4 | Downloadable offline basemaps | ✅ user-drawn packs render offline on desktop + web (2026-07-11); USGS Topo layer — others + prebuilt region packs pending terms checks |
| 5 | Super lean, low-resource app | 🟡 app is small, but Electron shell is heavy; PWA direction below |
| 6 | Desktop + iPhone + web (GitHub Pages) versions | 🟡 desktop + web live (2026-07-11); iPhone = install the web app from Safari (needs on-device testing) |
| 7 | Looks amazing, CiDR/ERN palette | 🟡 mobile redesign shipped 2026-07-11 (map-first bottom sheet, glass chrome, visible controls, pack footprints); desktop polish + custom basemap next |
| 8 | Free for everyone + public | ✅ GPL-3.0 added 2026-07-11 |
| 9 | Safety: weather forecasting at a spot | ⬜ |
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
| 24 | Baseline list of places to start from | 🟡 WA baseline shipped 2026-07-11 (OSM extract, committed to repo); next: remaining states (scripted Overpass sweep), Recreation.gov RIDB for fed/state paid campgrounds (Tim needs to register a free API key), BLM/USFS facilities. FreeRoam's own data unrecoverable (verified) |
| 25 | Everything interactive — hover/click details on roads, places, features | 🟡 v1 2026-07-11: tap MVUM roads for details, basemap roads for names, site cards; empty-ground clicks show coords + elevation with a Save button (info-first); hover elevation + zoom in the status bar |
| 26 | Light daylight basemap | ✅ Boondock Day shipped 2026-07-11 (readability pass same day: peaks/ice/city labels, road opacity ramps) |
| 27 | Numbered search/POI results — numbered pins on the map matching a numbered, pickable list (both directions) | ✅ shipped 2026-07-11; nearby search now anchors to map center |
| 28 | Complete WA RV park + campground coverage | 🟡 Overture Maps merged 2026-07-11 (+756 places incl. The Cedars; Sites now 4,490 w/ 849 trailheads; per-source attribution in data/ATTRIBUTION.md). Next: RIDB bulk (CC-BY, verified no-key download) + WA DNR campgrounds, then other states |
| 29 | Boondocking-likelihood polygons — highlight "this might be a boondocking area" | ✅ v1 shipped 2026-07-11: "Boondock Zones β" overlay — 712 WA polygons (USFS land within ~300 m of a legal MVUM road; `data-pipeline/build_zones.py`), opt-in, disclaimer on click. v2 refinements: slope from DEM, closures, BLM land, water setbacks, other states |
| 30 | FreeRoam-style site filters — by elevation, weather, nearby features (water, views) | 🟡 elevation filter shipped 2026-07-11 (every site carries elev_ft sampled from the DEM; max-elevation slider in Layers, persisted); weather + feature filters next (#9) |

Guiding scope (Tim, 2026-07-11): replicate the useful features of Campendium +
iOverlander (spot database, amenities, reviews) and Gaia GPS (maps, tracks,
offline) — as one free app.

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
