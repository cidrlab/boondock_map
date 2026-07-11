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
| 1 | Find free/dispersed camping (Campendium/iOverlander-style database + workflow) | ⬜ |
| 2 | Scout areas with satellite imagery around a candidate spot | ✅ ESRI satellite + hybrid layers |
| 3 | Hiking + 4x4 trails and forest roads on the map | 🟡 USFS roads/trails overlays exist; no MVUM detail (road type/vehicle class) |
| 4 | Downloadable offline basemaps | 🟡 download works; **map cannot read the packs back yet** |
| 5 | Super lean, low-resource app | 🟡 app is small, but Electron shell is heavy; PWA direction below |
| 6 | Desktop + iPhone + web (GitHub Pages) versions | 🟡 desktop only |
| 7 | Looks amazing, CiDR/ERN palette | 🟡 palette baked in (verified in global.css); full design pass pending |
| 8 | Free for everyone + public | ✅ GPL-3.0 added 2026-07-11 |
| 9 | Safety: weather forecasting at a spot | ⬜ |
| 10 | Safety: road conditions / road types (washboard, clearance, mud) | ⬜ |
| 11 | Nearby points of interest to hike to | 🟡 Overpass POI search exists (trailheads, viewpoints, water…) |
| 12 | Community layer to store/share spot info | ⬜ |
| 13 | Rig/setup profile (RV, tent, overlander…) → "can my rig get there?" | ⬜ |
| 14 | Navigate to a spot via Google Maps / Apple Maps handoff | ⬜ (easy: deep links) |
| 15 | In-app navigation independent of Google/Apple (forest roads aren't in those) | ⬜ (hard: routing engine; FreeRoam used Valhalla) |
| 16 | Area updates: search local social media + state/federal announcements (closures, access) | ⬜ |

### Claude's suggested additions

- **Cell-coverage overlay per carrier** — FreeRoam shipped this (verified:
  AT&T/Sprint/T-Mobile/Verizon MBTiles in their tile server); boondockers pick
  spots by signal. FCC broadband data is the usual source.
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
- **Elevation profile + sun exposure for a spot** (free DEM data).
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
2. **Track recording records nothing.** The Record button works, but no GPS
   points are ever captured (`onTrackPoint` is wired in but never called), so
   every recording is silently discarded. Note: desktop Electron geolocation
   is unreliable anyway — tracks really belong on the phone version.
3. **Deleting the last waypoint doesn't stick** (a save-guard skips empty
   lists), so it resurrects on restart. Same guard pattern risks a
   load/save race on tracks.
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
- **Web:** deployed free on GitHub Pages (repo must be public — it is).
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
- **Phase 2 — Real offline:** region pack download (PMTiles), offline serving
  in MapLibre on all platforms, pack manager UI.
- **Phase 3 — The boondocking layer:** public-land tap-to-identify, MVUM road
  types, stay-limit info, spot database seeded from open data, GPX import from
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

## Open questions for Tim

1. Public repo stays public (required for free GitHub Pages) — OK?
2. For offline satellite: if ESRI's terms block offline caching, acceptable to
   offer USGS imagery (public domain) for offline packs instead?
3. Community layer moderation: who besides you approves submissions long-term?
