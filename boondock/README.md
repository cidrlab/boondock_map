# 🏕️ Boondock Map

Offline-capable topo map for boondocking, off-road, and hiking. macOS desktop app (Electron + React + MapLibre), with iCloud sync for a future iPhone companion app.

## Quick Start

```bash
cd boondock
bash setup.sh     # first time only — installs deps + rebuilds native modules
npm run dev       # launch app in dev mode
```

## Map Layers

| Layer | Source | Notes |
|---|---|---|
| USGS Topo | nationalmap.gov | Same rendering as ngmdb.usgs.gov/topoview — 1:24k quads |
| USGS Satellite | nationalmap.gov | High-res imagery |
| Satellite (ESRI) | arcgisonline.com | Global, very high res |
| Hybrid | ESRI satellite + reference | Roads + labels over satellite |
| OpenTopo | opentopomap.org | Global OSM-based topo |

**Overlays:** Forest Roads (USFS), Hiking Trails (USFS/NPS), 40ft Contour Lines

## Features

- **Click map → drop waypoint** with name, icon (camp, water, hazard, etc.), notes
- **Offline download** — draw a bounding box → select zoom levels → downloads to MBTiles. *Known gap: the map does not yet read the packs back when offline.*
- **Track recording (UI only)** — start/stop controls exist but no GPS points are captured yet; recording is not functional
- **GPX import/export** — compatible with Gaia GPS, Garmin, CalTopo
- **iCloud sync** — waypoints saved to `~/Library/Mobile Documents/com~apple~CloudDocs/BoondockMap/waypoints.json`; iPhone companion app (coming) reads the same file

## iCloud Sync Architecture

```
Mac app → writes waypoints.json → iCloud Drive
                                      ↓ auto-sync
iPhone app → reads waypoints.json ← iCloud Drive
```

When you save a waypoint on your phone, the Mac app receives a live file-watch event and updates the map in real time (no server, no account needed beyond iCloud).

## Offline Tiles

Downloaded tile packs are stored as `.mbtiles` SQLite files in:
```
~/Library/Application Support/BoondockMap/tiles/
```

To download: click **⬇️ Offline** in toolbar → draw box on map → set zoom range → Download.

Rule of thumb for zoom levels:
- Z8–12 = regional overview (~50MB for a county)
- Z8–14 = good detail for trails/roads (~300MB for a county)
- Z8–16 = maximum USGS topo detail (large — use a small area)

## Roadmap

See [../VISION.md](../VISION.md) for the product vision and phased build plan.

## Tech Stack

- **Electron** — native macOS app shell
- **React 18** — UI
- **MapLibre GL JS** — map rendering (open-source Mapbox fork)
- **sql.js** — WASM SQLite for writing MBTiles offline tile packs
- **iCloud Drive** — zero-infrastructure sync between Mac and iPhone
