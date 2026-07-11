# Boondock Map

**An offline-capable topographic map for boondocking, off-road exploration, and hiking — built to replace Gaia GPS and CalTopo with something faster, cleaner, and fully yours.**

---

## What It Is

Boondock Map is a desktop mapping application built on [MapLibre GL JS](https://maplibre.org/), [React 18](https://react.dev/), and [Electron](https://www.electronjs.org/). It layers free public tile sources — USGS, ESRI, OpenStreetMap, USFS, and BLM — into a polished, dark-themed interface optimized for field use and trip planning. Web and iPhone versions are planned but not yet built — see [VISION.md](VISION.md) for the roadmap.

Waypoints and tracks sync automatically to iCloud Drive, making your saved spots available on iPhone (via Files app or any app with iCloud access).

---

## Features

- **5 base layers:** USGS Topo, Topo+Imagery (ESRI satellite with USGS overlay), ESRI Satellite, ESRI Hybrid, OSM Topo
- **6 overlays:** Roads & Trails, USFS Roads, USFS Trails, Road Labels, Contour Lines, BLM Land Status
- **Topo+Imagery composite:** High-resolution ESRI satellite at zoom 17+ fades the topo overlay for maximum detail when it matters
- **Waypoints:** Save, edit, categorize, and color-code locations with icons (camp, trailhead, viewpoint, fuel, water, hazard, etc.)
- **GPX import:** Load existing GPX files for tracks and waypoints
- **Offline tile download:** Download map tiles for a selected area and zoom range into local MBTiles packs. *Known gap: the map does not yet read these packs back when offline — see VISION.md.*
- **Track recording (UI only):** Record/stop controls and track display exist, but no GPS points are captured yet — recording is not functional. See VISION.md.
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
| Storage (desktop) | iCloud Drive via Node.js fs + IPC |
| Storage (web) | IndexedDB via idb |
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

web/                        # PLANNED — GitHub Pages web version (does not exist yet)
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

All tile sources are free and require no API key.

### Base Layers

| Name | Source | Max Zoom |
|---|---|---|
| USGS Topo | USGS National Map | z16 |
| Topo + Imagery | ESRI satellite + USGS topo overlay | z19 |
| ESRI Satellite | ESRI World Imagery | z19 |
| ESRI Hybrid | ESRI satellite + roads + labels | z19 |
| OSM Topo | OpenTopoMap | z17 |

### Overlays

| Name | Source | Notes |
|---|---|---|
| Roads & Trails | USFS Motor Vehicle Use Maps | Color-coded by vehicle type |
| USFS Roads | USFS National Forest Roads | |
| USFS Trails | USFS National Trails | |
| Road Labels | ESRI World Boundaries & Places | Street names on satellite |
| Contour Lines | USGS Elevation | |
| BLM Land | BLM Surface Management Agency | Public land status |

---

## Waypoint Categories

Waypoints support colored pins and category icons:

| Category | Color | Use |
|---|---|---|
| Generic | Brand Red `#F9322B` | Default |
| Camp | Green `#22c55e` | Camping spots |
| Trailhead | Amber `#f59e0b` | Trail access |
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

Built with free and open data:
- [OpenStreetMap](https://www.openstreetmap.org/) contributors
- [USGS National Map](https://www.usgs.gov/tools/national-map)
- [ESRI](https://www.esri.com/) World Imagery (free tier)
- [USDA Forest Service](https://www.fs.usda.gov/) trail and road data
- [Bureau of Land Management](https://www.blm.gov/)

Developed by the [CiDR Lab](https://cidrlab.org/) — Collective Impact Data & Research.
