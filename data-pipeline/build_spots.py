#!/usr/bin/env python3
# ==========================================================================
# Sites database build — Washington (v3)
# ==========================================================================
# Author: Tim Thomas
# Created: 2026-07-11
# ==========================================================================
# Merges, with cross-source dedup and per-feature `src` attribution:
#   osm         OSM camp/RV/dump/water/trailhead via Overpass extracts
#   overture:*  Overture Maps places (campground, rv_park), release 2026-06-17.0
#   ridb        Recreation.gov RIDB bulk export (CC-BY 4.0) — WA campgrounds
#   wadnr       WA DNR Campgrounds CSV (geo.wa.gov)
# Adds elev_ft per feature sampled from Mapzen terrarium DEM tiles (z10).
# Licenses and required credits: web/public/data/ATTRIBUTION.md
#
# Usage: build_spots.py <staging_dir> <out.geojson>
#   staging_dir must contain: wa-spots-raw.json, wa-trailheads-raw.json,
#   overture_wa.json, dnr_campgrounds.csv, ridb/*.csv

import csv, io, json, math, re, sys, urllib.request
from PIL import Image

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

def add_overture(path, feats):
    ov = json.load(open(path))
    ov.sort(key=lambda r: -(r['confidence'] or 0))
    kept = []
    for r in ov:
        if not r['name']: continue
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

def add_ridb(dirpath, feats):
    wa_ids = set()
    city = {}
    for row in read_csv(f'{dirpath}/FacilityAddresses_API_v1.csv'):
        if (row.get('AddressStateCode') or '').strip().upper() == 'WA':
            fid = row.get('FacilityID')
            wa_ids.add(fid)
            city[fid] = (row.get('City') or '').strip().title()
    links = {}
    for row in read_csv(f'{dirpath}/Links_API_v1.csv'):
        if 'web' in (row.get('LinkType') or '').lower():
            links.setdefault(row.get('EntityID'), row.get('URL'))
    added = 0
    for row in read_csv(f'{dirpath}/Facilities_API_v1.csv'):
        if row.get('FacilityID') not in wa_ids: continue
        if (row.get('FacilityTypeDescription') or '').strip() != 'Campground': continue
        try:
            lat, lon = float(row['FacilityLatitude']), float(row['FacilityLongitude'])
        except (ValueError, KeyError):
            continue
        if not (45.0 < lat < 49.5 and -125.5 < lon < -116.0): continue
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

def main(staging, out_path):
    feats = []
    load_osm(f'{staging}/wa-spots-raw.json', feats)
    load_osm(f'{staging}/wa-trailheads-raw.json', feats)
    n_ov = add_overture(f'{staging}/overture_wa.json', feats)
    n_ridb = add_ridb(f'{staging}/ridb', feats)
    n_dnr = add_dnr(f'{staging}/dnr_campgrounds.csv', feats)
    add_elevations(feats)
    fc = {
        'type': 'FeatureCollection',
        'attribution': 'OSM (ODbL) via Overpass; Overture Maps Foundation (CDLA-P-2.0/Apache-2.0/CC0); Recreation.gov RIDB (CC-BY 4.0); WA DNR. See data/ATTRIBUTION.md. Generated 2026-07-11.',
        'features': feats,
    }
    json.dump(fc, open(out_path, 'w'), separators=(',', ':'))
    counts = {}
    for f in feats: counts[f['properties']['kind']] = counts.get(f['properties']['kind'], 0) + 1
    print(f'total={len(feats)} {counts} overture+{n_ov} ridb+{n_ridb} dnr+{n_dnr}', flush=True)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
