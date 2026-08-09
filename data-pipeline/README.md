# Data pipeline — sites + zones per state

Two scripts, both driven by a per-state boundary polygon. Python needs:
Pillow (both), Shapely (zones only). Outputs are committed to
`web/public/data/`; licensing notes belong in
`web/public/data/ATTRIBUTION.md`. All 50 states were built 2026-07-23/24
with the recipe below.

## Staging data per state

All files share one staging dir. `<st>` = lowercase postal code.

**State boundary** (required — drives the clip, the RIDB state code, and
the sanity bbox; a bare bbox leaked 86 out-of-state AZ spots from NV/CA/UT/MX
before this): Nominatim
`search?state=<name>&country=USA&format=json&polygon_geojson=1&polygon_threshold=0.0001`,
take the state relation's `geojson` member → `<st>-boundary.geojson`.
Respect the 1 req/s policy when fetching many.

**OSM spots + trailheads** (Overpass; kumi.systems mirror when
overpass-api.de is busy — one query at a time, a few seconds between):

```
[out:json][timeout:600];area["ISO3166-2"="US-<ST>"][admin_level=4]->.a;
(nwr["tourism"="camp_site"](area.a);nwr["tourism"="caravan_site"](area.a);
nwr["amenity"="sanitary_dump_station"](area.a);nwr["amenity"="water_point"](area.a););
out center;
```
→ `<st>-spots-raw.json`. Same with only `nwr["highway"="trailhead"](area.a);`
→ `<st>-trailheads-raw.json`.

**Overture places** (DuckDB over S3, no key; release pinned to 2026-06-17.0
so `src` attribution stays accurate). For many states, one national query is
cheaper than fifty scans — pull everything, then assign rows to states by
boundary polygon:

```sql
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
SELECT names.primary AS name, bbox.xmin AS lng, bbox.ymin AS lat, confidence,
       categories.primary AS category, sources[1].dataset AS dataset,
       websites[1] AS website, addresses[1].freeform AS addr,
       addresses[1].locality AS city
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-06-17.0/theme=places/type=place/*')
WHERE (bbox.xmin BETWEEN -125.0 AND -66.9 AND bbox.ymin BETWEEN 24.4 AND 49.5)
   OR (bbox.xmin BETWEEN -180.0 AND -129.0 AND bbox.ymin BETWEEN 51.0 AND 71.5)
   OR (bbox.xmin BETWEEN -160.6 AND -154.7 AND bbox.ymin BETWEEN 18.8 AND 22.3)
  AND categories.primary IN ('campground','rv_park')
```
→ per-state row-dict lists as `overture_<st>.json` (point-in-polygon split;
the generous bboxes over Canada/Mexico/Bahamas are fine — the polygon split
drops them).

**RIDB bulk** (CC-BY 4.0, no key, one national download):
`https://ridb.recreation.gov/downloads/RIDBFullExport_V1_CSV.zip` — unzip
`Facilities_API_v1.csv`, `FacilityAddresses_API_v1.csv`, `Links_API_v1.csv`
into `ridb/`.

## Build

```
python3 build_spots.py <st> <staging_dir> ../web/public/data/spots-<st>.geojson
python3 build_zones.py <st> <staging_dir> ../web/public/data/boondock-zones-<st>.geojson
```

With the boundary file present both scripts derive everything from it (RIDB
state code, sanity bbox, exact clip). Zones queries only the half-degree
cells intersecting the polygon, probes the whole state for MVUM presence
first (plains states and Hawaii skip the sweep entirely), and clips output
to the polygon so neighboring states never double-draw shared forest.
Alaska's far Aleutians (west of the antimeridian) are excluded.

Zones is network-heavy (USFS ArcGIS): run states sequentially, one at a
time. A full national rebuild is several hours.

## Self-hosted road tilesets (VISION row 83)

`build_road_pmtiles.py` turns a national USFS shapefile into one `.pmtiles`
archive served straight off Pages over range requests — no tile server, works
offline, immune to `apps.fs.usda.gov` being down. Covers `mvum`, `trails`, and
`roadcore` (the last already shipped; it's here so refreshing it is a command
rather than the afternoon it was the first time).

Needs `ogr2ogr` (GDAL) and `tippecanoe`:

```
brew install gdal tippecanoe                 # macOS
apt-get install gdal-bin                     # Ubuntu; build tippecanoe from source
```

Input comes from the mirror in `~/data/cidrlab/boondock_map` when we hold one
(row 85), and is downloaded only when we don't — so a laptop with the backups
does no network at all.

**Inspect before tiling a dataset for the first time.** The app styles MVUM by
vehicle class and puts road attributes in its popup; both need the real column
names, and nothing in the app tells you what they are. Guessing produces a
layer that renders nothing while looking correct in review.

```
python3 build_road_pmtiles.py --inspect mvum
```

It prints every field with how often it is populated and what values it
carries, labelling each as a styling candidate (few distinct values) or popup
material (free text).

```
python3 build_road_pmtiles.py --build mvum trails            # write the archives
python3 build_road_pmtiles.py --build mvum --dry-run         # size check only
python3 build_road_pmtiles.py --build mvum --fields NAME,SYMBOL_TYPE
```

A build refuses to write anything over 90 MB, since GitHub rejects a file past
100 MB — narrow the attributes with `--fields`, or lower `max_zoom` in
`DATASETS`. On success it stamps `built_from` in `upstream_sources.json`, which
is what lets the weekly check distinguish *upstream moved* from *what we
publish is behind*.

**Or let CI do it.** The `Build road PMTiles` workflow (manual dispatch) has an
open network and both tools. Run it with the defaults first: you get the schema
report and the tiled sizes as artifacts without touching the repo. Re-run with
`commit: true` once the numbers look right.

## App side

`boondock/src/shared/stateBounds.js` (generated from the boundary polygons)
lists every state's bbox; the map lazy-loads each state's two files when the
viewport reaches it at z ≥ 4.5. A new state = build its two files + add its
bounds entry there. Update the Sites description in
`boondock/src/shared/layers.js`, the Guide coverage note, README,
ATTRIBUTION.md, and the VISION.md backlog row.
