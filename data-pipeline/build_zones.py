#!/usr/bin/env python3
# ==========================================================================
# Boondocking-likelihood zones v1 — Washington
# ==========================================================================
# Author: Tim Thomas
# Created: 2026-07-11
# ==========================================================================
# Heuristic: USFS-owned land (EDW BasicOwnership) within ~300 m of a legal
# MVUM road (EDW_MVUM_01 layer 1). Explicitly NOT modeled in v1: closures,
# slope, water setbacks, district-specific camping rules. Output is a beta
# advisory layer, labeled as such in the app.
#
# Sources (both US Government / USFS, public domain):
#   https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1
#   https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0
#
# Usage: python3 build_zones.py <out.geojson>

import json, math, sys, time, urllib.parse, urllib.request

MVUM = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1/query'
OWN = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_BasicOwnership_01/MapServer/0/query'
WA = (-124.9, 45.5, -116.9, 49.05)
CELL = 0.5
BUFFER_DEG = 0.003          # ~250-330 m at WA latitudes
SIMPLIFY_DEG = 0.0006

from shapely import make_valid
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

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

def main(out_path):
    x0, y0, x1, y1 = WA
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

    merged = unary_union(zones).simplify(SIMPLIFY_DEG)
    polys = list(merged.geoms) if merged.geom_type == 'MultiPolygon' else [merged]
    fc = {
        'type': 'FeatureCollection',
        'attribution': 'Derived from USFS MVUM roads + USFS Basic Ownership (public domain). Heuristic beta — not a statement of legality. Generated 2026-07-11.',
        'features': [
            {'type': 'Feature', 'geometry': mapping(p), 'properties': {}}
            for p in polys if p.area > 1e-6
        ],
    }
    txt = json.dumps(fc, separators=(',', ':'))
    # 5-decimal coordinate rounding happened server-side via geometryPrecision
    open(out_path, 'w').write(txt)
    print(f'DONE cells={cells} polygons={len(fc["features"])} bytes={len(txt)}', flush=True)

if __name__ == '__main__':
    main(sys.argv[1])
