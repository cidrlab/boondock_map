#!/usr/bin/env python3
"""Turn in-app feedback into GitHub issues (VISION row 66).

Runs from .github/workflows/feedback-issues.yml. Pulls the Worker's pending
feedback, opens one issue per item, then tells the Worker which ones were
filed so nothing is filed twice.

The GitHub credential is the workflow's own GITHUB_TOKEN, which exists only
for the length of the run. That is the whole reason for this shape: the
Worker never holds a GitHub token, so a compromised Worker can't touch the
repo — and people without a GitHub account can still file issues.

Env:
  COMMUNITY_API          deployed Worker URL
  COMMUNITY_ADMIN_TOKEN  Worker admin token
  GITHUB_TOKEN           provided by Actions (needs issues: write)
  GITHUB_REPOSITORY      "owner/repo", provided by Actions

Exits 0 and does nothing when the secrets aren't set, so the workflow stays
inert until the Worker is deployed.
"""

import json
import os
import sys
import urllib.error
import urllib.request

API = os.environ.get("COMMUNITY_API", "").rstrip("/")
ADMIN = os.environ.get("COMMUNITY_ADMIN_TOKEN", "")
GH_TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPOSITORY", "")

# Cloudflare bans the default "Python-urllib" User-Agent at the edge (error
# 1010 → HTTP 403) before the Worker's own auth runs, so Worker calls must send
# a real UA. The GitHub calls set their own UA, which overrides this default.
USER_AGENT = "BoondockMap-feedback-filer/1.0 (+https://boondockmap.com)"

# Feedback kind → issue labels. Labels are created on demand by GitHub only if
# they already exist; unknown labels make the API reject the issue, so these
# must match labels present in the repo (the workflow creates them first).
KIND_LABELS = {
    "bug": ["bug", "from-app"],
    "idea": ["enhancement", "from-app"],
    "data": ["data", "from-app"],
    "other": ["from-app"],
}
KIND_TITLE = {
    "bug": "Bug",
    "idea": "Idea",
    "data": "Map data",
    "other": "Feedback",
}


def request(url, *, data=None, headers=None, method=None):
    req = urllib.request.Request(url, data=data, method=method)
    # Default UA so Worker calls clear Cloudflare's edge; per-call headers
    # (e.g. GitHub's own User-Agent) override it.
    merged = {"User-Agent": USER_AGENT, **(headers or {})}
    for k, v in merged.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode() or "{}")


def first_line(text, limit=70):
    """Issue titles read better as one line; the body keeps the full text."""
    line = " ".join(text.split())
    if len(line) <= limit:
        return line
    return line[: limit - 1].rstrip() + "…"


def issue_body(item):
    parts = [item["message"].strip(), ""]
    if item.get("contact"):
        parts.append(f"**Contact given:** {item['contact']}")
    parts.append(f"**Submitted:** {item.get('created', 'unknown')}")
    parts.append(f"**Feedback id:** `{item['id']}`")
    parts.append("")
    parts.append(
        "_Filed automatically from in-app feedback. The reporter has no GitHub "
        "account and will not see replies here unless they left a contact._"
    )
    return "\n".join(parts)


def main():
    if not (API and ADMIN):
        print("COMMUNITY_API / COMMUNITY_ADMIN_TOKEN not set — nothing to do")
        return 0
    if not (GH_TOKEN and REPO):
        print("GITHUB_TOKEN / GITHUB_REPOSITORY missing — cannot file issues", file=sys.stderr)
        return 1

    try:
        export = request(
            f"{API}/feedback-export",
            headers={"Authorization": f"Bearer {ADMIN}"},
        )
    except urllib.error.URLError as e:
        print(f"Could not reach the Worker: {e}", file=sys.stderr)
        return 1

    pending = export.get("feedback", [])
    if not pending:
        print("No pending feedback")
        return 0
    print(f"{len(pending)} pending feedback item(s)")

    gh_headers = {
        "Authorization": f"Bearer {GH_TOKEN}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "boondock-feedback-filer",
    }

    filed = []
    for item in pending:
        kind = item.get("kind", "other")
        title = f"[{KIND_TITLE.get(kind, 'Feedback')}] {first_line(item.get('message', ''))}"
        payload = {
            "title": title,
            "body": issue_body(item),
            "labels": KIND_LABELS.get(kind, ["from-app"]),
        }
        try:
            created = request(
                f"https://api.github.com/repos/{REPO}/issues",
                data=json.dumps(payload).encode(),
                headers=gh_headers,
                method="POST",
            )
        except urllib.error.HTTPError as e:
            # One bad item must not block the rest, and must not be acked —
            # leaving it pending means the next run retries it
            print(f"  {item['id']}: GitHub rejected the issue ({e.code}) {e.read()[:200]}", file=sys.stderr)
            continue
        except urllib.error.URLError as e:
            print(f"  {item['id']}: could not reach GitHub: {e}", file=sys.stderr)
            continue
        print(f"  {item['id']} → #{created['number']} {title}")
        filed.append({"id": item["id"], "issue": created["number"]})

    if not filed:
        print("Nothing filed", file=sys.stderr)
        return 1

    ack = request(
        f"{API}/feedback-filed",
        data=json.dumps({"filed": filed}).encode(),
        headers={"Authorization": f"Bearer {ADMIN}", "Content-Type": "application/json"},
        method="POST",
    )
    print(f"Acked {len(ack.get('updated', []))} of {len(filed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
