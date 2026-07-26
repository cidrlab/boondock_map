#!/usr/bin/env python3
"""Check whether the upstream bulk datasets have changed (VISION row 84).

Self-hosting USFS roads and trails takes us off their flaky live service, but
it also freezes the data at whatever we downloaded. Stale road and closure data
on a backcountry map is the failure mode that actually hurts someone, so the
copy we ship has to be checked against upstream on a schedule rather than
whenever somebody remembers.

The check is cheap: these files serve Last-Modified, ETag and Content-Length,
so a HEAD request settles it without pulling ~450 MB.

    python3 data-pipeline/check_upstream.py            # report only
    python3 data-pipeline/check_upstream.py --update   # record what upstream serves now
    python3 data-pipeline/check_upstream.py --update --issue   # ...and file/update a GitHub issue

Exit codes: 0 = no change, 1 = a source could not be reached, 2 = something
changed. Two states matter and they are not the same:

  * upstream moved since we last looked  -> there is new data to pull
  * upstream differs from `built_from`   -> what we publish is behind upstream

The second is the one that matters to users, and it stays true until a rebuild
ships, so it keeps reporting rather than resetting itself.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

MANIFEST = Path(__file__).with_name("upstream_sources.json")
ISSUE_MARKER = "<!-- boondock-upstream-check -->"
ISSUE_LABEL = "upstream-change"
TIMEOUT = 45


def head(url):
    """HEAD the URL and return its cache validators."""
    req = urllib.request.Request(url, method="HEAD")
    req.add_header("User-Agent", "boondock-map-upstream-check")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        length = res.headers.get("Content-Length")
        return {
            "last_modified": res.headers.get("Last-Modified"),
            "etag": res.headers.get("ETag"),
            "content_length": int(length) if length and length.isdigit() else None,
        }


def changed(before, now):
    """Which validators moved. ETag alone is enough, but servers drop it."""
    if not before or before.get("last_modified") is None:
        return []  # never recorded — first look, not a change
    return [
        field
        for field in ("last_modified", "etag", "content_length")
        if before.get(field) != now.get(field)
    ]


def age_days(last_modified):
    """How old the upstream file itself is, in days."""
    if not last_modified:
        return None
    for fmt in ("%a, %d %b %Y %H:%M:%S %Z", "%a, %d %b %Y %H:%M:%S GMT"):
        try:
            dt = datetime.strptime(last_modified, fmt).replace(tzinfo=timezone.utc)
            return (datetime.now(timezone.utc) - dt).days
        except ValueError:
            continue
    return None


def mib(n):
    return f"{n / 1048576:.1f} MB" if isinstance(n, int) else "unknown size"


def check_all(manifest):
    moved, behind, unreachable, unbacked, lines = [], [], [], [], []

    for src in manifest["sources"]:
        label = src["label"]
        try:
            now = head(src["url"])
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
            unreachable.append(src)
            lines.append(f"- ⚠️ **{label}** — could not be reached: {e}")
            continue

        diff = changed(src.get("seen"), now)
        age = age_days(now.get("last_modified"))
        age_note = f", upstream file is {age} days old" if age is not None else ""
        stamp = now.get("last_modified") or "no Last-Modified"

        if diff:
            moved.append((src, now, diff))
            lines.append(
                f"- 🔴 **{label}** changed ({', '.join(diff)}) — now {stamp}, "
                f"{mib(now.get('content_length'))}{age_note}"
            )
        elif src.get("seen", {}).get("last_modified") is None:
            moved.append((src, now, ["first check"]))
            lines.append(f"- 🆕 **{label}** — first check, now {stamp}, {mib(now.get('content_length'))}")
        else:
            lines.append(f"- ✅ **{label}** unchanged — {stamp}{age_note}")

        built = src.get("built_from")
        if built and now.get("last_modified") and built != now["last_modified"]:
            behind.append(src)
            lines.append(f"    ↳ **what we publish is behind upstream** (built from {built})")

        # A source we depend on with no copy of our own is a single point of
        # failure the moment the agency withdraws it (standing rule, 2026-07-25)
        if not src.get("backup", {}).get("held"):
            unbacked.append(src)
            lines.append("    ↳ no local backup held — mirror a copy")

        # Record what upstream serves now regardless; --update decides whether
        # this is written back to disk
        src["_now"] = now

    return moved, behind, unreachable, unbacked, lines


def write_manifest(manifest, path=MANIFEST):
    today = date.today().isoformat()
    for src in manifest["sources"]:
        now = src.pop("_now", None)
        if now:
            src["seen"] = now
            src["checked"] = today
    path.write_text(json.dumps(manifest, indent=2) + "\n")


def gh_request(url, token, data=None, method=None):
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "boondock-upstream-check")
    with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
        return json.loads(res.read().decode() or "{}")


def report_issue(body):
    """Comment on the existing open issue, or open one. Never spam a new issue
    a week — the check runs on a schedule and would otherwise pile up."""
    token = os.environ.get("GITHUB_TOKEN", "")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not (token and repo):
        print("GITHUB_TOKEN / GITHUB_REPOSITORY not set — skipping issue", file=sys.stderr)
        return
    try:
        found = gh_request(
            f"https://api.github.com/repos/{repo}/issues?state=open&labels={ISSUE_LABEL}&per_page=20",
            token,
        )
        existing = next((i for i in found if ISSUE_MARKER in (i.get("body") or "")), None)
        if existing:
            gh_request(
                f"https://api.github.com/repos/{repo}/issues/{existing['number']}/comments",
                token,
                data=json.dumps({"body": body}).encode(),
                method="POST",
            )
            print(f"Commented on existing issue #{existing['number']}")
        else:
            created = gh_request(
                f"https://api.github.com/repos/{repo}/issues",
                token,
                data=json.dumps(
                    {
                        "title": "Upstream map data has changed",
                        "body": body,
                        "labels": [ISSUE_LABEL],
                    }
                ).encode(),
                method="POST",
            )
            print(f"Opened issue #{created['number']}")
    except urllib.error.HTTPError as e:
        print(f"Could not file the issue ({e.code}): {e.read()[:200]}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--update", action="store_true", help="record what upstream serves now")
    ap.add_argument("--issue", action="store_true", help="file/update a GitHub issue on change")
    args = ap.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    moved, behind, unreachable, unbacked, lines = check_all(manifest)

    report = "\n".join(lines)
    print(report)

    if args.update:
        write_manifest(manifest)
        print(f"\nManifest updated: {MANIFEST}")

    if (moved or behind) and args.issue:
        body = "\n".join(
            [
                ISSUE_MARKER,
                "Upstream bulk datasets moved since the last check.",
                "",
                report,
                "",
                (
                    f"**{len(unbacked)} source(s) have no local backup.** Federal "
                    "datasets are treated as at risk of withdrawal, so mirror a "
                    "copy and fill in `backup` in the manifest.\n"
                    if unbacked
                    else ""
                ),
                "**What to do:** re-download the changed sources, rebuild the "
                "PMTiles (VISION row 83), and set `built_from` in "
                "`data-pipeline/upstream_sources.json` to the new `Last-Modified` "
                "so this stops reporting.",
                "",
                f"_Checked {date.today().isoformat()} by "
                "`data-pipeline/check_upstream.py`._",
            ]
        )
        report_issue(body)

    if unreachable:
        return 1
    return 2 if (moved or behind) else 0


if __name__ == "__main__":
    sys.exit(main())
