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

Needs a free Cloudflare account and Node.

**Every command below must run from `worker/`.** Wrangler reads `wrangler.toml`
from the current directory, and fails with a confusing "Required Worker name
missing" if you are anywhere else:

```bash
cd ~/git/cidrlab/boondock_map/worker
```

```bash
npx wrangler@4 login                          # opens a browser
npx wrangler@4 kv namespace create COMMUNITY_KV
```

That prints an `id = "…"` line. Paste it into `wrangler.toml` replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`. (The KV id is not a secret and is fine to
commit.)

Then the two secrets. They are handled differently on purpose.

**`ADMIN_TOKEN` — you keep this one.** It is the moderation password: without
it you cannot review held reports or take anything down. Generate it, save it
to your password manager, then paste it at the prompt. Don't paste it into a
chat, a screenshot, or a commit:

```bash
openssl rand -hex 24
```

```bash
npx wrangler@4 secret put ADMIN_TOKEN
```

**`IP_SALT` — you never need to see this one.** It only salts the IP hashes
server-side, so pipe it straight in and it never reaches your screen or
clipboard (if the pipe doesn't take, generate and paste as above):

```bash
openssl rand -hex 24 | npx wrangler@4 secret put IP_SALT
```

**Never rotate `IP_SALT` afterwards.** It is what makes "two independent
confirmations" mean anything — changing it resets every rate-limit counter and
makes old check-ins look like they came from different people.

```bash
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

## Feedback → GitHub issues (VISION row 66)

The same Worker takes in-app feedback (`POST /feedback`: bug / idea / data /
other, plus an optional contact). It only stores it. The nightly
`feedback-issues` GitHub Action pulls `/feedback-export`, opens one issue per
item with the workflow's **own `GITHUB_TOKEN`**, then calls `/feedback-filed`
so nothing is filed twice.

That split is deliberate: **no GitHub credential is ever stored in
Cloudflare.** A compromised Worker cannot touch the repo, and someone with no
GitHub account can still file an issue.

It arms itself from the same two repo secrets as the community merge, so
deploying the Worker once turns on community spots *and* feedback. Limits: 5
feedback items per day per salted IP hash, 2,000 characters, profanity
rejected, links/emails/phones/shouting held for review. Held feedback shows up
in `/queue` as `held_feedback` and is released with:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"feedback","id":"f_ab12cd34ef","action":"approve"}' $API/moderate
```

Verified locally 2026-07-25 against `wrangler dev`: valid submit, too-short
rejected, unknown kind rejected, profanity rejected, link held and withheld
from export, contact email does *not* trip the email filter, admin endpoints
401 without the token, IP hash stripped from every export, ack is idempotent,
malformed ids ignored, and the daily limit trips on the 6th submission.

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

## What the free tier actually buys

Verified against Cloudflare's docs 2026-07-25 (worth re-checking, these move):

| Free-plan limit | Value |
|---|---|
| Worker requests | 100,000 / day |
| KV keys read | 100,000 / day |
| **KV keys written** | **1,000 / day** |
| KV keys deleted | 1,000 / day |
| KV list requests | 1,000 / day |
| KV stored data | 1 GB |

No credit card is required for any of it.

**Writes are the binding limit, not requests.** Every public action costs *two*
writes, not one, because the rate-limit counter `rl:<ip>:<day>` is rewritten
alongside the record itself. So one report = 2 writes, one check-in = 2, one
flag = 2, which puts the real ceiling at roughly **500 community actions per
day across all users combined** — not per person. Past that, writes start
failing and submissions are rejected until 00:00 UTC.

That is a lot of headroom for this app, but it is a shared pool, so a spam
burst can spend the day's budget for everyone. `REQUIRE_APPROVAL` doesn't help
there (held submissions still write). If it ever becomes a real problem, the
fix is to stop writing a KV key per action for rate limiting — Durable Objects
or the Rate Limiting binding do that without touching the KV write budget.

The nightly merge is cheap by comparison: it *reads* every key (one list plus
one get each), which draws on the 100,000/day read budget, so the export
stays comfortable into the tens of thousands of spots.

## Honest limits

- "Independent" check-in confirmation is approximated by salted IP hash —
  two confirmations from one person on VPN + home Wi-Fi would count twice.
  Good enough for camp data; not fraud-proof.
- The live near-duplicate check reads KV list metadata and stops past ~5,000
  stored spots; the merge script's dedupe still catches duplicates after
  that.
- KV is eventually consistent: a submission can take up to a minute to show
  in `/export` from another edge location. Irrelevant at nightly cadence.
