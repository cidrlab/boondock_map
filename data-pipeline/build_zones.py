#!/usr/bin/env python3
# ==========================================================================
# Boondocking-likelihood zones v2 — multi-state
# ==========================================================================
# Author: Tim Thomas
# Created: 2026-07-11
# Updated: 2026-07-12 — v2 adds terrain: each zone is sampled against the
#   Mapzen DEM (z12) and annotated with flat_pct (share of samples at
#   <= 12% grade); zones with flat_pct < 10 are pruned as cliffside noise.
# Updated: 2026-07-23 — parameterized by state for the Arizona pilot.
# ==========================================================================
# Heuristic: USFS-owned land (EDW BasicOwnership) within ~300 m of a legal
# MVUM road (EDW_MVUM_01 layer 1). Explicitly NOT modeled: closures, water
# setbacks, district-specific camping rules. Output is a beta advisory
# layer, labeled as such in the app.
#
# Sources (both US Government / USFS, public domain):
#   https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1
#   https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0
#
# Usage: python3 build_zones.py <state> <out.geojson>

import io, json, math, sys, time, urllib.parse, urllib.request
from datetime import date

MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query'
OWN = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query'
BBOXES = {
    'wa': (-124.9, 45.5, -116.9, 49.05),
    'az': (-114.85, 31.32, -109.04, 37.01),
}
CELL = 0.5
BUFFER_DEG = 0.003          # ~230-330 m across CONUS latitudes
SIMPLIFY_DEG = 0.0006
SLOPE_Z = 12                # DEM zoom for slope sampling (~26 m/px here)
FLAT_GRADE = 12.0           # percent grade considered campable
PRUNE_BELOW = 10            # drop zones with flat_pct under this

from PIL import Image
from shapely import make_valid
from shapely.geometry import Point, box, shape, mapping
from shapely.ops import unary_union
from shapely.prepared import prep

def fetch(url, params):
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(f'{url}?{qs}', headers={'User-Agent': 'BoondockMap-pipeline/0.1 (tim@cidrlab.org)'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception:
            if attempt == 2: raise
            time.sleep(2)

def query_all(url, extra):
    feats = []
    offset = 0
    while True:
        params = {
            'f': 'geojson', 'where': extra.get('where', '1=1'),
            'geometry': extra['bbox'], 'geometryType': 'esriGeometryEnvelope',
            'inSR': '4326', 'outSR': '4326', 'spatialRel': 'esriSpatialRelIntersects',
            'outFields': extra.get('outFields', ''), 'returnGeometry': 'true',
            'geometryPrecision': '5', 'maxAllowableOffset': '0.0003',
            'resultOffset': str(offset),
        }
        data = fetch(url, params)
        got = data.get('features', [])
        feats.extend(got)
        if not data.get('properties', {}).get('exceededTransferLimit') and not data.get('exceededTransferLimit'):
            break
        offset += len(got)
        if offset > 60000: break   # runaway guard
    return feats

def main(state, out_path):
    x0, y0, x1, y1 = BBOXES[state]
    zones = []
    nx = math.ceil((x1 - x0) / CELL)
    ny = math.ceil((y1 - y0) / CELL)
    cells = 0
    for i in range(nx):
        for j in range(ny):
            cx0, cy0 = x0 + i * CELL, y0 + j * CELL
            bbox = f'{cx0},{cy0},{min(cx0+CELL,x1)},{min(cy0+CELL,y1)}'
            roads = query_all(MVUM, {'bbox': bbox})
            if not roads:
                continue
            own = query_all(OWN, {'bbox': bbox, 'where': "OWNERCLASSIFICATION = 'USDA FOREST SERVICE'"})
            if not own:
                continue
            try:
                # Server-side simplification can emit self-intersecting rings;
                # make_valid before any union or the whole cell is lost
                road_geoms = [make_valid(shape(f['geometry'])) for f in roads if f.get('geometry')]
                own_geoms = [make_valid(shape(f['geometry'])) for f in own if f.get('geometry')]
                buffered = unary_union(road_geoms).buffer(BUFFER_DEG)
                fs_land = unary_union(own_geoms)
                zone = buffered.intersection(fs_land)
                if not zone.is_empty:
                    zones.append(zone)
            except Exception as e:
                print(f'cell {bbox}: geometry error {e}', flush=True)
            cells += 1
            print(f'cell {i},{j}: roads={len(roads)} own={len(own)} zones-so-far={len(zones)}', flush=True)

    # Queried geometries extend past the envelope (whole polygons come back),
    # so clip to the state box — keeps neighboring state builds from overlapping
    merged = unary_union(zones).intersection(box(x0, y0, x1, y1)).simplify(SIMPLIFY_DEG)
    polys = [p for p in (merged.geoms if merged.geom_type == 'MultiPolygon' else [merged]) if p.area > 1e-6]

    # ── v2: terrain annotation ────────────────────────────────────────────
    tile_cache = {}
    def dem_tile(x, y):
        key = (x, y)
        if key not in tile_cache:
            url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{SLOPE_Z}/{x}/{y}.png'
            req = urllib.request.Request(url, headers={'User-Agent': 'BoondockMap-pipeline/0.1 (tim@cidrlab.org)'})
            try:
                tile_cache[key] = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert('RGB')
            except Exception:
                tile_cache[key] = None
        return tile_cache[key]

    def elev_px(img, px, py):
        r, g, b = img.getpixel((px, py))
        return r * 256 + g + b / 256 - 32768

    def slope_pct(lon, lat):
        n = 2 ** SLOPE_Z
        xf = (lon + 180) / 360 * n
        lr = math.radians(lat)
        yf = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
        x, y = int(xf), int(yf)
        img = dem_tile(x, y)
        if img is None: return None
        px = min(254, max(1, int((xf - x) * 256)))
        py = min(254, max(1, int((yf - y) * 256)))
        m_per_px = 156543.03 * math.cos(lr) / (2 ** SLOPE_Z)  # meters per pixel at 256px tiles
        dzdx = (elev_px(img, px + 1, py) - elev_px(img, px - 1, py)) / (2 * m_per_px)
        dzdy = (elev_px(img, px, py + 1) - elev_px(img, px, py - 1)) / (2 * m_per_px)
        return math.hypot(dzdx, dzdy) * 100

    features = []
    pruned = 0
    for p in polys:
        x0, y0, x1, y1 = p.bounds
        area = p.area
        step = max(0.0012, math.sqrt(area / 250))   # <=~250 samples per zone
        prepared = prep(p)
        flat = total = 0
        yy = y0 + step / 2
        while yy < y1:
            xx = x0 + step / 2
            while xx < x1:
                if prepared.contains(Point(xx, yy)):
                    s = slope_pct(xx, yy)
                    if s is not None:
                        total += 1
                        if s <= FLAT_GRADE: flat += 1
                xx += step
            yy += step
        props = {}
        if total >= 4:
            fp = round(100 * flat / total)
            if fp < PRUNE_BELOW:
                pruned += 1
                continue
            props['flat_pct'] = fp
        features.append({'type': 'Feature', 'geometry': mapping(p), 'properties': props})

    fc = {
        'type': 'FeatureCollection',
        'attribution': f'Derived from USFS MVUM roads + USFS Basic Ownership (public domain); terrain from Mapzen tiles (USGS 3DEP). Heuristic beta — not a statement of legality. Generated {date.today().isoformat()}.',
        'features': features,
    }
    txt = json.dumps(fc, separators=(',', ':'))
    open(out_path, 'w').write(txt)
    print(f'DONE cells={cells} polygons={len(features)} pruned={pruned} dem_tiles={len(tile_cache)} bytes={len(txt)}', flush=True)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
