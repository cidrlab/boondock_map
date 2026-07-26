#!/usr/bin/env python3
"""Mirror an upstream dataset locally as a backup (VISION row 85).

Standing rule (Tim, 2026-07-25): assume US federal datasets can be withdrawn or
quietly stop updating. Keep using the official server while it is there, but
hold our own copy so a withdrawal is an inconvenience rather than a dead
feature.

Where a backup goes depends on size (Tim, 2026-07-25):

  * small enough to be harmless in git (<= 20 MB) -> commit it into the repo,
    where it is versioned, diffable and impossible to lose with a laptop
  * anything bigger -> ~/data/cidrlab/<repo>, because GitHub warns past 50 MB
    and refuses past 100 MB per file, and a fat repo punishes every clone

This script reports which side of that line each file falls on. It records the
location and checksum in upstream_sources.json either way, so we always know
what we hold and can verify it later.

    python3 data-pipeline/mirror_upstream.py --dest ~/archive/boondock
    python3 data-pipeline/mirror_upstream.py --dest ~/archive/boondock --only usfs-mvum
    python3 data-pipeline/mirror_upstream.py --dest ~/archive/boondock --verify

--verify re-hashes what we already hold and reports drift or loss without
downloading anything.
"""

import argparse
import hashlib
import json
import shutil
import sys
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

MANIFEST = Path(__file__).with_name("upstream_sources.json")
CHUNK = 1 << 20
# Below this, a dataset is better off committed than filed away on one machine
IN_REPO_MAX_BYTES = 20 * 1024 * 1024


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def upstream_length(url):
    """Content-Length from a HEAD, or None if the server won't say."""
    req = urllib.request.Request(url, method="HEAD")
    req.add_header("User-Agent", "boondock-map-mirror")
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            n = res.headers.get("Content-Length")
            return int(n) if n and n.isdigit() else None
    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
        return None


def download(url, dest):
    """Download to a temp name, then rename — a half-file must never be
    mistaken for a good backup."""
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "boondock-map-mirror")
    with urllib.request.urlopen(req, timeout=120) as res, open(tmp, "wb") as out:
        expected = res.headers.get("Content-Length")
        expected = int(expected) if expected and expected.isdigit() else None
        shutil.copyfileobj(res, out, CHUNK)
    got = tmp.stat().st_size
    if expected is not None and got != expected:
        tmp.unlink(missing_ok=True)
        raise IOError(f"truncated download: got {got} bytes, expected {expected}")
    tmp.replace(dest)
    return got


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dest", required=True, help="directory to store backups in")
    ap.add_argument("--only", help="mirror just this source id")
    ap.add_argument("--verify", action="store_true", help="re-hash existing copies, download nothing")
    ap.add_argument("--force", action="store_true", help="re-download even if a current copy is held")
    args = ap.parse_args()

    dest_dir = Path(args.dest).expanduser()
    manifest = json.loads(MANIFEST.read_text())
    failures = 0

    for src in manifest["sources"]:
        if args.only and src["id"] != args.only:
            continue
        name = src["url"].rsplit("/", 1)[-1]
        path = dest_dir / name
        backup = src.setdefault("backup", {"held": False, "location": None, "sha256": None, "date": None})

        if args.verify:
            if not backup.get("held"):
                print(f"  {src['id']}: no backup recorded")
                continue
            if not path.exists():
                print(f"  {src['id']}: RECORDED BUT MISSING at {path}", file=sys.stderr)
                failures += 1
                continue
            digest = sha256_of(path)
            if digest != backup.get("sha256"):
                print(f"  {src['id']}: CHECKSUM DRIFT at {path}", file=sys.stderr)
                failures += 1
            else:
                print(f"  {src['id']}: verified ({path})")
            continue

        # Upstream's Last-Modified is what tells us our copy is current
        upstream_stamp = (src.get("seen") or {}).get("last_modified")
        if backup.get("held") and backup.get("stamp") == upstream_stamp and not args.force:
            print(f"  {src['id']}: current copy already held, skipping")
            continue

        dest_dir.mkdir(parents=True, exist_ok=True)

        # A previous run may have finished the file but died before recording
        # it. Adopt a complete-looking copy rather than pulling it again —
        # these are hundreds of megabytes.
        remote_len = upstream_length(src["url"])
        if path.exists() and remote_len is not None and path.stat().st_size == remote_len and not args.force:
            size = remote_len
            print(f"  {src['id']}: complete copy already on disk, adopting without re-download")
        else:
            print(f"  {src['id']}: downloading {src['url']}")
            try:
                size = download(src["url"], path)
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
                print(f"  {src['id']}: FAILED — {e}", file=sys.stderr)
                failures += 1
                continue

        src["backup"] = {
            "held": True,
            "location": str(path),
            "sha256": sha256_of(path),
            "date": date.today().isoformat(),
            "stamp": upstream_stamp,
            "bytes": size,
        }
        where = (
            "small enough to commit into the repo instead"
            if size <= IN_REPO_MAX_BYTES
            else "too big for git, archive only"
        )
        print(f"  {src['id']}: held {size / 1048576:.1f} MB at {path} — {where}")

    if not args.verify:
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"\nManifest updated: {MANIFEST}")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
