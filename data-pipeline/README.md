# Data pipeline — sites + zones per state

Two scripts, both state-parameterized (add a state to `STATES` / `BBOXES`
first). Python needs: Pillow (both), Shapely (zones only). Outputs are
committed to `web/public/data/` — licensing notes belong in
`web/public/data/ATTRIBUTION.md`.

## Staging data for `build_spots.py` (recipe used for AZ, 2026-07-23)

All fetched into one staging dir. `<ST>` = lowercase state code, and swap in
the state's `ISO3166-2` code and bbox.

**OSM spots + trailheads** (Overpass; overpass-api.de was overloaded — the
kumi.systems mirror worked):

```
[out:json][timeout:300];area["ISO3166-2"="US-AZ"][admin_level=4]->.a;
(nwr["tourism"="camp_site"](area.a);nwr["tourism"="caravan_site"](area.a);
nwr["amenity"="sanitary_dump_station"](area.a);nwr["amenity"="water_point"](area.a););
out center;
```
→ `<st>-spots-raw.json`. Same with only `nwr["highway"="trailhead"](area.a);`
→ `<st>-trailheads-raw.json`.

**Overture places** (DuckDB over S3, no key; keep release pinned to
2026-06-17.0 so `src` attribution in ATTRIBUTION.md stays accurate):

```sql
INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';
SELECT names.primary AS name, bbox.xmin AS lng, bbox.ymin AS lat, confidence,
       categories.primary AS category, sources[1].dataset AS dataset,
       websites[1] AS website, addresses[1].freeform AS addr,
       addresses[1].locality AS city
FROM read_parquet('s3://overturemaps-us-west-2/release/2026-06-17.0/theme=places/type=place/*')
WHERE bbox.xmin BETWEEN <W> AND <E> AND bbox.ymin BETWEEN <S> AND <N>
  AND categories.primary IN ('campground','rv_park')
```
→ list of row-dicts as JSON → `overture_<st>.json`.

**RIDB bulk** (CC-BY 4.0, no key):
`https://ridb.recreation.gov/downloads/RIDBFullExport_V1_CSV.zip` — unzip
`Facilities_API_v1.csv`, `FacilityAddresses_API_v1.csv`, `Links_API_v1.csv`
into `ridb/`.

**State boundary** (strongly recommended — a bbox leaked 86 out-of-state AZ
spots from NV/CA/UT/MX before this): Nominatim
`search?state=<name>&country=USA&format=json&polygon_geojson=1&polygon_threshold=0.0001`,
take the state relation's `geojson` member → `<st>-boundary.geojson`.

Then:

```
python3 build_spots.py az <staging_dir> ../web/public/data/spots-az.geojson
python3 build_zones.py az ../web/public/data/boondock-zones-az.geojson
```

Last: add the state to `DATA_STATES` in
`boondock/src/renderer/components/Map.jsx`, update the Sites description in
`boondock/src/shared/layers.js`, Guide coverage note, README, ATTRIBUTION.md,
and the VISION.md backlog row.
