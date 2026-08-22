#!/usr/bin/env python3
"""Node the MVUM linework into a routable graph (VISION rows 91/133).

The tilesets built by build_road_pmtiles.py are *drawing* geometry: each road
is an independent line, clipped at tile edges, simplified for display. You
cannot route on that. A router needs a connected network — shared nodes where
roads meet, and edges between them — which is why this reads the shapefile
rather than the tiles.

What it does:

  1. snap every vertex to a ~1 m grid, because two roads that meet are drawn
     with coordinates that agree to about that precision and no further
  2. find the junctions: any snapped point used by more than one feature, plus
     every feature's own endpoints
  3. split each road at its junctions — those pieces are the graph's edges
  4. drop what can't be driven and what leads nowhere

Output is one JSON graph per region, loaded by the app the same lazy way the
per-state sites are. Coordinates are rounded to 5 decimals (~1 m), which is
below the accuracy of the source and roughly halves the file.

    python3 data-pipeline/build_route_graph.py --state OR
    python3 data-pipeline/build_route_graph.py --all
    python3 data-pipeline/build_route_graph.py --from-geojson roads.geojsons --key test
"""

import argparse
import json
import re
from datetime import date
import math
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

MANIFEST = Path(__file__).with_name("upstream_sources.json")
OUT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "data"

# ~1.1 m at the equator. Tighter and genuine junctions fall apart; looser and
# roads that merely pass near each other get welded together.
SNAP = 1e-5
COORD_DP = 5

# The projection the router needs. Mirrors build_road_pmtiles.py's mvum SQL —
# same column names, so the two stay legible side by side.
MVUM_SQL = """
    SELECT GEOMETRY,
           NAME AS name,
           ID AS rte,
           CAST(SYMBOL AS integer) AS sym,
           CASE WHEN INSTR(SURFACETYP, ' - ') > 0
                THEN SUBSTR(SURFACETYP, 1, INSTR(SURFACETYP, ' - ') - 1)
                ELSE SURFACETYP END AS surf,
           CAST(SUBSTR(OPERATIONA, 1, 1) AS integer) AS oml,
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
"""

R_EARTH_MI = 3958.8


def haversine_mi(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, [a[0], a[1], b[0], b[1]])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R_EARTH_MI * math.asin(min(1, math.sqrt(h)))


def line_miles(coords):
    return sum(haversine_mi(coords[i - 1], coords[i]) for i in range(1, len(coords)))


def snap(pt):
    return (round(pt[0] / SNAP), round(pt[1] / SNAP))


def unsnap(key):
    return [round(key[0] * SNAP, COORD_DP), round(key[1] * SNAP, COORD_DP)]


def read_features(path):
    """Stream GeoJSONSeq, yielding (coords, props) for every line part."""
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                feat = json.loads(line)
            except json.JSONDecodeError:
                continue
            geom = feat.get("geometry") or {}
            props = feat.get("properties") or {}
            if geom.get("type") == "LineString":
                yield geom["coordinates"], props
            elif geom.get("type") == "MultiLineString":
                for part in geom["coordinates"]:
                    yield part, props


def build_graph(feature_iter, min_edge_mi=0.0):
    """Snap, find junctions, split, and emit {nodes, edges}."""
    # Pass 1: how many distinct features touch each snapped point
    features = []
    use_count = defaultdict(int)
    for coords, props in feature_iter:
        clean = [c[:2] for c in coords if c and len(c) >= 2]
        if len(clean) < 2:
            continue
        keys = [snap(c) for c in clean]
        # Deduplicate consecutive identical points, which shapefiles are full of
        deduped = [clean[0]]
        dkeys = [keys[0]]
        for c, k in zip(clean[1:], keys[1:]):
            if k != dkeys[-1]:
                deduped.append(c)
                dkeys.append(k)
        if len(deduped) < 2:
            continue
        features.append((deduped, dkeys, props))
        for k in set(dkeys):
            use_count[k] += 1

    # Pass 2: split each feature wherever another feature touches it, and at
    # its own two ends
    node_ids = {}
    nodes = []

    def node_id(key):
        if key not in node_ids:
            node_ids[key] = len(nodes)
            nodes.append(unsnap(key))
        return node_ids[key]

    edges = []
    for coords, keys, props in features:
        breaks = {0, len(coords) - 1}
        for i, k in enumerate(keys):
            if use_count[k] > 1:
                breaks.add(i)
        cuts = sorted(breaks)
        for start, end in zip(cuts, cuts[1:]):
            geom = [[round(c[0], COORD_DP), round(c[1], COORD_DP)] for c in coords[start:end + 1]]
            if len(geom) < 2:
                continue
            miles = round(line_miles(geom), 4)
            if miles < min_edge_mi:
                continue
            a, b = node_id(keys[start]), node_id(keys[end])
            if a == b:
                continue      # a loop back to the same junction routes nowhere
            edges.append({
                "a": a, "b": b, "g": geom, "m": miles,
                "name": (props.get("name") or "").strip() or None,
                "rte": (str(props.get("rte")).strip() if props.get("rte") else None),
                "sym": props.get("sym"),
                "surf": (props.get("surf") or "").strip() or None,
                "oml": props.get("oml"),
                "veh": props.get("veh") or 0,
            })

    # Drop nodes nothing references (a split can orphan one), renumbering as we go
    used = sorted({e["a"] for e in edges} | {e["b"] for e in edges})
    remap = {old: new for new, old in enumerate(used)}
    kept_nodes = [nodes[i] for i in used]
    for e in edges:
        e["a"] = remap[e["a"]]
        e["b"] = remap[e["b"]]
    return {"nodes": kept_nodes, "edges": edges}


def graph_stats(graph):
    """Connectivity is the number worth watching: a graph that nodes badly
    still 'builds', it just can't route anywhere."""
    adj = defaultdict(list)
    for i, e in enumerate(graph["edges"]):
        adj[e["a"]].append(e["b"])
        adj[e["b"]].append(e["a"])
    seen = set()
    components = []
    for start in range(len(graph["nodes"])):
        if start in seen:
            continue
        stack, size = [start], 0
        seen.add(start)
        while stack:
            n = stack.pop()
            size += 1
            for m in adj[n]:
                if m not in seen:
                    seen.add(m)
                    stack.append(m)
        components.append(size)
    components.sort(reverse=True)
    total = len(graph["nodes"]) or 1
    return {
        "nodes": len(graph["nodes"]),
        "edges": len(graph["edges"]),
        "miles": round(sum(e["m"] for e in graph["edges"]), 1),
        "components": len(components),
        "largest_component": components[0] if components else 0,
        "largest_share": round((components[0] if components else 0) / total, 3),
    }


# The app already has per-state bounds and they drive its lazy loading, so the
# graphs are cut on exactly the same lines rather than a second set that could
# drift. Read straight out of the JS rather than copied into Python.
STATE_BOUNDS_JS = Path(__file__).resolve().parent.parent / "boondock" / "src" / "shared" / "stateBounds.js"


def state_bbox(state):
    st = state.lower()
    text = STATE_BOUNDS_JS.read_text()
    match = re.search(rf"^\s*{re.escape(st)}:\s*\[([^\]]+)\]", text, re.M)
    if not match:
        sys.exit(f"no bounds for '{state}' in {STATE_BOUNDS_JS.name}")
    return [float(v) for v in match.group(1).split(",")]


def ogr_to_geojsonseq(src, out, where=None, sql=None):
    cmd = ["ogr2ogr", "-f", "GeoJSONSeq", str(out), str(src), "-t_srs", "EPSG:4326"]
    if sql:
        cmd += ["-dialect", "SQLite", "-sql", sql]
    if where:
        cmd += ["-spat", *[str(v) for v in where]]
    print("  $ " + " ".join(cmd[:8]) + (" …" if len(cmd) > 8 else ""))
    subprocess.run(cmd, check=True)


def resolve_shapefile(work: Path):
    """The mirrored MVUM zip, unpacked. Mirrors build_road_pmtiles.py."""
    manifest = json.loads(MANIFEST.read_text())
    entry = next(s for s in manifest["sources"] if s["id"] == "usfs-mvum")
    backup = entry.get("backup") or {}
    location = backup.get("location")
    candidates = []
    if location:
        candidates = [Path(location), Path.home() / "data" / "cidrlab" / "boondock_map" / Path(location).name]
    zip_path = next((c for c in candidates if c.is_file()), None)
    if zip_path is None:
        sys.exit(
            "No local MVUM mirror found. Either run data-pipeline/mirror_upstream.py "
            "first, or use --from-geojson with data you already have."
        )
    target = work / "src"
    target.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(target)
    shp = sorted(target.rglob("*.shp"))
    if not shp:
        sys.exit(f"no .shp inside {zip_path}")
    return shp[0]


def write_graph(key, graph, stats):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"routegraph-{key}.json"
    lons = [n[0] for n in graph["nodes"]] or [0]
    lats = [n[1] for n in graph["nodes"]] or [0]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    doc = {
        "version": 1,
        "key": key,
        "bbox": bbox,
        "stats": stats,
        "nodes": graph["nodes"],
        "edges": graph["edges"],
    }
    out.write_text(json.dumps(doc, separators=(",", ":")))
    print(f"  wrote {out} ({out.stat().st_size / 1e6:.1f} MB)")
    update_manifest(key, bbox, stats, out.stat().st_size)
    return out


def update_manifest(key, bbox, stats, size_bytes):
    """Publish which areas have a graph, so the app never probes for 404s.

    The app reads this one small file to decide whether routing is offered at
    all. Until a graph exists for where you are, the feature stays out of the
    way rather than offering a button that can only fail.
    """
    path = OUT_DIR / "routegraphs.json"
    try:
        doc = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        doc = {"version": 1, "graphs": []}
    doc["graphs"] = [g for g in doc.get("graphs", []) if g.get("key") != key]
    doc["graphs"].append({
        "key": key,
        "bbox": [round(v, 4) for v in bbox],
        "bytes": size_bytes,
        "nodes": stats["nodes"],
        "edges": stats["edges"],
        "miles": stats["miles"],
        "built": date.today().isoformat(),
    })
    doc["graphs"].sort(key=lambda g: g["key"])
    path.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"  listed in {path.name} ({len(doc['graphs'])} graph(s) available)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--state", help="two-letter state, clipped by its bounds")
    ap.add_argument("--all", action="store_true", help="one graph for the whole country")
    ap.add_argument("--from-geojson", help="skip the shapefile and node this GeoJSONSeq instead")
    ap.add_argument("--key", help="output name (defaults to the state, or 'us')")
    ap.add_argument("--min-edge-mi", type=float, default=0.0, help="drop edges shorter than this")
    ap.add_argument("--stats-only", action="store_true", help="report connectivity, write nothing")
    args = ap.parse_args()

    if not (args.state or args.all or args.from_geojson):
        ap.error("pass --state, --all, or --from-geojson")

    work = Path(tempfile.mkdtemp(prefix="boondock-graph-"))
    try:
        if args.from_geojson:
            src_json = Path(args.from_geojson)
            key = args.key or src_json.stem
        else:
            shp = resolve_shapefile(work)
            src_json = work / "roads.geojsons"
            spat = state_bbox(args.state) if args.state else None
            ogr_to_geojsonseq(shp, src_json, where=spat, sql=MVUM_SQL.format(layer=shp.stem))
            key = args.key or (args.state.lower() if args.state else "us")

        print(f"== building graph '{key}'")
        graph = build_graph(read_features(src_json), min_edge_mi=args.min_edge_mi)
        stats = graph_stats(graph)
        for k, v in stats.items():
            print(f"  {k:>18}: {v}")
        if stats["largest_share"] < 0.5 and stats["nodes"] > 100:
            print("  ! the largest connected component holds under half the nodes —")
            print("    that usually means the snap tolerance is wrong for this data")
        if not args.stats_only:
            write_graph(key, graph, stats)
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
