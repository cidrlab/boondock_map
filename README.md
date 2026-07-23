# Boondock Map

**An offline-capable topographic map for boondocking, off-road exploration, and hiking — built to replace Gaia GPS and CalTopo with something faster, cleaner, and fully yours.**

---

## What It Is

Boondock Map is a desktop + web mapping application built on [MapLibre GL JS](https://maplibre.org/), [React 18](https://react.dev/), and [Electron](https://www.electronjs.org/) — the web version is a PWA at **https://cidrlab.org/boondock_map/**, installable on iPhone. It layers free and open sources — our own Boondock basemap (OpenFreeMap/OpenMapTiles + Mapzen terrain), USGS, ESRI, OpenStreetMap, Overture, USFS, and BLM — into a polished interface optimized for field use and trip planning. Roadmap: [VISION.md](VISION.md).

Waypoints and tracks sync automatically to iCloud Drive, making your saved spots available on iPhone (via Files app or any app with iCloud access).

---

## Features

- **The Boondock basemap:** our own designed terrain map — vector tiles + hillshade relief in the CiDR palette, hairline roads, mountain peaks labeled with elevation in feet
- **Satellite base** (ESRI World Imagery) with a **Topo Overlay** blend — USGS contour lines and elevation figures over the imagery
- **Sites database:** baseline camping layer — campsites, RV parks, dump stations, water fills, and trailheads as tappable, clustered map points with save-as-waypoint (7,100+ places across Washington and Arizona from OSM, Overture, Recreation.gov, and WA DNR)
- **MVUM Roads overlay:** the true USFS Motor Vehicle Use Map — which forest roads are legal to drive
- **More overlays:** Hiking Trails (USFS/NPS), Names & Labels, BLM Public Land status
- **Waypoints:** Save, edit, categorize, and color-code locations with icons (camp, trailhead, viewpoint, fuel, water, hazard, etc.)
- **GPX import:** Load existing GPX files for tracks and waypoints
- **Offline maps:** Download any area (drawn box or current view) at your chosen zoom range into a local pack — the map serves pack tiles automatically when you're offline. Works on desktop and web/iPhone. USGS Topo only for now; other layers await tile-service terms verification (VISION.md).
- **Track recording:** Record GPS tracks — live line and point count while recording, saved with distance on stop (GPS quality is best on the phone PWA)
- **Weather:** a 16-day Open-Meteo forecast card on every point popup (sites, waypoints, map clicks, roads, trails, search results), plus a **Temperature Filter** — set "no day hotter than", "no night colder than", or an average-temperature range over the next 7–16 days; a dashed blue polygon shades where the forecast fits and sites outside it are hidden
- **Search:** Nominatim geocoder (place names, addresses, coordinates), biased to your current map view
- **POI search:** Nearby points of interest via Overpass/OpenStreetMap — gas, food, groceries, campgrounds, water, restrooms, trailheads, picnic sites, viewpoints, lodging
- **Search history:** Last 3 searches shown on focus; full history available; persistent across sessions
- **Coordinate input:** Type/paste lat/lng or DMS coordinates to fly to a location
- **Viewport persistence:** App reopens at exactly where you left off (center, zoom, base layer, active overlays)
- **iCloud sync** (desktop): Waypoints, tracks, preferences, and search history stored in `~/Library/Mobile Documents/com~apple~CloudDocs/BoondockMap/`
- **Dark theme:** CiDR Lab brand palette — deep navy, red accent, cool blue text

---

## Screenshots

_Coming soon_

---

## Tech Stack

| Component | Technology |
|---|---|
| Desktop shell | Electron 29 |
| Renderer | React 18 + Vite 5 |
| Map engine | MapLibre GL JS 4 |
| Tile sources | USGS National Map, ESRI World Imagery, OSM, USFS, BLM |
| Geocoding | Nominatim (OpenStreetMap) |
| POI search | Overpass API (OpenStreetMap) |
| Weather | Open-Meteo forecast API (CC-BY 4.0) |
| Storage (desktop) | iCloud Drive via Node.js fs + IPC |
| Storage (web) | IndexedDB (hand-rolled, no deps) |
| Styling | CSS custom properties, DM Sans font |

---

## Project Structure

```
boondock/
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.js         # App window, IPC handlers, iCloud sync
│   │   └── preload.js      # Context bridge (exposes safe API to renderer)
│   ├── renderer/           # React UI
│   │   ├── App.jsx         # Root component, state, IPC wiring
│   │   ├── components/
│   │   │   ├── Map.jsx     # MapLibre GL map, layers, markers, track recording
│   │   │   ├── Sidebar.jsx # Search, waypoint list, layer picker, POI, overlays
│   │   │   ├── Toolbar.jsx # Top bar: layers, record, import/export, download
│   │   │   ├── StatusBar.jsx
│   │   │   ├── WaypointModal.jsx
│   │   │   ├── DownloadModal.jsx
│   │   │   └── Icons.jsx   # SVG icons + waypoint color palette
│   │   └── styles/
│   │       ├── global.css  # CSS variables (CiDR brand theme)
│   │       └── app.css     # Layout
│   └── shared/             # Used by both desktop and web
│       ├── layers.js       # Tile source definitions (base layers + overlays)
│       ├── useGeocoder.js  # Nominatim geocoder hook
│       ├── usePoiSearch.js # Overpass POI search hook
│       └── parseCoords.js  # Coordinate string parser (DD, DMS, decimal)
├── vite.config.js
└── package.json

web/                        # GitHub Pages PWA (live) — window.boondock shim over IndexedDB
```

---

## Getting Started (Desktop)

### Prerequisites

- macOS (Apple Silicon or Intel)
- Node.js 20+
- npm 10+

### Install & Run

```bash
# Clone the repo
git clone https://github.com/cidrlab/boondock_map.git
cd boondock_map/boondock

# Install dependencies
npm install

# Run in development mode
npm run dev
```

> **Note:** The first run will create a `BoondockMap/` folder in your iCloud Drive for syncing waypoints and preferences.

### Build for Distribution

```bash
npm run build
```

Output: `dist/` — `.dmg` and `.zip` for macOS distribution.

---

## Web Version (PWA)

The web version lives in `web/` and reuses the desktop's React components and
shared code, swapping Electron's iCloud storage for in-browser IndexedDB. It
deploys to GitHub Pages automatically on push to `main` (see
`.github/workflows/deploy-pages.yml`) and is installable on iPhone via
Safari → Share → **Add to Home Screen**.

Live at: **https://cidrlab.org/boondock_map/**

```bash
cd web
npm install
npm run dev          # local development
npm run build        # production build to web/dist/
npm run preview      # serve the production build locally
```

Not yet in the web version: offline tile packs and GPX file dialogs use
browser equivalents (download/upload). See [VISION.md](VISION.md) Phase 2.

---

## Map Layers

All tile and data sources are free and require no API key.

### Base Layers

| Name | Source | Max Zoom |
|---|---|---|
| Boondock | Our style: OpenFreeMap vector tiles (OpenMapTiles/OSM) + Mapzen terrain hillshade via AWS | z19 |
| Satellite | ESRI World Imagery | z19 |

### Overlays

| Name | Source | Notes |
|---|---|---|
| MVUM Roads | USFS Motor Vehicle Use Map (export rendering) | Legal forest roads by vehicle type, z10+ |
| Hiking Trails | USFS / NPS National Trails | |
| Sites | OSM + Overture + Recreation.gov RIDB (+ WA DNR) | Camping/RV/dump/water/trailheads — Washington + Arizona, more states coming |
| Boondock Zones β | Derived from USFS ownership + MVUM roads (`data-pipeline/`) | Heuristic dispersed-camping likelihood polygons, slope-graded — WA + AZ |
| Names & Labels | ESRI World Boundaries & Places | Mainly for Satellite |
| Public Land | BLM Surface Management Agency | Who manages each parcel |
| Topo Overlay | USGS National Map | Contours + elevation figures blended over any base |

Offline packs download from USGS Topo (public domain) and appear
automatically as the fallback map when you're offline.

---

## Waypoint Categories

Waypoints support colored pins and category icons:

| Category | Color | Use |
|---|---|---|
| Generic | Brand Red `#F9322B` | Default |
| Camp | Green `#22c55e` | Camping spots |
| Trailhead | Rose `#f472b6` | Trail access |
| Viewpoint | Purple `#a78bfa` | Scenic overlooks |
| Fuel | Orange `#fb923c` | Gas stations |
| Water | Blue `#38bdf8` | Water sources |
| Hazard | Yellow `#fbbf24` | Hazards, caution |
| Parking | Light `#e8eef4` | Parking areas |

---

## iCloud Sync (Desktop)

User data is stored in iCloud Drive for automatic iPhone sync:

```
~/Library/Mobile Documents/com~apple~CloudDocs/BoondockMap/
├── waypoints.json
├── tracks.json
├── preferences.json
└── search-history.json
```

Offline tile packs are *not* synced to iCloud — they are stored locally in
`~/Library/Application Support/BoondockMap/tiles/` as `.mbtiles` files.

Files are accessible on iPhone via the **Files app → iCloud Drive → BoondockMap**.

---

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0-or-later)**.

In plain terms: the app is free for everyone, forever. Anyone may use, copy,
modify, and share it — but any distributed modified version must also be
released under the same license, with source code available. No one can take
this code and turn it into a closed, paid product.

Donations to support development are welcome and encouraged.

See [LICENSE](LICENSE) for the full license text.

---

## Roadmap

The full product vision and phased build plan live in [VISION.md](VISION.md).

---

## Acknowledgments

Inspired by [FreeRoam](https://github.com/FreeRoamApp) by Austin & Rachel — an
open-source boondocking app whose feature set and architecture inform this
project's roadmap.

Built with free and open data:
- [OpenStreetMap](https://www.openstreetmap.org/) contributors
- [USGS National Map](https://www.usgs.gov/tools/national-map)
- [ESRI](https://www.esri.com/) World Imagery (free tier)
- [USDA Forest Service](https://www.fs.usda.gov/) trail and road data
- [Bureau of Land Management](https://www.blm.gov/)
- [Open-Meteo](https://open-meteo.com/) — weather forecast data (CC-BY 4.0)

Developed by the [CiDR Lab](https://cidrlab.org/) — Collective Impact Data & Research.
