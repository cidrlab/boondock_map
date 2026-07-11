# Sites data — sources & attribution

`spots-wa.geojson` (generated 2026-07-11) merges these sources. Each feature
carries a `src` property identifying where it came from.

## OpenStreetMap (`src: osm`)
Campsites, RV parks, dump stations, water points, and trailheads extracted
via the Overpass API.
© OpenStreetMap contributors, Open Database License (ODbL) 1.0 —
https://www.openstreetmap.org/copyright

## Overture Maps Foundation (`src: overture:*`)
Additional campgrounds and RV parks from the Overture **places** theme,
release 2026-06-17.0. Attribution requirements per
https://docs.overturemaps.org/attribution/ :
- `overture:meta` (and Microsoft/other corporate contributions): data made
  available under **CDLA Permissive 2.0**.
- `overture:Foursquare`: Foursquare Open Source Places, **Apache License
  2.0** (NOTICE: Foursquare Open Source Places is provided by Foursquare
  Labs, Inc., licensed under the Apache License, Version 2.0).
- `overture:alltheplaces`: **CC0 1.0**.

## Not yet merged (planned; see VISION.md)
- Recreation.gov RIDB bulk export (CC-BY 4.0 per its data.gov catalog
  entry) — federal campgrounds.
- Washington DNR Campgrounds (geo.wa.gov, provided "as is") — state trust
  land campgrounds.
