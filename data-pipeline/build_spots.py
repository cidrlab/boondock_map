#!/usr/bin/env python3
# ==========================================================================
# Sites database build — multi-state (v4)
# ==========================================================================
# Author: Tim Thomas
# Created: 2026-07-11 (Washington v3)
# Updated: 2026-07-23 — v4 parameterized by state for the Arizona pilot
# ==========================================================================
# Merges, with cross-source dedup and per-feature `src` attribution:
#   osm         OSM camp/RV/dump/water/trailhead via Overpass extracts
#   overture:*  Overture Maps places (campground, rv_park), release 2026-06-17.0
#   ridb        Recreation.gov RIDB bulk export (CC-BY 4.0) — campgrounds
#   wadnr       WA DNR Campgrounds CSV (geo.wa.gov) — loaded when present
# Adds elev_ft per feature sampled from Mapzen terrarium DEM tiles (z10).
# Licenses and required credits: web/public/data/ATTRIBUTION.md
#
# Usage: build_spots.py <state> <staging_dir> <out.geojson>
#   state is a key of STATES. staging_dir must contain:
#   {state}-spots-raw.json, {state}-trailheads-raw.json,
#   overture_{state}.json, ridb/*.csv, and (WA only) dnr_campgrounds.csv
#   Optional: {state}-boundary.geojson — exact state polygon used to clip
#   Overture/RIDB points where a bbox can't follow the border (AZ's diagonal
#   Sonora line, the Colorado River). Fetch from Nominatim: search with
#   polygon_geojson=1&polygon_threshold=0.0001, take the state relation's
#   geojson member. OSM extracts don't need it — Overpass is area-scoped.

import csv, io, json, math, os, re, sys, urllib.request
from datetime import date
from PIL import Image

# RIDB state code + coordinate sanity box (S, W, N, E — catches bad geocodes)
STATES = {
    'wa': {'ridb': 'WA', 'bbox': (45.0, -125.5, 49.5, -116.0)},
    'az': {'ridb': 'AZ', 'bbox': (31.0, -115.5, 37.5, -108.5)},
}

def point_in_poly(lon, lat, geom):
    # Even-odd ray cast over all rings of a GeoJSON (Multi)Polygon
    rings = geom['coordinates'] if geom['type'] == 'Polygon' else [r for p in geom['coordinates'] for r in p]
    inside = False
    for ring in rings:
        for i in range(len(ring) - 1):
            (x1, y1), (x2, y2) = ring[i], ring[i + 1]
            if (y1 > lat) != (y2 > lat) and lon < x1 + (lat - y1) * (x2 - x1) / (y2 - y1):
                inside = not inside
    return inside

def norm(s):
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())

def dist_m(a, b):
    dx = (a[0] - b[0]) * 111320 * math.cos(math.radians(a[1]))
    dy = (a[1] - b[1]) * 110540
    return math.hypot(dx, dy)

def kind_of(tags):
    t = tags.get('tourism'); a = tags.get('amenity'); h = tags.get('highway')
    if t == 'camp_site': return 'campsite'
    if t == 'caravan_site': return 'rv_park'
    if a == 'sanitary_dump_station': return 'dump'
    if a == 'water_point': return 'water'
    if h == 'trailhead': return 'trailhead'
    return None

def load_osm(path, feats):
    for el in json.load(open(path))['elements']:
        tags = el.get('tags') or {}
        lat = el.get('lat') or (el.get('center') or {}).get('lat')
        lon = el.get('lon') or (el.get('center') or {}).get('lon')
        if lat is None or lon is None: continue
        kind = kind_of(tags)
        if not kind: continue
        p = {'kind': kind, 'src': 'osm', 'osm': f"{el['type']}/{el['id']}"}
        for ks, ko in [('name','name'),('fee','fee'),('access','access'),('operator','operator'),
                       ('website','website'),('description','desc'),('capacity','capacity'),
                       ('drinking_water','drinking_water'),('toilets','toilets'),('reservation','reservation')]:
            if tags.get(ks): p[ko] = tags[ks]
        feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(lon,6),round(lat,6)]},'properties':p})

def clash(feats, kind, pos, name):
    for f in feats:
        if f['properties']['kind'] != kind: continue
        d = dist_m(pos, f['geometry']['coordinates'])
        if d < 150: return True
        fname = norm(f['properties'].get('name'))
        if d < 400 and fname and norm(name) and (fname in norm(name) or norm(name) in fname):
            return True
    return False

def add_overture(path, feats, keep_pt):
    ov = json.load(open(path))
    ov.sort(key=lambda r: -(r['confidence'] or 0))
    kept = []
    for r in ov:
        if not r['name']: continue
        if not keep_pt(r['lng'], r['lat']): continue
        pos = (r['lng'], r['lat'])
        if any(norm(k['name']) == norm(r['name']) and dist_m(pos, (k['lng'], k['lat'])) < 250 for k in kept):
            continue
        kept.append(r)
    added = 0
    kindmap = {'campground': 'campsite', 'rv_park': 'rv_park'}
    for r in kept:
        kind = kindmap[r['category']]
        pos = (r['lng'], r['lat'])
        if clash(feats, kind, pos, r['name']): continue
        p = {'kind': kind, 'src': f"overture:{r['dataset']}", 'name': r['name']}
        if r.get('website'): p['website'] = r['website']
        if r.get('addr'): p['addr'] = ((r['addr'] or '') + (', ' + r['city'] if r.get('city') else '')).strip(', ')
        feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(r['lng'],6),round(r['lat'],6)]},'properties':p})
        added += 1
    return added

def read_csv(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        return list(csv.DictReader(f))

def add_ridb(dirpath, feats, st, keep_pt):
    state_ids = set()
    city = {}
    for row in read_csv(f'{dirpath}/FacilityAddresses_API_v1.csv'):
        if (row.get('AddressStateCode') or '').strip().upper() == st['ridb']:
            fid = row.get('FacilityID')
            state_ids.add(fid)
            city[fid] = (row.get('City') or '').strip().title()
    links = {}
    for row in read_csv(f'{dirpath}/Links_API_v1.csv'):
        if 'web' in (row.get('LinkType') or '').lower():
            links.setdefault(row.get('EntityID'), row.get('URL'))
    added = 0
    s, w, n, e = st['bbox']
    for row in read_csv(f'{dirpath}/Facilities_API_v1.csv'):
        if row.get('FacilityID') not in state_ids: continue
        if (row.get('FacilityTypeDescription') or '').strip() != 'Campground': continue
        try:
            lat, lon = float(row['FacilityLatitude']), float(row['FacilityLongitude'])
        except (ValueError, KeyError):
            continue
        if not (s < lat < n and w < lon < e): continue
        if not keep_pt(lon, lat): continue
        name = (row.get('FacilityName') or '').strip().title()
        if clash(feats, 'campsite', (lon, lat), name): continue
        p = {'kind': 'campsite', 'src': 'ridb', 'name': name}
        if (row.get('Reservable') or '').lower() in ('true', '1', 'yes'): p['reservation'] = 'yes'
        if links.get(row.get('FacilityID')): p['website'] = links[row.get('FacilityID')]
        if city.get(row.get('FacilityID')): p['addr'] = city[row.get('FacilityID')]
        feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(lon,6),round(lat,6)]},'properties':p})
        added += 1
    return added

def add_dnr(path, feats):
    added = 0
    for row in read_csv(path):
        if (row.get('CAMPGROUND') or '').strip().lower() not in ('yes', 'y', 'true', '1'): continue
        try:
            lat, lon = float(row['LAT']), float(row['LONG_'])
        except (ValueError, KeyError):
            continue
        name = (row.get('NAME') or '').strip().title()
        if clash(feats, 'campsite', (lon, lat), name): continue
        p = {'kind': 'campsite', 'src': 'wadnr', 'name': name}
        if row.get('WEBSITE'): p['website'] = row['WEBSITE']
        if row.get('AMENITIES'): p['desc'] = row['AMENITIES'][:160]
        feats.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(lon,6),round(lat,6)]},'properties':p})
        added += 1
    return added

# ── Elevation from terrarium DEM z10 tiles ─────────────────────────────────
Z = 10
def tile_of(lon, lat):
    n = 2 ** Z
    x = int((lon + 180) / 360 * n)
    lr = math.radians(lat)
    y = int((1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n)
    return x, y

def add_elevations(feats):
    groups = {}
    for f in feats:
        lon, lat = f['geometry']['coordinates']
        groups.setdefault(tile_of(lon, lat), []).append(f)
    done = failed = 0
    for (x, y), members in groups.items():
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'BoondockMap-pipeline/0.1 (tim@cidrlab.org)'})
            img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert('RGB')
        except Exception:
            failed += len(members)
            continue
        n = 2 ** Z
        for f in members:
            lon, lat = f['geometry']['coordinates']
            xf = (lon + 180) / 360 * n
            lr = math.radians(lat)
            yf = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
            px = min(255, int((xf - int(xf)) * 256))
            py = min(255, int((yf - int(yf)) * 256))
            r, g, b = img.getpixel((px, py))
            meters = r * 256 + g + b / 256 - 32768
            f['properties']['elev_ft'] = int(round(meters * 3.28084))
            done += 1
    print(f'elevation: {done} sampled across {len(groups)} tiles, {failed} skipped', flush=True)

def main(state, staging, out_path):
    st = STATES[state]
    bpath = f'{staging}/{state}-boundary.geojson'
    if os.path.exists(bpath):
        boundary = json.load(open(bpath))
        keep_pt = lambda lon, lat: point_in_poly(lon, lat, boundary)
    else:
        keep_pt = lambda lon, lat: True
    feats = []
    load_osm(f'{staging}/{state}-spots-raw.json', feats)
    load_osm(f'{staging}/{state}-trailheads-raw.json', feats)
    n_ov = add_overture(f'{staging}/overture_{state}.json', feats, keep_pt)
    n_ridb = add_ridb(f'{staging}/ridb', feats, st, keep_pt)
    dnr_path = f'{staging}/dnr_campgrounds.csv'
    n_dnr = add_dnr(dnr_path, feats) if os.path.exists(dnr_path) else 0
    add_elevations(feats)
    attr = 'OSM (ODbL) via Overpass; Overture Maps Foundation (CDLA-P-2.0/Apache-2.0/CC0); Recreation.gov RIDB (CC-BY 4.0)'
    if n_dnr: attr += '; WA DNR'
    fc = {
        'type': 'FeatureCollection',
        'attribution': f'{attr}. See data/ATTRIBUTION.md. Generated {date.today().isoformat()}.',
        'features': feats,
    }
    json.dump(fc, open(out_path, 'w'), separators=(',', ':'))
    counts = {}
    for f in feats: counts[f['properties']['kind']] = counts.get(f['properties']['kind'], 0) + 1
    print(f'total={len(feats)} {counts} overture+{n_ov} ridb+{n_ridb} dnr+{n_dnr}', flush=True)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
