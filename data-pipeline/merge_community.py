#!/usr/bin/env python3
# ==========================================================================
# Community reports merge — Worker KV → community.geojson
# ==========================================================================
# Author: Tim Thomas
# Created: 2026-07-24
# ==========================================================================
# Pulls the community-reports Worker's /export (worker/README.md) and
# publishes the approved set as web/public/data/community.geojson, which the
# app draws in the Sites layer as `src: community`. Run by the nightly
# community-merge GitHub Action; the commit it makes triggers the Pages
# deploy, so publishing is: filter → this script → git push.
#
# Trust model (validation is social + temporal, learned from iOverlander /
# FreeRoam — see VISION row 12):
#   - spots publish as `unverified` the night after submission (Worker
#     status 'auto' or moderator-approved 'ok'; 'held'/'no' never publish)
#   - `verified` needs 2+ positive check-ins from salted-IP hashes distinct
#     from each other AND from the submitter — approximate independence,
#     stated honestly in worker/README.md
#   - `confirmed` = newest positive check-in date; the card shows its age,
#     so staleness is never hidden
#   - `maybe_gone` when the two most recent check-ins both say gone
#   - spots with 2+ user flag reports are withheld and printed for review
#   - near-duplicates (same kind within 75 m) keep the oldest submission
#
# Published check-ins carry only {date, ok, comment} — never any IP hash —
# newest first, capped at 12 per spot.
#
# Usage: merge_community.py <out.geojson>
#   Env: COMMUNITY_API (Worker URL), COMMUNITY_ADMIN_TOKEN.
#   Both unset → exits 0 quietly so the Action is a no-op until the Worker
#   is deployed (worker/README.md step 2).

import json, math, os, sys, urllib.request

MAX_PUBLISHED_CHECKINS = 12
DUP_METERS = 75
FLAG_WITHHOLD = 2
VERIFY_CONFIRMATIONS = 2

# Cloudflare bans the default "Python-urllib" User-Agent at the edge (error
# 1010 → HTTP 403) before the request ever reaches the Worker's own auth, so
# every Worker call must send a real UA (verified 2026-07-29: urllib UA → 403,
# any normal UA → the Worker's 401/200).
USER_AGENT = 'BoondockMap-community-merge/1.0 (+https://boondockmap.com)'


def haversine_m(lng1, lat1, lng2, lat2):
    r = 6371000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def fetch_export(api, token):
    req = urllib.request.Request(api.rstrip('/') + '/export',
                                 headers={'Authorization': f'Bearer {token}',
                                          'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def build_features(export):
    spots = [s for s in export.get('spots', []) if s.get('st') in ('auto', 'ok')]
    checkins = [c for c in export.get('checkins', []) if not c.get('held')]
    flags = export.get('flags', [])

    # Withhold anything 2+ distinct users flagged, pending Tim's call
    flaggers = {}
    for f in flags:
        flaggers.setdefault(f['spot'], set()).add(f.get('ip', '?'))
    withheld = {sid for sid, ips in flaggers.items() if len(ips) >= FLAG_WITHHOLD}
    for sid in sorted(withheld):
        print(f'withheld (2+ flags, review via worker /queue): {sid}')
    spots = [s for s in spots if s['id'] not in withheld]

    # Oldest submission wins a near-duplicate pair of the same kind
    spots.sort(key=lambda s: s.get('created', ''))
    kept = []
    for s in spots:
        dup = next((k for k in kept if k['kind'] == s['kind'] and haversine_m(
            s['lng'], s['lat'], k['lng'], k['lat']) < DUP_METERS), None)
        if dup:
            print(f"dropped duplicate {s['id']} ({s['name']!r} ~{dup['id']})")
        else:
            kept.append(s)

    by_spot = {}
    for c in checkins:
        by_spot.setdefault(c['spot'], []).append(c)

    features = []
    for s in kept:
        cis = sorted(by_spot.get(s['id'], []), key=lambda c: c.get('date', ''), reverse=True)
        confirmers = {c.get('ip') for c in cis if c.get('ok') and c.get('ip') not in (None, s.get('ip'))}
        verified = len(confirmers) >= VERIFY_CONFIRMATIONS
        positive_dates = [c['date'] for c in cis if c.get('ok')]
        maybe_gone = len(cis) >= 2 and not cis[0].get('ok') and not cis[1].get('ok')
        props = {
            'id': s['id'],
            'kind': s['kind'],
            'name': s['name'],
            'src': 'community',
            'status': 'verified' if verified else 'unverified',
            'reported': s.get('created', '')[:10],
            'checkins': [{'date': c.get('date', ''), 'ok': bool(c.get('ok')),
                          **({'comment': c['comment']} if c.get('comment') else {})}
                         for c in cis[:MAX_PUBLISHED_CHECKINS]],
        }
        if s.get('desc'):
            props['desc'] = s['desc']
        if positive_dates:
            props['confirmed'] = max(positive_dates)
        if maybe_gone:
            props['maybe_gone'] = True
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': [s['lng'], s['lat']]},
            'properties': props,
        })
    features.sort(key=lambda f: f['properties']['id'])
    return features


def write_geojson(features, out_path):
    # One feature per line: the file doubles as the public audit trail, so
    # nightly git diffs must read per-spot, not as one changed blob
    lines = ',\n'.join(json.dumps(f, separators=(',', ':'), sort_keys=True) for f in features)
    body = '{"type":"FeatureCollection","features":[\n' + lines + '\n]}\n' if features \
        else '{"type":"FeatureCollection","features":[]}\n'
    with open(out_path, 'w') as fh:
        fh.write(body)


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: merge_community.py <out.geojson>')
    api = os.environ.get('COMMUNITY_API', '').strip()
    token = os.environ.get('COMMUNITY_ADMIN_TOKEN', '').strip()
    if not api or not token:
        print('COMMUNITY_API / COMMUNITY_ADMIN_TOKEN unset — nothing to merge yet')
        return
    export = fetch_export(api, token)
    features = build_features(export)
    write_geojson(features, sys.argv[1])
    verified = sum(1 for f in features if f['properties']['status'] == 'verified')
    print(f'wrote {len(features)} community spots ({verified} verified) to {sys.argv[1]}')


if __name__ == '__main__':
    main()
