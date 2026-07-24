# Sites data — sources & attribution

`spots-<state>.geojson` (one file per state; WA generated 2026-07-11, AZ
2026-07-23, all remaining states 2026-07-23/24) merge these sources. Each
feature carries a `src` property identifying where it came from. Build
script: `data-pipeline/build_spots.py`.

## OpenStreetMap (`src: osm`)
Campsites, RV parks, dump stations, water points, and trailheads extracted
via the Overpass API. State boundary polygons (via Nominatim) clip the
non-OSM sources to each state line.
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

## Recreation.gov RIDB (`src: ridb`)
Federal campgrounds from the Recreation Information Database bulk export
(RIDBFullExport_V1_CSV.zip). License **CC-BY 4.0** per its data.gov catalog
entry; publisher U.S. Forest Service. Credit: Recreation Information
Database (RIDB), Recreation.gov.

## Washington DNR (`src: wadnr`)
DNR Campgrounds dataset from geo.wa.gov, provided "as is" by the Washington
State Department of Natural Resources. Washington only — no equivalent
state-lands source is merged for other states yet.

## Boondock Zones β (`boondock-zones-<state>.geojson`)
Derived layer: USFS-owned land (EDW Basic Ownership) within ~300 m of a
legal MVUM road (EDW_MVUM_01), both US Government / USFS public-domain
services, clipped to each state's boundary polygon. States with no MVUM
data (most plains states, Hawaii) have empty files. Heuristic only — not a
statement of legality. Build script: `data-pipeline/build_zones.py`.

## Community spots (`community.geojson`, `src: community`)
Anonymous in-app traveler reports (dumps, water fills, campsites, RV parks,
trailheads) with dated check-in comments. Unverified user content — no
external source or license; spam-filtered on submission and republished
nightly by `data-pipeline/merge_community.py` from the `worker/` submission
queue. Spots are marked *verified* only after two independent check-in
confirmations, and each carries its last-confirmed date. No IP data,
account, or identity is collected or published. Trust model after FreeRoam's
check-in records and iOverlander's community validation.
