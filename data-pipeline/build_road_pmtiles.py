#!/usr/bin/env python3
"""Turn a national USFS road/trail shapefile into self-hosted PMTiles (VISION row 83).

Why this exists
---------------
MVUM and the trails layer are still drawn by asking `apps.fs.usda.gov` to
render every tile. That host has already gone down on us for a full day (row
82), it is slow because each tile is a server-side render, and it cannot work
offline at all — which is most of the point of this app. RoadCore (row 98)
proved the way out: one `.pmtiles` archive served straight off GitHub Pages
over HTTP range requests, no tile server, works offline, immune to their
uptime.

RoadCore was built by hand, which is exactly why it is now pinned to a source
from 2025-05-11 and nobody has refreshed it. This script is that recipe
written down, for all three datasets, so a rebuild is a command rather than an
afternoon of remembering.

Input comes from the local mirror when we hold one (row 85 keeps them in
~/data/cidrlab/boondock_map, recorded in upstream_sources.json) and is
downloaded only when we don't — so a laptop with the backups does no network
at all, and CI, which has no backups, just fetches.

Two modes
---------
`--inspect` reads the shapefile's schema and prints every field with how often
it is populated and what values it actually carries. Run this FIRST on a
dataset we have never tiled: the app's styling and popups depend on knowing
the real column names, and guessing them produces a layer that renders
nothing while looking correct in review.

`--build` reprojects to WGS84, tiles with tippecanoe, and writes the archive
into web/public/data/, then stamps `built_from` in upstream_sources.json so
the weekly freshness check (row 97) can tell "upstream moved" from "what we
publish is behind".

Needs `ogr2ogr`/`ogrinfo` (GDAL) and `tippecanoe` on PATH.

    python3 data-pipeline/build_road_pmtiles.py --inspect mvum
    python3 data-pipeline/build_road_pmtiles.py --build mvum trails
    python3 data-pipeline/build_road_pmtiles.py --build roadcore --fields NAME,SURFACE
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from datetime import date
from pathlib import Path

MANIFEST = Path(__file__).with_name("upstream_sources.json")
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

# GitHub refuses a file past 100 MB. Stop short of it with room to spare, so a
# build that drifts over the line fails here instead of at push time.
MAX_OUTPUT_BYTES = 90 * 1024 * 1024

# Each dataset: which mirrored source it comes from, what to call the archive,
# and the zoom window. z7 is where these layers first switch on in the app
# (see sourceMinzoom in shared/layers.js); past z12 MapLibre overzooms the
# top tiles, which is what RoadCore does today and it reads fine.
#
# `sql` is the field projection, and it is the load-bearing part. Three reasons
# it is not just "keep every column":
#
#   1. These shapefiles are enormous in attributes, not geometry — MVUM's .dbf
#      is 1.08 GB against a 274 MB .shp, ~3.2 KB of text per road. Most of it
#      is per-vehicle "date source" prose we would never show.
#   2. A vector tile pools attribute *values* per tile, so a long string that
#      repeats ("NAT - NATIVE MATERIAL") is nearly free while a high-cardinality
#      one (GUIDs, raw floats, begin/end mileposts) costs on every feature.
#      So we drop RTE_CN/GLOBALID/BMP/EMP/SHAPE_LEN and keep the descriptive
#      columns, rather than the other way round.
#   3. Storing the *code* and expanding it in the app (NAT -> "native surface")
#      keeps the tiles small without making the popup any poorer.
#
# `WHERE GEOMETRY IS NOT NULL` is not defensive boilerplate. 189,864 of MVUM's
# 340,885 records (55.7%) carry attributes and no line at all, and 5,453 of the
# trail records likewise. Verified 2026-08-09 that this is USFS's own gap and
# not a broken export: the live MapServer returns exactly the same counts
# (Deschutes NF 4,990 live = 4,990 with geometry here; Malheur NF 0 = 0). Left
# in, they become features tippecanoe silently discards; filtered here, the
# build can count and report them.
DATASETS = {
    "mvum": {
        "source_id": "usfs-mvum",
        "out": "mvum.pmtiles",
        "layer_name": "mvum",
        "min_zoom": 7,
        "max_zoom": 12,
        "note": "MVUM roads — the legal motorized network, by vehicle class",
        # sym is the styling key: USFS's own MVUM symbology, 1/2 = open to all
        # vehicles (yearlong/seasonal), 3/4 = highway-legal vehicles only,
        # 11/12 = special designation. veh is a bitmask because the alternative
        # is nine near-empty string columns; the bit order is mirrored in
        # shared/usfsCodes.js and must stay in step with it.
        "sql": """
            SELECT GEOMETRY,
                   NAME AS name,
                   ID AS rte,
                   CAST(SYMBOL AS integer) AS sym,
                   CASE WHEN INSTR(SURFACETYP, ' - ') > 0
                        THEN SUBSTR(SURFACETYP, 1, INSTR(SURFACETYP, ' - ') - 1)
                        ELSE SURFACETYP END AS surf,
                   CAST(SUBSTR(OPERATIONA, 1, 1) AS integer) AS oml,
                   TA_SYMBOL AS road,
                   FORESTNAME AS forest,
                   ROUND(GIS_MILES, 2) AS miles,
                   PASSENGE_1 AS season,
                     (CASE WHEN UPPER(PASSENGERV) = 'OPEN' THEN 1   ELSE 0 END)
                   + (CASE WHEN UPPER(HIGHCLEARA) = 'OPEN' THEN 2   ELSE 0 END)
                   + (CASE WHEN UPPER(TRUCK)      = 'OPEN' THEN 4   ELSE 0 END)
                   + (CASE WHEN UPPER(BUS)        = 'OPEN' THEN 8   ELSE 0 END)
                   + (CASE WHEN UPPER(MOTORHOME)  = 'OPEN' THEN 16  ELSE 0 END)
                   + (CASE WHEN UPPER(FOURWD_GT5) = 'OPEN' THEN 32  ELSE 0 END)
                   + (CASE WHEN UPPER(TWOWD_GT50) = 'OPEN' THEN 64  ELSE 0 END)
                   + (CASE WHEN UPPER(ATV)        = 'OPEN' THEN 128 ELSE 0 END)
                   + (CASE WHEN UPPER(MOTORCYCLE) = 'OPEN' THEN 256 ELSE 0 END) AS veh
              FROM "{layer}"
             WHERE GEOMETRY IS NOT NULL
        """,
    },
    "trails": {
        "source_id": "usfs-trails",
        "out": "trails.pmtiles",
        "layer_name": "trails",
        "min_zoom": 7,
        "max_zoom": 12,
        "note": "National Forest trail system",
        # `uses` is ALLOWED_TE, a digit string of the uses a trail is managed
        # for. The digits were confirmed against the per-use columns rather
        # than assumed (2026-08-09): rows reading '6321' light up only
        # FOURWD_MAN and '5321' only ATV_MANAGE, which pins each digit on its
        # own — 1 hiker, 2 pack/saddle, 3 bicycle, 4 motorcycle, 5 ATV,
        # 6 4WD>50". That is what tells motorized from foot trails.
        "sql": """
            SELECT GEOMETRY,
                   TRAIL_NAME AS name,
                   TRAIL_NO AS trailno,
                   TRAIL_TYPE AS type,
                   TRAIL_CLAS AS cls,
                   ALLOWED_TE AS uses,
                   ALLOWED_SN AS snowuses,
                   TERRA_MOTO AS moto,
                   CASE WHEN INSTR(TRAIL_SURF, ' - ') > 0
                        THEN SUBSTR(TRAIL_SURF, 1, INSTR(TRAIL_SURF, ' - ') - 1)
                        ELSE TRAIL_SURF END AS surf,
                   ACCESSIBIL AS access,
                   SPECIAL_MG AS special,
                   ROUND(GIS_MILES, 2) AS miles,
                   HIKER_PEDE AS hike_s,
                   BICYCLE_MA AS bike_s,
                   MOTORCYCLE AS moto_s,
                   ATV_MANAGE AS atv_s,
                   FOURWD_MAN AS fwd_s
              FROM "{layer}"
             WHERE GEOMETRY IS NOT NULL
        """,
    },
    "mvum-trails": {
        "source_id": "usfs-mvum-trails",
        "out": "mvum-trails.pmtiles",
        "layer_name": "mvum_trails",
        "min_zoom": 7,
        "max_zoom": 12,
        "note": "MVUM motorized trails — the other half of the MVUM overlay",
        # Same columns as the roads file, so the veh bitmask below is bit-for-bit
        # the same and one decoder serves both. sym is NOT the same code set
        # though: roads run 1-4 + 11/12, trails run 5-12 + 16/17 (open to all
        # vehicles / to vehicles 50" or less / to motorcycles / special
        # designation, each yearlong or seasonal). Confirmed against the data.
        #
        # This file is the incomplete one. Only 17,725 of its 705,944 records
        # carry a line, and unlike the roads file that is NOT what the live
        # service holds: live MVUM trails is 63,056, and whole forests differ
        # (Deschutes 250 live / 125 here, Ozark-St. Francis 161 live / 0 here).
        # So what we tile is a floor, not the whole layer, and the app keeps
        # drawing the live sublayer over the top to fill the rest in when
        # there is a connection (Tim's call, 2026-08-09).
        "sql": """
            SELECT GEOMETRY,
                   NAME AS name,
                   ID AS rte,
                   CAST(SYMBOL AS integer) AS sym,
                   CASE WHEN INSTR(TRAILCLASS, ' - ') > 0
                        THEN SUBSTR(TRAILCLASS, 1, INSTR(TRAILCLASS, ' - ') - 1)
                        ELSE TRAILCLASS END AS cls,
                   FORESTNAME AS forest,
                   ROUND(GIS_MILES, 2) AS miles,
                   COALESCE(ATV_DATESO, MOTORCYC_1, PASSENGE_1, HIGHCLEA_1) AS season,
                     (CASE WHEN UPPER(PASSENGERV) = 'OPEN' THEN 1   ELSE 0 END)
                   + (CASE WHEN UPPER(HIGHCLEARA) = 'OPEN' THEN 2   ELSE 0 END)
                   + (CASE WHEN UPPER(TRUCK)      = 'OPEN' THEN 4   ELSE 0 END)
                   + (CASE WHEN UPPER(BUS)        = 'OPEN' THEN 8   ELSE 0 END)
                   + (CASE WHEN UPPER(MOTORHOME)  = 'OPEN' THEN 16  ELSE 0 END)
                   + (CASE WHEN UPPER(FOURWD_GT5) = 'OPEN' THEN 32  ELSE 0 END)
                   + (CASE WHEN UPPER(TWOWD_GT50) = 'OPEN' THEN 64  ELSE 0 END)
                   + (CASE WHEN UPPER(ATV)        = 'OPEN' THEN 128 ELSE 0 END)
                   + (CASE WHEN UPPER(MOTORCYCLE) = 'OPEN' THEN 256 ELSE 0 END) AS veh
              FROM "{layer}"
             WHERE GEOMETRY IS NOT NULL
        """,
    },
    "roadcore": {
        "source_id": "usfs-roadcore",
        "out": "roadcore.pmtiles",
        "layer_name": "roadcore",
        "min_zoom": 7,
        "max_zoom": 12,
        "note": "Every FS road — already shipped, here so refreshing it is one command",
    },
}


def load_manifest():
    return json.loads(MANIFEST.read_text())


def source_entry(manifest, source_id):
    for s in manifest["sources"]:
        if s["id"] == source_id:
            return s
    sys.exit(f"upstream_sources.json has no source '{source_id}'")


def resolve_input(entry, work: Path):
    """The mirrored zip if we hold it, otherwise download one.

    Returns (path_to_zip, provenance) where provenance is 'mirror' or 'download'
    — worth printing, because a mirror build and a fresh-download build can
    legitimately produce different tiles when upstream has moved.
    """
    backup = entry.get("backup") or {}
    location = backup.get("location")
    if location:
        # The recorded path is from whichever machine mirrored it; also try the
        # same filename under this user's home, so CI and a second laptop work
        candidates = [Path(location).expanduser(), Path.home() / "data" / "cidrlab" / "boondock_map" / Path(location).name]
        for c in candidates:
            if c.is_file():
                return c, "mirror"

    url = entry["url"]
    dest = work / Path(url).name
    print(f"  no local mirror — downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "boondock-map-pipeline"})
    with urllib.request.urlopen(req, timeout=300) as res, open(dest, "wb") as out:
        shutil.copyfileobj(res, out)
    return dest, "download"


def unzip_shapefile(zip_path: Path, work: Path):
    """Unpack and return the .shp inside. These archives hold exactly one."""
    target = work / "src"
    target.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(target)
    shps = sorted(target.rglob("*.shp"))
    if not shps:
        sys.exit(f"no .shp inside {zip_path}")
    if len(shps) > 1:
        print(f"  {len(shps)} shapefiles present, using {shps[0].name}")
    return shps[0]


def require_tools(*tools):
    missing = [t for t in tools if shutil.which(t) is None]
    if missing:
        sys.exit(
            f"missing required tool(s): {', '.join(missing)}\n"
            "  macOS:  brew install gdal tippecanoe\n"
            "  Ubuntu: apt-get install gdal-bin, and build tippecanoe from source"
        )


def run(cmd, **kw):
    print("  $ " + " ".join(str(c) for c in cmd))
    subprocess.run(cmd, check=True, **kw)


def field_names(shp: Path):
    """Every attribute column, read from ogrinfo's JSON.

    Deliberately not scraped out of the human-readable summary: USFS shapefiles
    are not consistent about case (`SEG_LENGTH` next to `RouteStatus`), and a
    text parse that assumes upper-case silently returns a short list, which
    looks like a clean schema instead of a broken reader. `-json` has been in
    GDAL since 3.7; older builds fall back to a case-insensitive text parse.
    """
    res = subprocess.run(["ogrinfo", "-so", "-al", "-json", str(shp)],
                         capture_output=True, text=True)
    if res.returncode == 0:
        try:
            doc = json.loads(res.stdout)
            return [f["name"] for lyr in doc.get("layers", []) for f in lyr.get("fields", [])]
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    text = subprocess.run(["ogrinfo", "-so", "-al", str(shp)],
                          capture_output=True, text=True, check=True).stdout
    names = []
    for line in text.splitlines():
        line = line.strip()
        # Field lines look like: NAME: String (100.0)
        if ":" in line and "(" in line and line.split(":", 1)[1].strip().startswith(
                ("String", "Integer", "Real", "Date", "Time", "Binary")):
            names.append(line.split(":", 1)[0].strip())
    return names


def feature_count(shp: Path):
    """Records in the shapefile, from the header — geometry or not."""
    res = subprocess.run(["ogrinfo", "-so", "-al", str(shp)], capture_output=True, text=True)
    for line in res.stdout.splitlines():
        if line.strip().startswith("Feature Count:"):
            return int(line.split(":", 1)[1].strip())
    return None


def scalar_sql(shp: Path, sql):
    """One number out of an SQL query, or None if the query won't run."""
    res = subprocess.run(["ogrinfo", "-q", "-dialect", "SQLite", str(shp), "-sql", sql],
                         capture_output=True, text=True)
    if res.returncode != 0:
        return None
    for line in res.stdout.splitlines():
        if "=" in line:
            value = line.split("=", 1)[1].strip()
            if value.isdigit():
                return int(value)
    return None


def inspect(name, keep_work=False):
    """Print the real schema: field names, fill rate, and the values in use.

    This is the step that stops us inventing column names. The app styles MVUM
    by vehicle class and shows road attributes in its popup; both need the
    actual field names, and no amount of reading the app tells you what they
    are.
    """
    cfg = DATASETS[name]
    manifest = load_manifest()
    entry = source_entry(manifest, cfg["source_id"])
    require_tools("ogrinfo")

    work = Path(tempfile.mkdtemp(prefix=f"boondock-{name}-"))
    try:
        zip_path, how = resolve_input(entry, work)
        print(f"== {name}: {entry['label']} ({how})")
        shp = unzip_shapefile(zip_path, work)

        # Summary first: geometry type, feature count, field list with types
        run(["ogrinfo", "-so", "-al", str(shp)])

        layer = shp.stem
        names = field_names(shp)
        print(f"\n== value frequencies ({len(names)} fields)")
        # What each column actually carries. A field with few distinct values
        # is a styling candidate; one with a handful of long strings is popup
        # material. Each query is separate so one odd column can't abort the
        # report, and the distinct count is measured rather than guessed at
        # from the shape of ogrinfo's output.
        for f in names:
            distinct = scalar_sql(shp, f'SELECT COUNT(DISTINCT "{f}") FROM "{layer}"')
            filled = scalar_sql(shp, f'SELECT COUNT("{f}") FROM "{layer}"')
            # A 40-column shapefile makes for a long report, so spend the lines
            # where they help: a handful of repeated values is what you style
            # by, and free text is what you put in a popup. Say which is which
            # instead of printing twelve road names either way.
            wide = distinct is not None and distinct > 25
            kind = "free text — popup material" if wide else "low cardinality — styling candidate"
            print(f"\n-- {f}: {distinct if distinct is not None else '?'} distinct, "
                  f"{filled if filled is not None else '?'} populated  [{kind}]")
            limit = 3 if wide else 12
            res = subprocess.run(
                ["ogrinfo", "-q", "-dialect", "SQLite", str(shp), "-sql",
                 f'SELECT "{f}" AS v, COUNT(*) AS n FROM "{layer}" GROUP BY "{f}" ORDER BY n DESC LIMIT {limit}'],
                capture_output=True, text=True,
            )
            if res.returncode != 0:
                print("   (not summarizable)")
                continue
            value = None
            for line in res.stdout.splitlines():
                line = line.strip()
                if line.startswith("v ("):
                    value = line.split("=", 1)[1].strip() if "=" in line else line
                elif line.startswith("n (") and value is not None:
                    print(f"   {value}  ×{line.split('=', 1)[1].strip()}")
                    value = None
    finally:
        if keep_work:
            print(f"\nworking dir kept: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


def build(name, fields=None, keep_work=False, dry_run=False):
    cfg = DATASETS[name]
    manifest = load_manifest()
    entry = source_entry(manifest, cfg["source_id"])
    require_tools("ogr2ogr", "ogrinfo", "tippecanoe")

    work = Path(tempfile.mkdtemp(prefix=f"boondock-{name}-"))
    try:
        zip_path, how = resolve_input(entry, work)
        print(f"== {name}: {entry['label']} ({how})")
        shp = unzip_shapefile(zip_path, work)

        # Reproject to WGS84 (these ship in NAD83) and write newline-delimited
        # GeoJSON, which tippecanoe reads without holding the lot in memory
        geojson = work / f"{name}.geojsons"
        cmd = ["ogr2ogr", "-f", "GeoJSONSeq", str(geojson), str(shp), "-t_srs", "EPSG:4326"]
        if fields:
            # An explicit --fields overrides the dataset's projection, which is
            # how you try out a narrower set without editing the script
            cmd += ["-select", ",".join(fields)]
        elif cfg.get("sql"):
            cmd += ["-dialect", "SQLite", "-sql", cfg["sql"].format(layer=shp.stem)]
        run(cmd)

        # How many records went in against how many features came out. These
        # differ by design (the projection drops null-geometry records), but a
        # gap that suddenly widens means upstream changed shape, and a silent
        # 50% loss is exactly the failure this pipeline is meant to make loud.
        total = feature_count(shp)
        written = sum(1 for _ in geojson.open("rb"))
        if total:
            dropped = total - written
            print(f"  {written:,} features to tile, from {total:,} source records"
                  + (f" — {dropped:,} dropped ({100 * dropped / total:.1f}%, no geometry)" if dropped else ""))
        print(f"  intermediate: {geojson.stat().st_size / 1e6:.0f} MB")
        if not written:
            sys.exit("  nothing to tile — the projection matched no features")

        out = OUT_DIR / cfg["out"]
        tmp_out = work / cfg["out"]
        run([
            "tippecanoe",
            "-o", str(tmp_out),
            "-l", cfg["layer_name"],
            "-Z", str(cfg["min_zoom"]),
            "-z", str(cfg["max_zoom"]),
            # Keep the network readable at low zoom without deleting roads
            # outright: simplify hard when zoomed out, and only thin where the
            # tile would otherwise blow its size budget.
            "--simplification=4",
            "--drop-densest-as-needed",
            "--extend-zooms-if-still-dropping",
            # The spinner emits thousands of lines, which buries the feature
            # count and the per-zoom warnings that are worth reading in a CI log
            "--no-progress-indicator",
            "--force",
            str(geojson),
        ])

        size = tmp_out.stat().st_size
        print(f"  tiled: {size / 1e6:.1f} MB")
        if size > MAX_OUTPUT_BYTES:
            sys.exit(
                f"{cfg['out']} is {size / 1e6:.0f} MB, over the {MAX_OUTPUT_BYTES / 1e6:.0f} MB "
                "ceiling GitHub imposes.\nNarrow the attributes with --fields (run --inspect to "
                "see what's there), or lower --max-zoom in DATASETS."
            )

        if dry_run:
            print(f"  dry run — not writing {out}")
            return

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        shutil.move(str(tmp_out), out)
        print(f"  wrote {out}")

        # Stamp what we built from, so row 97's weekly check can say "what we
        # publish is behind upstream" rather than only "upstream moved"
        entry["built_from"] = (entry.get("seen") or {}).get("last_modified")
        entry["built_on"] = date.today().isoformat()
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"  stamped built_from={entry['built_from']} in upstream_sources.json")
    finally:
        if keep_work:
            print(f"  working dir kept: {work}")
        else:
            shutil.rmtree(work, ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--inspect", action="store_true", help="print the real schema and value frequencies, build nothing")
    ap.add_argument("--build", action="store_true", help="reproject, tile, and write the archive")
    ap.add_argument("--fields", help="comma-separated attributes to keep (default: all)")
    ap.add_argument("--dry-run", action="store_true", help="tile and report the size without writing into web/public/data")
    ap.add_argument("--keep-work", action="store_true", help="leave the staging directory for poking at")
    ap.add_argument("datasets", nargs="+", choices=sorted(DATASETS), help="which datasets to process")
    args = ap.parse_args()

    if args.inspect == args.build:
        ap.error("choose exactly one of --inspect or --build")

    fields = [f.strip() for f in args.fields.split(",")] if args.fields else None
    for name in args.datasets:
        if args.inspect:
            inspect(name, keep_work=args.keep_work)
        else:
            build(name, fields=fields, keep_work=args.keep_work, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
