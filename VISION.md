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

**Standing rule (Tim, 2026-07-25):** write every request into this table *when
it is asked*, before the work starts, with the date in **Asked**. Fill **Done**
and flip to ✅ only when the thing is verified working for users — built but
undeployed stays 🟡. `Asked` is blank on rows 1–62 because the dates weren't
tracked before 2026-07-25; they are not guessed. `Done` on those rows is the
ship date already stated in the row text.

### Tim's requests

| # | Feature | Asked | Done | Status |
|---|---------|-------|------|--------|
| 1 | Find free/dispersed camping (Campendium/iOverlander-style database + workflow) |  |  | 🟡 Sites layer live 2026-07-11 — WA baseline, AZ 2026-07-23 (row 57), **all 50 states 2026-07-24 (row 58, 93,908 places)**; dispersed-spot community data still open |
| 2 | Scout areas with satellite imagery around a candidate spot |  |  | ✅ ESRI satellite + hybrid layers |
| 3 | Hiking + 4x4 trails and forest roads on the map |  |  | 🟡 true MVUM overlay live 2026-07-11 (legal roads by vehicle type, z10+) + USFS/NPS trails |
| 4 | Downloadable offline basemaps |  | 2026-07-11 | ✅ user-drawn packs render offline on desktop + web (2026-07-11); USGS Topo layer — others + prebuilt region packs pending terms checks |
| 5 | Super lean, low-resource app |  |  | 🟡 app is small, but Electron shell is heavy; PWA direction below |
| 6 | Desktop + iPhone + web (GitHub Pages) versions |  |  | 🟡 desktop + web live (2026-07-11); iPhone = install the web app from Safari (needs on-device testing) |
| 7 | Looks amazing, CiDR/ERN palette |  |  | 🟡 mobile redesign shipped 2026-07-11 (map-first bottom sheet, glass chrome, visible controls, pack footprints); desktop polish + custom basemap next |
| 8 | Free for everyone + public |  | 2026-07-11 | ✅ GPL-3.0 added 2026-07-11 |
| 9 | Safety: weather forecasting at a spot |  |  | 🟡 forecast card built 2026-07-14 on every point popup (row 56, deployed 2026-07-15) — current conditions + 8-day strip + days-9–16 outlook, Open-Meteo. Still open for "safety": NWS watches/warnings/alerts |
| 10 | Safety: road conditions / road types (washboard, clearance, mud) |  |  | ⬜ |
| 11 | Nearby points of interest to hike to |  |  | 🟡 Overpass POI search exists (trailheads, viewpoints, water…) |
| 12 | Community layer to store/share spot info |  |  | 🟡 **Worker deployed 2026-07-25** at `https://boondock-community.cidr-lab.workers.dev` (KV bound, ADMIN_TOKEN + IP_SALT set); URL wired into `shared/community.js` and the in-app controls now appear. Repo secrets `COMMUNITY_API` + `COMMUNITY_ADMIN_TOKEN` added 2026-07-26 (names verified via `gh secret list`), so the nightly merge is armed. **One step left: merge `themes-hardening-feedback` into `main` and push**, which deploys the site. Production verified non-destructively 2026-07-25 (every probe rejected at validation, nothing written): `/health` ok, `/submit` validating, admin endpoints 401, CORS `*` on preflight. Tim's calls implemented: anonymous-friendly Worker channel (no accounts) + auto-publish with light-touch moderation. In-app "Report a spot" on the ground card (5 site kinds, name + note) → Cloudflare Worker (`worker/`): profanity rejected outright; links/emails/phones/shouting/near-dups held for `/queue` review; 5 spots + 30 actions/day per salted IP hash (no raw IPs anywhere); `REQUIRE_APPROVAL` env dial flips to hold-everything if spam demands. Clean reports publish nightly as *unverified* (`data-pipeline/merge_community.py` + `community-merge` Action → `community.geojson` → Sites layer, amber-ringed). Cards carry dated check-in comments ("Still there" / "Gone / closed"); 2+ confirmations from hashes independent of the submitter promote to *verified*; two recent negatives show a "may be gone" warning; last-confirmed date always visible; in-app two-tap flag, 2+ user flags withhold from publish. Your own report pins immediately as *pending* (survives restart) and reconciles once published. Verified end-to-end 2026-07-24: 21/21 Worker endpoint tests, merge + verified-promotion runs, Electron probe of dot→card→live check-in→report modal→pending pin→restart, disabled-state fallback (controls hidden until the Worker URL is set). **Nightly `community-merge` Action fixed + verified green 2026-07-29** — it had failed since going live because Cloudflare edge-bans the default `Python-urllib` User-Agent (error 1010 → HTTP 403) before the request reaches the Worker's own auth; sending a real UA fixed it, and a manual run is now green (0 pending spots → "No community changes tonight"). The `COMMUNITY_ADMIN_TOKEN` secret is confirmed correct end-to-end (the Worker returned 200, not 401) |
| 13 | Rig/setup profile (RV, tent, overlander…) → "can my rig get there?" |  |  | ⬜ |
| 14 | Navigate to a spot via Google Maps / Apple Maps handoff |  | 2026-07-12 | ✅ shipped 2026-07-12 as row 37 — Apple/Google deep links on every point card |
| 15 | In-app navigation independent of Google/Apple (forest roads aren't in those) |  |  | ⬜ (hard: routing engine; FreeRoam used Valhalla) |
| 16 | Area updates: search local social media + state/federal announcements (closures, access) |  |  | ⬜ |
| 17 | Paid spots too: RV parks, paid state & federal campgrounds |  |  | 🟡 2026-07-11: 66 Recreation.gov federal campgrounds + 27 WA DNR campgrounds merged (CC-BY/as-is, reservable flag, websites); private RV parks via Overture. State Parks camping still a gap (no bulk dataset found) |
| 18 | Amenities on spots (hookups, dump, water, showers…) |  |  | ⬜ |
| 19 | Cell phone coverage map (per carrier) |  |  | ⬜ |
| 20 | Solar coverage / sun exposure at a spot |  |  | ⬜ |
| 21 | Rank spots (ratings + reviews) |  |  | ⬜ |
| 22 | Design-forward basemap with elevation markers (custom style: hillshade + labeled contours) |  | 2026-07-11 | ✅ v1 shipped 2026-07-11 — the Boondock base: OpenFreeMap vector + Mapzen hillshade, CiDR palette, peak elevations in feet; plus Topo Overlay (USGS contours + figures) for any base. Native vector contour lines still a future refinement |
| 23 | Clean water fill stations (free + pay) and dump stations |  |  | 🟡 Dump/RV + Water POI chips shipped 2026-07-11 (OSM `sanitary_dump_station` / `water_point`); free-vs-pay detail needs a richer data layer |
| 24 | Baseline list of places to start from |  | 2026-07-24 | ✅ national 2026-07-24 — WA baseline 2026-07-11, AZ 2026-07-23 (row 57), remaining 48 states in one sweep (row 58); RIDB bulk merges without an API key. FreeRoam's own data unrecoverable (verified) |
| 25 | Everything interactive — hover/click details on roads, places, features |  |  | 🟡 v1 2026-07-11: tap MVUM roads for details, basemap roads for names, site cards; empty-ground clicks show coords + elevation with a Save button (info-first); hover elevation + zoom in the status bar |
| 26 | Light daylight basemap |  | 2026-07-11 | ✅ Boondock Day shipped 2026-07-11 (readability pass same day: peaks/ice/city labels, road opacity ramps) |
| 27 | Numbered search/POI results — numbered pins on the map matching a numbered, pickable list (both directions) |  | 2026-07-11 | ✅ shipped 2026-07-11; nearby search now anchors to map center |
| 28 | Complete WA RV park + campground coverage |  |  | 🟡 Overture Maps merged 2026-07-11 (+756 places incl. The Cedars; Sites now 4,490 w/ 849 trailheads; per-source attribution in data/ATTRIBUTION.md). Next: RIDB bulk (CC-BY, verified no-key download) + WA DNR campgrounds, then other states |
| 29 | Boondocking-likelihood polygons — highlight "this might be a boondocking area" |  | 2026-07-24 | ✅ national 2026-07-24 — 19,478 slope-graded zones across every state with USFS MVUM data (WA 455 on 2026-07-12, AZ 644 on 2026-07-23, the rest in row 58's sweep; CA 1,918 / CO 1,435 / ID 1,074 lead). Outputs clip to the exact state polygon. v3: closures, BLM land (most of the west's boondocking), water setbacks |
| 30 | FreeRoam-style site filters — by elevation, weather, nearby features (water, views) |  |  | 🟡 min + max elevation sliders shipped 2026-07-12 (every site carries elev_ft; persisted); weather filter built 2026-07-14 (row 56, deploy pending); nearby-feature filters still open |
| 31 | AllStays data |  |  | ⬜ commercial directory, no public API/licensing surface (checked 2026-07-12) — would require a business licensing conversation with AllStays LLC (Tim's call); not scrapeable under our policy |
| 32 | Waypoint visit status — been there / not sure / want to explore, with green/orange marker badges |  | 2026-07-12 | ✅ shipped 2026-07-12 (save modal + edit form + list + popups + GPX `<type>` round-trip) |
| 33 | Map legend button |  | 2026-07-12 | ✅ shipped 2026-07-12 — glass panel: site colors, badges, zones/packs, verified Public Land tints (USFS #cceac6, State #b3e3ef — sampled from the live layer), official USFS MVUM swatches fetched from the service legend API |
| 34 | WA DNR roads layer (state trust lands aren't in MVUM — e.g. Tim's found spot on blue state land) |  |  | ⬜ hunt a DNR road dataset on geo.wa.gov; also extend zones to state lands where dispersed camping is allowed |
| 35 | List ↔ map hover sync for search/POI results |  | 2026-07-12 | ✅ shipped 2026-07-12 (hover a row → ring on the pin; hover a pin → row highlights) |
| 36 | "Search this area" pill after panning away from a POI search |  | 2026-07-12 | ✅ shipped 2026-07-12 (>2.5 km from last search center) |
| 37 | Directions handoff on every point card (Apple Maps / Google Maps deep links) |  | 2026-07-12 | ✅ shipped 2026-07-12 — waypoints, sites, search pins, MVUM roads, zone/info cards |
| 38 | CarPlay support with compass + elevation display |  |  | ⬜ requires the native iOS (Capacitor) wrapper + CarPlay entitlement — Phase 6 territory |
| 39 | Photo attachments on waypoints |  |  | ⬜ deliberately deferred (Tim: keep it slim). Ideas when ready: resize client-side to ~200KB, store per-device in IndexedDB first; community photos later via object storage (R2/B2) — cost scales with adoption, needs a plan |
| 40 | Labels + star ratings on waypoints (quiet/cleanliness/accessibility) → future community crowdsourcing à la FreeRoam |  |  | 🟡 personal layer shipped 2026-07-12 (user-defined label chips with shared vocabulary, 3× five-star ratings, in edit form + popups + filters). Community submission/moderation = the big v2; survey-field research (iOverlander/Campendium patterns) queued with the paused research task (#7) |
| 41 | Filter waypoints by their details |  | 2026-07-12 | ✅ shipped 2026-07-12 — status / favorite / label chips on the Points tab, applied to list + map |
| 42 | Offline packs for more layers (Boondock base, satellite, chosen overlays) |  |  | 🟡 BLM Public Land overlay added as a downloadable pack 2026-07-12 (public domain). Boondock base needs a vector+glyph pack pipeline (own phase); satellite/names blocked on ESRI terms verification |
| 43 | Source + credibility on every searchable result |  |  | 🟡 shipped 2026-07-12: POI cards cite OpenStreetMap and show a record-detail tier (rich/fair/sparse — documentation completeness, honestly labeled). v2: context scoring (e.g. restroom inside a gas station = likelier real) |
| 44 | Custom waypoint pin colors |  | 2026-07-12 | ✅ reshipped 2026-07-12 per Tim — color picker lives in the waypoint save modal + edit form (per-waypoint `color` field); the Layers-tab per-category section was removed. Trailhead category recolored rose #f472b6 (amber ≈ dump orange, then teal ≈ water blue) |
| 45 | Tap trails for their identity |  | 2026-07-12 | ✅ shipped 2026-07-12 — USFS trail identify: name, motorized status, surface, tread (e.g. Church Mountain Trail: non-motorized, native surface) |
| 46 | Delete on every waypoint surface |  | 2026-07-12 | ✅ shipped 2026-07-12 — two-tap "Confirm delete?" in the marker popup, trashcan (two-tap) in the edit form, existing list delete. Same commit fixed marker popups, which had never actually opened (stopPropagation ate the map click MapLibre needs; setHTML was wiping button listeners) |
| 47 | Labels editable at save time, not just edit |  | 2026-07-12 | ✅ shipped 2026-07-12 — vocab chips + free-text add in the New Waypoint modal |
| 48 | In-app instructions (book button next to the legend ?) |  | 2026-07-12 | ✅ shipped 2026-07-12 — 8-tab Guide (Welcome opener, Map, Layers, Find, Waypoints, Offline, Phone, Credits). Same day, per Tim: both help buttons moved into the toolbar's top-right icon group (Tim confirmed he likes the placement); panels drop down top-right. **Standing rule: update Guide.jsx in the same commit as any user-facing feature change** |
| 49 | Waypoints on the phone / cross-device sync |  |  | 🟡 works today via GPX: Export (share icon) → AirDrop/iCloud → Import (folder icon) on the phone PWA; carries name, notes, coords, elevation, icon, status, favorite — NOT labels/ratings/pin colors (not in the GPX format; would need a sidecar). Documented in the Guide's Phone tab. v2: extend GPX round-trip with a Boondock extension for the missing fields, then true auto-sync (needs a backend or iCloud file strategy — design decision for Tim) |
| 50 | Copy coordinates from any point popup |  | 2026-07-12 | ✅ shipped 2026-07-12 — "Copy coords" button rides the Directions row on every point card (map click, waypoints, sites, search results, roads, trails); flips to "✓ Copied". Probe-verified the clipboard receives `lat, lng`. Fixing it surfaced + fixed a latent bug: three popups bound Save to their first `<button>`, which the new Copy button displaced |
| 51 | Topo lines visible from further out |  |  | 🟡 shipped 2026-07-12 — added the service's small-scale contour set (labels off, 0.5 opacity) fading in ~z9, handing off to index lines at z10.3. Caveat flagged: in very steep country (North Cascades test tile: ~88% inked pixels) it reads as dense terrain texture — **Tim should eyeball it**; if too busy, options are raising the fade-in to z9.5+ or dropping opacity |
| 52 | Circle around the favorite star badge |  | 2026-07-12 | ✅ shipped 2026-07-12 — dark disc + status-color ring behind the star on map pins, matching circled star in the waypoint list and the legend |
| 53 | Filter sites by type |  | 2026-07-13 | ✅ shipped 2026-07-13 — checkbox chips (All + the 5 kinds, dot-colored) in the Layers tab's Site Filter section; persisted in prefs; filters via the same setData path as the elevation filter so cluster counts stay honest. Went with always-visible inline chips instead of the suggested click-popup — one less click and discoverable; say the word to change it |
| 54 | Track recording actually records |  | 2026-07-13 | ✅ fixed 2026-07-13 — Record had never produced a point: all the downstream plumbing existed but nothing called `watchPosition`. GPS watch added (high-accuracy, error toast). Probe with mocked GPS: 4 points → live red line + status-bar count → Stop → named track saved with 0.22 mi distance. Guide's Map tab now documents it |
| 55 | Far-out topo actually renders |  | 2026-07-13 | ✅ fixed 2026-07-13 — the z9 far tiles were silently blank: a 512px export of a z9 tile is 1:577,790, 4% outside the small-scale set's 1:600k scale band, so ArcGIS returned empty PNGs. Tiles capped at z8 (in-band, overscaled through the fade). Full-strength test rendered the Cascades as a brown blanket → opacity 0.22: subtle etched relief ~z9–10.3, then index lines. Tim: judge the look live |
| 56 | Temperature trip filter — "no day above / no night below X°" + average-temp range over the next 7–16 days, drawn as a polygon of qualifying area, to pick where to head next; weather info on all features |  | 2026-07-15 | ✅ built & probe-verified 2026-07-14, committed + deployed 2026-07-15 (Pages run succeeded) — Layers → Temperature Filter: days-ahead slider (7–16, Open-Meteo's max horizon), no-day-hotter-than / no-night-colder-than / average-at-least / average-at-most sliders (°F, extreme end = Any). Viewport is sampled on a cached forecast lattice (~≤520 pts, 0.05°–6.4° cells by zoom), margins contoured by marching squares into a dashed blue polygon; site dots failing the criteria hide via the same setData path as the other filters (sites outside the sampled area stay visible — unknown ≠ failing); re-checks on pan, slider changes recompute instantly from cache. Plus a weather card on every point popup — site, waypoint, ground click, search pin, MVUM road, trail: now-conditions, 8-day strip (hover a day for detail), days-9–16 extremes + model elevation. In Guide (Map/Layers/Find/Credits), Legend, README |
| 57 | Arizona pilot — second state in the Sites + Zones data, on the existing map |  | 2026-07-23 | ✅ shipped 2026-07-23 — `spots-az.geojson`: 2,649 places (1,430 campsites, 794 RV parks, 51 dumps, 27 water, 347 trailheads; src: OSM 1,784 / Overture 813 / RIDB 52 fed campgrounds — counts from the build log) + `boondock-zones-az.geojson`: 644 slope-graded zones across the 6 AZ national forests. Pipeline now state-parameterized (`build_spots.py az …`, `build_zones.py az …`) with a new exact state-boundary clip (OSM polygon via Nominatim) — a bare bbox let in 86 out-of-state spots (Laughlin NV casinos, Needles/Blythe CA, Lake Mead, Monument Valley UT, Puerto Peñasco MX), all dropped and spot-checked. Map.jsx merges per-state files (`DATA_STATES`). Known gaps: no AZ state-lands source yet (AZ State Parks has no bulk dataset found; state trust land needs a permit — different rules than WA DNR), zones still USFS-only (most western-AZ boondocking is BLM → zones v3) |
| 58 | Populate the rest of the country — all 50 states on the existing map |  | 2026-07-24 | ✅ shipped 2026-07-24 — **93,908 places** (61,695 campsites, 19,291 RV parks, 10,563 trailheads, 1,616 dumps, 743 water; src: OSM 59,375 / Overture 32,408 / RIDB 2,098 / WA DNR 27) + **19,478 boondock zones**, one spots + one zones file per state, 49 MB total. Data loads lazily per state as the viewport reaches it past ~z4.5 (`shared/stateBounds.js`) — initial page load unchanged, national zoom loads nothing. Pipeline: boundary polygons drive both scripts (Nominatim per state), one national Overture scan split by polygon, RIDB bulk reused, 96 sequential Overpass queries with mirror rotation (1 manual retry: MO trailheads), zones swept state-by-state over ~6 h of polite USFS queries with a per-state MVUM presence probe (IA/CT/RI/NJ/DE/HI + AL/MA/MD legitimately empty — AL's forests have only 221 published MVUM features vs MS's 1,181, checked). Every file validated (parse, bounds, geometry types; CA/CO/ID caught with a GeometryCollection clip defect and rebuilt). Known gaps: no state-lands sources beyond WA DNR, zones still USFS-only (BLM = v3), Aleutians west of the antimeridian excluded |
| 59 | Saving a known location (site, search result) opens the waypoint dialog with its name pre-filled and editable |  | 2026-07-24 | ✅ shipped 2026-07-24 — site and search-pin saves now open the same New Waypoint modal as a ground click, prefilled with the location's name (selected so one keystroke replaces it), notes, kind-mapped icon, and the site's elevation; ground-click saves unchanged |
| 60 | Satellite goes blank past ~z18.5 — show the last imagery fuzzy instead |  | 2026-07-24 | ✅ fixed 2026-07-24 — ESRI serves "Map data not yet available" placeholder *images* past its coverage, which blocks MapLibre's overzoom fallback (and the base source had no request cap at all, so z18.6 requested z20 tiles). Satellite now stops requesting past z18 (reliable CONUS tier, verified against live tiles at Sand Flats z17/18/19) and scales up beyond — sharp to ~z18.5, soft past it, never blank. If somewhere lacks even z18, placeholders can still appear in the 17.5–18.5 band; drop `sourceMaxzoom` to 17 if that ever bites |
| 61 | Dump as a waypoint category (Chevron in Star Valley has dump + water; no way to mark it) |  | 2026-07-24 | ✅ shipped 2026-07-24 — teal dump icon (arrow-into-drain) in the save modal, map pins, list, colors table; site-card saves of dump stations now map to it instead of generic |
| 62 | POI search: better data + faster — the Star Valley Chevron matched Grocery but not Gas (OSM tags it `shop=convenience` only, no `amenity=fuel`; its dump/water aren't in OSM at all) |  |  | ⬜ design: (a) build a static national POI index from Overture places categories (gas, grocery, food…) queried locally — instant and offline-capable — with Overpass as the live supplement; (b) camp/dump/water chips also search the committed Sites layer first; (c) show results as each source returns instead of waiting; (d) check whether Overture carries dump/water categories at all (unverified). Real coverage fix for dump/water is row 12 crowdsourcing |
| 63 | Light day theme for the app itself — Boondock Day lightens the map but the sidebar and chrome stay dark | 2026-07-25 |  | 🟡 built + probe-verified 2026-07-25, **awaiting commit/push** — new `shared/theme.js` + `data-theme` variable blocks in `global.css`. Layers tab → **Appearance**: Auto / Dark / Light / Night Red. **Auto is the default and resolves from the basemap**, so picking Boondock Day lightens the sidebar, toolbar, popups and cards with it — the original complaint, fixed without a second setting. Light darkens the CiDR red to #C1211A (brand red on white is only 3.8:1; #C1211A is 6.0:1) and re-tints the MapLibre control icons, which a hardcoded `invert(0.92)` had made invisible on light glass. Popup inline colors now ride `--fg-rgb` / `--overlay-rgb` so they theme with everything else. Verified in the built web app: Auto+Boondock Day → light chrome, readable zoom/compass icons, ground-click popup dark-on-white with the weather card intact |
| 64 | Night red theme — dim red UI for real darkness, so the screen doesn't blow out your night vision | 2026-07-25 |  | 🟡 built + probe-verified 2026-07-25, **awaiting commit/push** — `:root[data-theme='red']` (see row 63): near-black surfaces, all foregrounds in the red band, semantic colors separated by brightness rather than hue. `--map-filter` red-monochromes the WebGL canvas only, so DOM overlays aren't filtered twice; the trade is that canvas-drawn site dots go red too, while saved-waypoint pins (DOM markers) keep their colors — stated plainly in the Guide. Verified live: whole UI + map render dim red |
| 65 | License tab in the Guide, an appropriate license for the app, and a plain-language use-at-your-own-risk / no-liability warning | 2026-07-25 |  | 🟡 built + probe-verified 2026-07-25, **awaiting commit/push** — 9th Guide tab, **License**. Kept GPL-3.0-or-later rather than changing it: it already matches the goal (free forever, and a fork can't be closed up and paywalled the way Gaia/iOverlander were), and **GPL is the right pick over AGPL precisely because the repo is private** — AGPL §13 would require offering source to every web visitor. Tab leads with a safety callout (planning tool, not a safety system), then what can be wrong and why: zones are a heuristic not permission, MVUM legality ≠ passability, sites/community reports go stale, weather is coarse-grid model output, elevation carries error. Then plain-language no-warranty / no-liability mirroring GPL §15–16, then the code-vs-data license split (GPL covers code only; ODbL / CC-BY / public-domain terms govern the data). Same disclaimer added to README above the License section. **Open question for Tim:** serving GPL'd JavaScript to every visitor is arguably *conveying* under GPL §0, which would trigger the source-offer duty while the repo is private. Unresolved in law and not resolved here — cleanest fix is making the repo public (matches row 8's "free for everyone + public"), otherwise link a source tarball from the app |
| 66 | In-app feedback that becomes a GitHub issue — open to anyone, no GitHub account required, and free to run | 2026-07-25 |  | 🟡 **Worker live 2026-07-25**; in-app button + dialog verified rendering against the deployed URL. Repo secrets added 2026-07-26, arming `feedback-issues.yml`. **Left: merge + push.** The admin token's correctness can't be read back from GitHub — the first workflow run is what proves it. Speech-bubble button in the toolbar → dialog (bug / idea / map data / other, 2,000 chars, optional contact) → `POST /feedback` on the existing Worker → KV. A new nightly `feedback-issues` Action pulls `/feedback-export`, opens one labelled issue each using **the workflow's own `GITHUB_TOKEN`**, then calls `/feedback-filed` so nothing files twice. **No GitHub credential is ever stored in Cloudflare** — a compromised Worker can't touch the repo — and no GitHub account is needed to file. Costs nothing: verified against Cloudflare's docs that the free plan is 100k requests/day with no card required. Verified against `wrangler dev`: valid submit, short/unknown-kind rejected, profanity rejected, link held + withheld from export then released via `/moderate`, a contact **email does not** trip the email filter, admin endpoints 401 without token, IP hash stripped from every export, ack idempotent, malformed ids ignored, per-IP isolation, daily limit trips on the 6th. Found and fixed a real bug doing this: `bumpRateLimit` defaulted only `{spots, actions}`, so `cur.feedback++` produced NaN and `NaN >= limit` silently disabled the limit — now reads `Number(cur[field]) || 0`. **Both nightly Actions fixed + verified green 2026-07-29:** the Cloudflare UA ban (403, see row 12) also hit `file_feedback.py`, and separately `feedback-issues.yml` set `permissions: issues: write`, which zeroes every other scope — so `actions/checkout` had no `contents: read` and died with "repository not found" (exit 128) before the script ran. Added `contents: read` + a real UA; a manual run now succeeds ("No pending feedback"), which also proves the admin token is right |
| 67 | Weather card said "Forecast unavailable — needs a connection" on first load while actually online — fix the cause or word it honestly | 2026-07-25 |  | 🟡 fixed + probe-verified 2026-07-25, **awaiting commit/push** — the old copy asserted a cause it hadn't checked. Root cause not reproduced; the Open-Meteo call itself was confirmed healthy (HTTP 200 for the reported coordinate) and the service worker passes cross-origin through, so first-load failures look transient. `weather.js` now retries twice (400 ms, 1.2 s) on network errors, 429s and 5xx — permanent 4xx aren't retried — and the card says only what's known: *No connection* only when `navigator.onLine` is false, *Weather service is busy* on 429, otherwise *Couldn't load the forecast*, each with a **Retry** link. Verified by stubbing fetch: failure → "Couldn't load the forecast · Retry" → Retry with the network back → full forecast |
| 68 | Max elevation slider should top out at the highest point in the US — currently caps at 8,250 ft | 2026-07-25 | 2026-07-26 | ✅ fixed 2026-07-26 — ceiling was 8,250 ft, which silently hid every site above it. Now 20,500, clearing **Denali at 20,310 ft**, the highest point in the US per the 2015 USGS GPS resurvey (three independent analyses agreed; the old 20,320 figure came from 1950s-era technology). Both sliders raised, so "above 10,000 ft" is now expressible too |
| 69 | Wildfire locations + smoke layer — find the most accurate free source | 2026-07-25 |  | ⬜ Tim's reference (2026-07-25): **AirNow Fire and Smoke Map** (fire.airnow.gov, EPA + US Forest Service) — his favorite. Its layers: permanent/temporary AQI monitors + low-cost air sensors (NowCast AQI PM2.5), **NOAA satellite smoke plumes** (light/medium/heavy polygons, afternoon scans, not visible at night or through cloud), **smoke outlooks**, and fire locations. Check each underlying feed for a public endpoint + terms before building |
| 70 | Site popup `Website` links don't restrict the URL scheme — a crafted OSM `website` tag could yield a clickable `javascript:` link | 2026-07-25 | 2026-07-25 | ✅ fixed 2026-07-25 — new `safeUrl()` in `Map.jsx` accepts only http/https; scheme-less OSM hosts are upgraded to https, everything else drops the link. Node-checked against `javascript:`, mixed-case `JavaScript:`, leading-whitespace variants, `data:`, `vbscript:`, `file:` and non-URLs |
| 71 | Electron runs with `webSecurity: false` for local tile files that offline packs no longer use | 2026-07-25 | 2026-07-25 | ✅ fixed + probe-verified 2026-07-25 — the real fix wasn't flipping the flag. The renderer now loads from a registered `app://` scheme (`registerSchemesAsPrivileged` + `protocol.handle`, path-traversal guarded) instead of `file://`, giving it a real secure origin, so `webSecurity` is simply on. Verified by running the actual `main.js` under Electron with `BOONDOCK_FORCE_PROD=1`: origin `app://boondock`, `isSecureContext: true`, `webSecurity: true`, renderer mounted, MapLibre canvas present, and every cross-origin call still 200 (Open-Meteo, OpenFreeMap, Nominatim) plus bundled state data — **zero console errors** |
| 72 | Workers KV free tier allows 1,000 writes/day and each report costs 2 — document the real community ceiling | 2026-07-25 |  | ⬜ |
| 73 | "Current state of the app (verified 2026-07-11)" section is stale — lists bugs since fixed | 2026-07-25 |  | ⬜ |
| 74 | Make the sidebar sections collapsible | 2026-07-25 | 2026-07-26 | ✅ done + probe-verified 2026-07-26 — all five Layers sections (Base Map, Appearance, Overlays, Site Filter, Temperature Filter) fold from their headers, with a rotating caret, persisted per device in localStorage. Adding Appearance had pushed the filters below the fold, which is what made this worth doing. Verified: collapse hides the block, state persists, reopening restores it |
| 75 | Packaged Electron app points at the wrong renderer path (`../dist` from `src/main` resolves to `src/dist`) — silent white window | 2026-07-25 | 2026-07-25 | ✅ fixed + probe-verified 2026-07-25 — `path.join(__dirname, '../dist')` from `src/main` resolved to `src/dist`, which doesn't exist, so a packaged build would have shown an empty window. electron-builder packs `dist/**` and `src/main/**` as siblings, so the path needed two levels up. Also added a `did-fail-load` handler so a bad renderer path logs the reason instead of silently showing white |
| 76 | Point popup grows taller when the weather card loads, pushing its top off the map edge — reserve the space or reposition after load | 2026-07-25 | 2026-07-25 | ✅ fixed 2026-07-25 — `keepPopupInView()` runs after the weather card is injected: re-anchors the popup (MapLibre re-picks the anchor inside `setLngLat`, so it can flip below the point) then pans the map by any remaining overhang on any edge, skipping the pan when the card is taller than the viewport. Wired through all 8 `attachWeather` call sites |
| 77 | **Crash:** unguarded `fs.watch` on the iCloud waypoints file throws EPERM and kills the main process with a JS error dialog | 2026-07-25 | 2026-07-25 | ✅ fixed + probe-verified 2026-07-25 — `fs.watch` on the iCloud file threw EPERM from a bare `setTimeout`, so it killed the main process with a JS error dialog. Now caught, with the macOS Full Disk Access remedy in the message, plus an async `error` handler; live sync degrades to off instead of crashing. Same pass found saves silently failing: `waypoints/tracks/prefs:save` threw into unhandled IPC rejections, so they now go through `writeJsonSafe()` (temp file + atomic rename, cleans up on failure, returns `{ok:false,error}`) and `ensureSyncDir()` is guarded. Verified under Electron: warning logged, app runs on. **The EPERM itself is a macOS privacy setting on Tim's machine — grant Full Disk Access to restore iCloud sync** |
| 78 | State forest roads for every state, not just the WA DNR gap in row 34 — plus the camping rules that go with each state's land | 2026-07-25 |  | ⬜ |
| 79 | All highway rest stops, with a Rest Stop pill in the search chips | 2026-07-25 | 2026-07-26 | ✅ done + verified against live Overpass 2026-07-26 — **Rest stop** pill added (`highway=rest_area` + `highway=services`, 60 km radius since rest stops are rural and sparse). Found a real Overpass gotcha doing it: **any value regex on the `highway` key returns nothing** — `["highway"="rest_area"]` found Bitter Creek Rest Area on I-80 but `["highway"~"rest_area"]` found zero, across anchored and unanchored forms. Categories now accept an array of exact selectors instead, each getting its own node+way pair. Live query returns 5 near Rock Springs WY: Bitter Creek Rest Area both directions, Flying J, Love's |
| 80 | Boondock Zones are hard to see on the Boondock Day basemap — the fill/stroke was tuned for the dark base | 2026-07-25 | 2026-07-25 | 🟡 built 2026-07-25, **needs Tim's eye** — zone fill/stroke is now chosen from the basemap: Boondock Day gets a deeper green (#0b7a4a) at 0.22 fill with a firmer 1.4px outline, night and satellite keep the mint #34d399 at 0.12. Applied both when the layer is added and on basemap change. Not visually confirmed — the browser pane's WebGL canvas stopped rendering during testing, so the colour needs an eyeball on the real app |
| 81 | The Auto appearance swatch looks crude — make it nicer | 2026-07-25 | 2026-07-25 | ✅ done 2026-07-25 — the 135° diagonal hard stop antialiased into a jagged edge; now a clean vertical half-and-half with an inset ring so it matches the solid swatches beside it |
| 82 | MVUM roads (and other on-demand USFS layers) sometimes don't draw at all — seen in GA at z13 and WA at z10.4 with the toggle on; layers seem to "crash" intermittently | 2026-07-25 |  | 🟡 **diagnosed 2026-07-25 — not an app bug.** The whole USFS ArcGIS host is down: `apps.fs.usda.gov/arcx` returned **HTTP 500** with an Esri "Application Error" page for the MVUM export endpoint, the MVUM service root, *and* the trails service, on repeated retries — and the **entire `/arcx/rest/services` root** 500s, not just the layers in use, while `www.fs.usda.gov` itself returns 200. **Not a rate limit and not Tim:** a fresh anonymous request from an unrelated machine with no prior traffic gets the same 500 on the trivial metadata endpoint; throttling returns 429 and a block returns 403. MVUM and trails are rendered on demand by that host, so when it errors the overlay just doesn't draw. Mitigated: the map now listens for source errors and toasts "<layer> isn't loading right now — the service that draws it isn't responding", once per source, only when the overlay is switched on, so an upstream outage no longer reads as a broken app. **Still open — the real fix is not depending on their uptime:** pre-render MVUM/trails into self-hosted PMTiles (already the Phase 2 plan, and it fixes the slowness too) |
| 83 | Self-host MVUM + trails as PMTiles instead of rendering them live off USFS servers | 2026-07-25 |  | ⬜ **Now concrete** — sources verified reachable 2026-07-25 *while the live service was down*, because bulk download is a different host (`data.fs.usda.gov`, HTTP 200): `S_USA.Road_MVUM.zip` **224.8 MB** and `S_USA.TrailNFS_Publish.zip` **219.2 MB** (also `S_USA.RoadCore_FS.zip` 412 MB, a superset of all FS roads). US public domain, so no licensing barrier. Fixes three things at once: immune to USFS outages (row 82), removes the per-tile server render that makes these layers slow, and makes them work in offline packs — which is the app's whole point. This is the Phase 2 PMTiles plan, now with verified sources and sizes |
| 84 | Once we self-host USFS data, schedule an update check against the upstream source and compare it to what we have — stale road/trail data must not go unnoticed | 2026-07-25 |  | 🟡 built + run against live sources 2026-07-25, **awaiting commit** — `data-pipeline/upstream_sources.json` registers each bulk dependency; `check_upstream.py` HEADs them weekly (`.github/workflows/upstream-check.yml`) and compares `Last-Modified` / `ETag` / `Content-Length`, so a check costs nothing rather than ~450 MB. Verified all three sources expose those validators. It separates two states that are not the same: *upstream moved since we looked* (new data to pull) and *upstream differs from `built_from`* (*what we publish is behind* — keeps reporting until a rebuild ships). Opens **one** issue and comments on it thereafter instead of one per week. **Finding worth acting on: both MVUM and trails bulk files were last modified 2025-05-11 — 440 days old.** So self-hosting costs less freshness than it looks, but it also means the bulk export may itself have stopped updating; worth confirming against a forest's published MVUM before trusting it |
| 85 | Standing policy: treat US federal datasets as at risk — mirror a backup when we first depend on one, keep using upstream while it's there | 2026-07-25 | 2026-07-25 | ✅ done 2026-07-25 — Tim's call: assume public data may be withdrawn, paywalled, or quietly stop updating. **All three USFS datasets now mirrored and checksum-verified in `~/data/cidrlab/boondock_map` (868 MB).** `mirror_upstream.py` writes atomically (a killed run leaves only a `.part`, never a half-file passing as a backup — which is exactly what happened on the first attempt and why nothing was corrupted), adopts an already-complete copy instead of re-pulling hundreds of MB, and records location + sha256 + upstream stamp; `--verify` re-hashes to catch bitrot or a deleted archive. `check_upstream.py` flags any dependency with no backup. **Convention (Tim, 2026-07-25): saved data lives in `~/data/[org]/[repo]/`; anything ≤20 MB is committed to the repo instead, since GitHub refuses files past 100 MB.** Tim's read is that Census is comparatively safe via the Minnesota Population Center (IPUMS/NHGIS) — his assessment, not verified, not extended to other agencies. Still to do: same posture across the other repos |
| 86 | Legend needs real detail for Public Land — it names only USFS and state, then punts with "other tints follow BLM's palette", so a checkerboard or tan block is unreadable | 2026-07-25 | 2026-07-25 | ✅ done + probe-verified 2026-07-25 — legend now lists **all 13 surface-management agencies** with their real tints instead of naming two and punting. Getting the colours honestly took three tries: the cached tile service's `/legend` endpoint returns swatch PNGs that are **fully transparent** (mid-pixel `[0,0,0,0]`, decoded to confirm) and its renderers are transparent placeholders, so both would have rendered 13 invisible rows. The working source is the sibling `lands/BLM_Natl_SMA_LimitedScale` renderer, which carries real RGBA. **Self-validating: its USFS `#cceac6` and State `#b3e3ef` exactly match the two values this legend already hardcoded**, which is what confirms it's the same palette the tiles draw. Hardcoded rather than fetched, deliberately — the legend has to work offline. Ordered by what a boondocker cares about (BLM/USFS/State first, Private-or-unknown last), outlined so the near-white tints are visible, and annotated with the two things the colours don't tell you: that BLM/USFS generally allow dispersed camping and others generally don't (rule of thumb, not permission), and that a checkerboard means ownership alternates section by section |
| 87 | Legend says the MVUM legend is "unavailable offline" whenever it fails to load — same misattribution as row 67; today it's actually the USFS 500 | 2026-07-25 | 2026-07-25 | ✅ fixed 2026-07-25 — same class of bug as row 67. The legend claimed "unavailable offline" for any failure; today's cause was actually the USFS 500. Now distinguishes `navigator.onLine === false` ("needs a connection") from a service fault ("the USFS service isn't responding"), and the fetch checks `r.ok` instead of treating an error page as success. Verified live: with USFS down it correctly reads *"Legend unavailable — the USFS service isn't responding"* |
| 88 | Dragging the map tilts/rotates it into 3D by accident — a north-up planning map shouldn't pitch | 2026-07-26 | 2026-07-26 | 🟡 done 2026-07-26, **needs your trackpad to confirm** — `touchPitch: false` and `touchZoomRotate.disableRotation()` remove the two-finger accidental paths; right-drag / ctrl-drag still tilts and rotates, so 3D stays available deliberately, as you asked. Compass now shows pitch (`visualizePitch`) and clicking it resets bearing **and** pitch, which MapLibre's own handler doesn't do — previously a pitched map had no obvious way back to flat. I can't reproduce a trackpad gesture headlessly, so the accidental-trigger fix is unverified by me |
| 89 | Live instrument cluster from the phone's own sensors — compass, speed, and elevation readouts, "live, based on the location, direction, and elevation of the phone", with a horizontal compass ribbon like Gaia's trip bar but styled as our own design; shown/hidden by its own toggle button (Tim's call, 2026-07-27). In-app counterpart to row 38's CarPlay idea | 2026-07-27 | 2026-07-27 | 🟡 built + headless-verified 2026-07-27, **needs your iPhone to confirm** — the gauge button under Locate toggles a glass cluster top-center: elevation + speed cells over a sliding compass ribbon (red caret, red N, 8-wind tape, 16-wind reading). The heading names its source: *mag* = magnetometer (magnetic north — no declination correction yet, a candidate follow-up row), switching to *gps* = GPS course (true north) above ~5.6 mph with hysteresis, since a phone magnetometer inside a vehicle isn't trustworthy. Elevation samples the same Mapzen DEM as everything else at the live fix, falling back to GPS altitude tagged *gps* when the tiles are unreachable — they're online-only. Also removed the dead `showUserHeading: true` (a MapLibre v5 option our 4.7.1 silently ignores; the v5 upgrade is the future path to a heading arrow on the location dot). Verified by driving the real app headless in Brave with a stubbed GPS feed and real DeviceOrientationEvents: DEM beats a planted-absurd GPS altitude (3,042 ft shown, not 98 ft), 19.5 m/s → 44 mph, 247° course → WSW *gps* while moving, α=45 → 315° NW *mag* at rest, S3 blocked → 4,265 ft *gps* fallback, a sensorless desktop degrades to an honest "no compass" line after 4 quiet seconds, toggling releases the GPS watch (watch/clear counts stayed balanced through rapid toggling), phone layout clears the toolbar by 12px with a 44px button, and all three themes screenshotted. **Untestable off-device, waiting on your phone:** the iOS motion prompt and silent re-grant, real magnetometer accuracy, the landscape screen-angle sign, the mag→gps handoff while actually driving, and standalone-PWA sensors. **Office test 2026-07-28:** compass confirmed working on the iPhone; elevation sat blank. Cause found and reproduced headless: fixes stream about once a second and the code cancelled the in-flight DEM lookup on every new fix — with 1.6 s tile latency (cellular-ish) the cell stayed blank forever, with or without GPS altitude. Fixed same day: lookups are never cancelled (a sequence number keeps the newest answer, and any answer beats an empty cell), GPS altitude shows immediately while the tile loads, and blank cells retry on the next fix. Re-verified in the same streaming-latency harness: gps-tagged 394 ft at 1 s → DEM 3,042 ft by 3 s, and DEM still lands by 3 s with altitude null. **Tim confirmed on the iPhone in his office 2026-07-28: compass and elevation both working.** Flips ✅ after a drive checks the rest: the mag→gps handoff in motion, the landscape screen-angle sign, silent motion re-grant on a later visit, and the installed-PWA case |
| 90 | Navigate to a point with the compass: pick a target and get straight-line guidance — a line on the map to the point, distance, and the compass ribbon showing which way to turn | 2026-07-28 | 2026-07-29 | 🟡 built + headless-verified, **pushed to main 2026-07-29 (deploys via Pages); needs your phone to confirm** the turn-as-you-drive feel — every point card (waypoints, sites, search results, ground clicks) now has a green **Guide me here** button. It sets a target, auto-shows the live readout, draws a dashed green beeline from your GPS fix to the destination (ring on the target), and adds a nav row (name + straight-line distance + turn hint like "100° left") plus a green target pip on the compass ribbon (an edge arrow when the target is past the visible ribbon). Straight-line only, honestly labeled as-the-crow-flies; the × on the nav row, or closing the readout, stops it. Foundation refactor: row 89's GPS/heading/elevation logic is now a shared `useLiveSensors` hook so rows 89/90/95 share one watch. Verified headless (Brave, stubbed GPS moving east at 22 mph): Guide me here → nav row reads 7.8 mi matching the 7.78 mi great-circle, ribbon pip present, cancel clears the line; the row-89 cluster is unchanged (90° E gps, 22 mph, elevation). Row 91 (real routing) still waits on row 83's PMTiles graph |
| 91 | Real routing to a point over MVUM roads and trails — shortest path (and alternates) along legal dirt roads like Google/Apple do on pavement, ideally fully in-app and offline | 2026-07-28 |  | ⬜ needs a routable graph built from the self-hosted MVUM + trails data (row 83's PMTiles pipeline is the natural source) plus an in-app shortest-path engine; big but feasible — scope after rows 83 and 90 |
| 92 | Browser-tab favicon shows white corners on dark tab UI — the rounded artwork was flattened onto an opaque white square | 2026-07-28 | 2026-07-28 | 🟡 fixed 2026-07-28, **needs your tab to confirm** — icon-192/512 re-rendered from icon.svg onto a transparent canvas (the vector art was always fine; the old export flattened it onto white). Pixel-verified: corner alpha 0, navy #19222C and mountain #e8eef4 exact; eyeballed over a dark tab background at 16/32/96 px. apple-touch-icon deliberately untouched — iOS wants full-bleed opaque and applies its own mask. Browsers cache favicons stubbornly, so the old corners may linger until a hard reload or a fresh tab |
| 93 | Save a waypoint on the phone — drop one at the phone's current location, or at a spot you pick on the map | 2026-07-28 | 2026-07-29 | 🟡 built + headless-verified, **pushed to main 2026-07-29 (deploys via Pages); needs your phone to confirm** the live GPS prompt and the drag-by-finger feel before ✅ — a new **add-pin control** (MapPinPlus, bottom-right under the gauge) opens a small glass chooser with the two modes Tim asked for. **At my location** takes one `getCurrentPosition` fix and opens the New Waypoint modal there, name prefilled "My location" and selected so one keystroke renames it (row 59 pattern), elevation sampled after save like every other drop; a denied/failed fix shows an honest inline error, not silence. **Pick on the map** arms a pick mode (control lights, crosshair cursor, "Tap the map to place your waypoint" hint) whose next tap opens the modal straight at that point, skipping the info card; tapping the control again or Escape cancels. Mobile-first, but present on every platform. Verified by driving the real app headless (Brave + puppeteer, stubbed GPS): control renders, both modes listed, at-location opens at the exact fix (44.27050, −121.17300) with the prefilled name, pick-mode arms and its map tap opens the dialog at the tapped coordinate then clears, the saved point persists, the control is a 44 px thumb target at phone width, and the chooser themes correctly in light + night-red. Guide (Map + Waypoints tabs) updated |
| 94 | When editing a waypoint, drag its pin to a new spot to change the location | 2026-07-28 | 2026-07-29 | 🟡 built + headless-verified, **pushed to main 2026-07-29 (deploys via Pages); needs your phone to confirm** drag-by-finger before ✅ — opening a waypoint in the editor makes its map pin draggable (soft accent pulse + grab cursor, plus a "Drag the pin on the map to move it" hint and a live coordinate line in the edit form); dropping it rewrites the waypoint's lat/lng and re-samples elevation at the new spot. The editing waypoint's id is lifted from the sidebar up to App and passed to the map. **Two real bugs found + fixed while verifying:** (1) MapLibre 4.7.1 will not attach drag handlers to a *custom-element* marker through `setDraggable(true)` after construction — isolated headless (born-draggable moves; setDraggable-after does not) — so the editing pin is now *recreated born-draggable* when edit begins; (2) App handed the map `waypoints.filter(...)`, a fresh array every render, and every mousemove fires `setMapCursor`, so the marker effect re-ran on each mouse move and reset the pin to its stored coords *mid-drag*, snapping it back — memoizing the filtered list (`useMemo`) fixed the drag and also removed the per-mousemove marker churn. Verified end-to-end headless: edit → pin draggable → drag drops it from 44.27050,−121.17300 to 44.26804,−121.16699, the editor coord line updates live, elevation re-samples (3,003 → 3,005 ft), and leaving the editor clears the draggable state. Pairs with row 93; Guide's Waypoints tab documents it |
| 95 | Full-screen instrument mode — a standalone compass + speed + elevation (+ optional coordinates) screen, "like a handheld compass" and nothing else | 2026-07-28 | 2026-07-29 | 🟡 built + headless-verified, **pushed to main 2026-07-29 (deploys via Pages); needs your phone to confirm** on-device sensors — the expand button in the toolbar opens a full-screen takeover: a rotating **compass dial** (forward-facing, red heading pointer + red N) or a big-**Numbers** style, with **Speed** + **Elevation** (+ optional **Coordinates**) readouts, in both portrait and landscape. The gear opens settings: an on/off toggle **per element**, a compass-style chooser (Dial / Numbers), a speed-size slider, and a **punch-in target bearing** (N/E/S/W quick buttons or a typed degree) that shows a turn hint ("90° left"). Feeds off the shared `useLiveSensors` hook (row 89); settings persist in localStorage. Verified headless: dial + heading render, style switch, coords toggle, bearing punch → correct turn, portrait + landscape, close, and persistence across reopen. Found + fixed a bug in verification — the full-screen used a nonexistent `--bg` var so the backdrop was transparent (map/sidebar showed through); now `--bg-primary`, opaque and theme-aware (dark / light / night-red). The "steer toward a bearing" piece reuses row 90's compass logic |
| 96 | BLM roads overlay — the drive-able road network on BLM land (the West's dispersed-camping backbone), beyond USFS MVUM | 2026-07-29 | 2026-07-30 | ✅ shipped + verified 2026-07-30, deployed to main — a new **BLM Roads** overlay (off by default) drawing BLM's *Roads Managed for Public Motorized Use* (solid) + *...Limited Public Motorized Use* (dashed) from BLM's public `Public_Display` GTLF MapServer (layers 0+1; trails 2–7 excluded), restyled burnt-orange `#c87830` via dynamicLayers so it reads on both the dark and Day bases and stands apart from the sky-blue trails; live per-tile export like MVUM, z7+. Tap a road → popup with its name (`ROUTE_PRMRY_NM`, blank on BLM's many unnamed routes → "BLM road"), public/limited designation, a not-permission disclaimer, weather, and Guide-me-here (row 90). Source verified: national, **US public domain**, export returns real roads (24–29 KB PNGs over Moab vs ~2 KB empty ocean), `supportsDynamicLayers`. Headless-verified 7/7 (Brave): off by default, toggles on and requests BLM export tiles, renders on dark + Day bases (screenshots read — Chicken Corners Rd area near Moab), tap-identify opens the BLM popup with a Guide button. Legend (Lines) + Guide (Layers) updated. **Live-overlay caveat (standing rule):** shares MVUM/trails' uptime risk (row 82); the offline/robust fix is row 83's PMTiles self-host, which will pull + mirror + tile MVUM/trails/BLM/RoadCore together |

| 97 | Extend upstream freshness monitoring to everything, not just the 3 USFS bulk files — check how often each road/data source actually updates and flag staleness | 2026-07-30 |  | ⬜ Tim's request 2026-07-30. Audit 2026-07-30 found: **USFS RoadCore/MVUM/trails bulk are frozen at 2025-05-11 (~14.5 months, verified via HEAD)** — not updated often; the live USFS service is unreliable (count query timed out, row 82's flaky host). `check_upstream.py` (weekly) covers those 3 bulk files. **Blind spots with no staleness monitoring:** the live BLM roads overlay (row 96, just shipped), and the per-state Sites/Zones data (point-in-time OSM/Overture/RIDB/WA DNR snapshot from the 2026-07 national build). Plan: register the BLM GTLF + a Sites/Zones snapshot-date in `upstream_sources.json` (or a sibling), teach `check_upstream.py` to report each source's age + cadence, and record a `snapshot_date` for the OSM/Overture-derived data so a rebuild trigger is visible |
| 98 | Self-host USFS RoadCore (all Forest Service roads) as PMTiles, rendered as an overlay | 2026-07-29 | 2026-07-30 | ✅ shipped + verified 2026-07-30, deployed to main — **the app's first self-hosted, offline-capable vector layer.** New **All FS Roads** overlay (off by default) rendering the entire USFS RoadCore network (367,666 roads) from one `web/public/data/roadcore.pmtiles` served free from Pages over HTTP range requests (no tile server, no third-party dependency, works offline). Open roads (maintenance level ≥2) draw solid khaki `#c2b280`; closed roads (level 1 = "basic custodial care (CLOSED)", 40% of the data) draw faded grey dashes underneath — so "a road exists" never reads as "you may drive it." Tap → name, open/closed designation, maintenance, surface, a not-permission disclaimer, weather, and Guide-me-here. Pipeline: ogr2ogr (reproject NAD83→WGS84 + computed integer maint level) → tippecanoe (z7–12, simplify + drop-densest) → 57 MB PMTiles; `pmtiles` protocol registered in MapLibre. `built_from=2025-05-11` stamped in `upstream_sources.json` so row-97 monitoring flags a future refresh. Headless-verified 9/9 (Brave): off by default, range-fetches the archive (11 requests, not whole-file), 34 roads render over Mt Hood (open + closed), tap opens the RoadCore popup ("Historic Westleg Rd · Open road"), and it renders with **zero USFS/BLM calls**. Legend + Guide updated. **Size note:** the 57 MB tileset is committed to the repo — well over the 20 MB backup norm, but it's a served feature asset (not a backup) and the free-hosting path Tim chose; range requests mean users only fetch the tiles they view, not the whole file. This stands up the PMTiles pipeline row 83 will reuse for MVUM/trails/BLM. **Freshness:** source is 14.5 months stale (row 97) — acceptable, roads change slowly and it's now monitored |

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

The original 2026-07-11 audit list, re-checked against the code 2026-07-25.
Everything below is stated from a file read this session, not from memory.

1. ~~**Offline packs are write-only.**~~ **FIXED 2026-07-11** — Phase 2 shipped
   a shared offline engine (`shared/offlineTiles.js`): packs in IndexedDB,
   served via a `boondock://` MapLibre protocol, verified end-to-end with
   network emulation.
2. ~~**Track recording records nothing.**~~ **FIXED 2026-07-13** (row 54) — the
   GPS watch was never started; `watchPosition` added and probe-verified.
3. ~~**Deleting the last waypoint doesn't stick.**~~ **FIXED 2026-07-11** —
   saves now gate on load completion.
4. Minor items, split by what re-checking found:
   - ~~waypoint names/notes injected into popup HTML unescaped~~ **FIXED** —
     `esc()` is applied to every interpolated name, note, label, and comment in
     `Map.jsx` (re-read 2026-07-25; the only unescaped colour left is the
     marker SVG's own stroke, which takes no user input).
   - ~~`website` links render whatever scheme the data carries~~ **FIXED
     2026-07-25** (row 70) — new `safeUrl()` allows only http/https, so a
     crafted OSM `website` tag can't produce a clickable `javascript:` link.
     Unit-checked against `javascript:`, `data:`, `vbscript:`, `file:` and
     scheme-less hosts.
   - **`webSecurity: false` is still set** (`main/main.js`, row 71). The
     comment blames local tile files, but offline tiles now come from IndexedDB
     through a MapLibre protocol handler that never touches the network stack,
     so the stated reason is gone. Flipping the flag alone is *not* the fix:
     production loads the renderer with `loadFile()`, i.e. a `file://` opaque
     origin, so enabling web security there changes how every cross-origin API
     call is treated. Proper fix is to serve the renderer from a registered
     custom protocol with a real origin, then turn security on.
   - **Nominatim/Overpass still send no identifying User-Agent** (still open,
     and the app is now public at boondockmap.com). Note browsers forbid
     setting `User-Agent` from `fetch`, so on web this can only be satisfied by
     the `Referer` the browser already sends; Electron is where an explicit
     identifier is actually settable. Nominatim's current policy was **not**
     re-verified this session (fetch attempts failed) — confirm before relying
     on this reading.
   - **In-memory MBTiles build still eats RAM** on the Electron download path:
     `new SQL.Database()` builds the whole archive in memory and `db.export()`
     materialises it again before the single `writeFileSync`
     (`main/main.js`). Only affects desktop pack downloads; the web/IndexedDB
     path is unaffected.

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
