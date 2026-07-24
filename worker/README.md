# Community reports Worker

The one piece of Boondock Map that isn't a static file: a small Cloudflare
Worker that receives anonymous community reports ("there's a dump station
here"), check-ins ("still there" / "gone"), and abuse flags. Submissions land
in Workers KV behind profanity/spam filters and per-IP daily limits; the
nightly `community-merge` GitHub Action pulls `/export` and publishes the
approved set as `web/public/data/community.geojson`. The map itself never
talks to this Worker for reading data, so the app stays static and offline
usable, and this stays comfortably inside Cloudflare's free tier
(100,000 requests/day as of 2026 — check current limits).

## One-time deploy (Tim)

Needs a free Cloudflare account and Node. From `worker/`:

```bash
npx wrangler@4 login                          # opens a browser
npx wrangler@4 kv namespace create COMMUNITY_KV
```

That prints an `id = "…"` line. Paste it into `wrangler.toml` replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`. Then set the two secrets (generate each
with `openssl rand -hex 24`; keep the admin token somewhere safe — it is the
moderation password):

```bash
npx wrangler@4 secret put ADMIN_TOKEN
npx wrangler@4 secret put IP_SALT
npx wrangler@4 deploy
```

Deploy prints the public URL, like
`https://boondock-community.<your-subdomain>.workers.dev`. Wire it up in two
places:

1. `boondock/src/shared/community.js` — set `DEFAULT_COMMUNITY_API` to that
   URL (this enables the in-app Report/Check-in buttons; commit + deploy).
2. GitHub repo → Settings → Secrets and variables → Actions → add
   `COMMUNITY_API` (the URL) and `COMMUNITY_ADMIN_TOKEN` (the admin token).
   That arms `.github/workflows/community-merge.yml`, which publishes
   approved reports nightly. Until both secrets exist the workflow exits
   quietly without doing anything.

## Moderation (occasional, low-touch)

Clean submissions publish automatically as *unverified* — you don't approve
each one. The filter holds the sketchy ones (links, phone numbers, shouting,
near-duplicates) and outright rejects profanity. To review the held queue:

```bash
TOKEN=<admin token>
API=https://boondock-community.<subdomain>.workers.dev
curl -s -H "Authorization: Bearer $TOKEN" $API/queue | python3 -m json.tool
```

Approve, reject, or take down anything (rejecting an already-published spot
removes it on the next nightly merge):

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"c_ab12cd34ef","action":"approve"}' $API/moderate
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"id":"c_ab12cd34ef","action":"reject"}' $API/moderate
```

The merge script also prints any spot with 2+ user flag reports and excludes
it from publishing until you approve or reject it.

**Spam emergency dial:** set `REQUIRE_APPROVAL = "true"` in `wrangler.toml`
and `npx wrangler@4 deploy` — every new submission then waits for your
explicit approval.

## Local development

```bash
npx wrangler@4 dev   # local simulator on http://localhost:8787, KV in-memory
```

Point the app at it by starting vite with
`VITE_COMMUNITY_API=http://localhost:8787 npm run dev` in `web/`.

## Honest limits

- "Independent" check-in confirmation is approximated by salted IP hash —
  two confirmations from one person on VPN + home Wi-Fi would count twice.
  Good enough for camp data; not fraud-proof.
- The live near-duplicate check reads KV list metadata and stops past ~5,000
  stored spots; the merge script's dedupe still catches duplicates after
  that.
- KV is eventually consistent: a submission can take up to a minute to show
  in `/export` from another edge location. Irrelevant at nightly cadence.
