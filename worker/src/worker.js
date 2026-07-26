/**
 * Boondock Map community reports — Cloudflare Worker.
 *
 * Anonymous, zero-account submissions ("there's a dump station here"),
 * check-ins ("still there" / "gone"), and abuse flags, stored in Workers KV.
 * A nightly GitHub Action pulls /export and publishes approved spots as
 * web/public/data/community.geojson — the Worker never serves map data
 * itself, so the app stays static and this stays free-tier sized.
 *
 * Moderation model (Tim's call, 2026-07-24): clean submissions publish
 * automatically as "unverified"; the filters below reject profanity outright
 * and hold soft signals (links, phone numbers, shouting, near-duplicates)
 * for occasional human review via /queue. REQUIRE_APPROVAL=true flips to
 * hold-everything if spam ever demands it.
 *
 * Privacy: no accounts, no raw IPs. Rate limiting and check-in independence
 * use a salted SHA-256 hash of the caller's IP, and published GeoJSON never
 * includes even that.
 *
 * KV layout (metadata mirrors the fields /submit's duplicate check needs,
 * so listing doesn't require a get per key):
 *   spot:<id>            {id, kind, name, desc, lng, lat, created, ip, st, flags}
 *                        st: auto | held | ok (approved) | no (rejected)
 *   ci:<spot>:<ip>:<day> {spot, date, ok, comment, ip, held}   one per person/day
 *   fl:<spot>:<ip>:<day> {spot, date, reason, ip}
 *   rl:<ip>:<day>        {spots, actions, feedback}            TTL 2 days
 *   fb:<id>              {id, kind, message, contact, created, ip, st, flags}
 *                        st: new | filed | no
 *
 * Feedback (VISION row 66) rides the same channel so anyone can report a bug
 * or ask for a feature without a GitHub account. The Worker only stores it;
 * a nightly GitHub Action opens the issues using the repo's own GITHUB_TOKEN,
 * so no GitHub credential is ever held here.
 */

import { BLOCKED_WORDS } from './wordlist.js'

const KINDS = new Set(['campsite', 'rv_park', 'dump', 'water', 'trailhead'])
const FEEDBACK_KINDS = new Set(['bug', 'idea', 'data', 'other'])
const MAX_FEEDBACK = 2000
const FEEDBACK_PER_DAY = 5
const MAX_NAME = 80
const MAX_TEXT = 280
const MAX_BODY_BYTES = 8192
const SPOTS_PER_DAY = 5
const ACTIONS_PER_DAY = 30
const DUP_METERS = 75
// Same US envelope the data pipeline uses (Aleutians west of the
// antimeridian excluded there too)
const BOUNDS = { latMin: 17, latMax: 72, lngMin: -180, lngMax: -64 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/+$/, '') || '/'
    try {
      if (path === '/health') return json({ ok: true })
      if (request.method === 'POST' && path === '/submit') return await handleSubmit(request, env)
      if (request.method === 'POST' && path === '/checkin') return await handleCheckin(request, env)
      if (request.method === 'POST' && path === '/flag') return await handleFlag(request, env)
      if (request.method === 'POST' && path === '/feedback') return await handleFeedback(request, env)
      if (path === '/feedback-export') return await requireAdmin(request, env, handleFeedbackExport)
      if (request.method === 'POST' && path === '/feedback-filed') return await requireAdmin(request, env, handleFeedbackFiled)
      if (path === '/export') return await requireAdmin(request, env, handleExport)
      if (path === '/queue') return await requireAdmin(request, env, handleQueue)
      if (request.method === 'POST' && path === '/moderate') return await requireAdmin(request, env, handleModerate)
      return json({ ok: false, error: 'Not found' }, 404)
    } catch (e) {
      if (e instanceof ApiError) return json({ ok: false, error: e.message }, e.status)
      return json({ ok: false, error: 'Server error' }, 500)
    }
  },
}

class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// ── Text filtering ──────────────────────────────────────────────────────────

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' }

// Two views of the text: words (separators → spaces, boundaries kept) for
// exact-word matches, and squeezed (all separators dropped) so "f u c k"
// and "f.u.c.k" still match longer entries without Scunthorpe false hits
function normalize(s) {
  const mapped = String(s).toLowerCase().replace(/[0134578@$!]/g, (c) => LEET[c])
  const words = ' ' + mapped.replace(/[^a-z]+/g, ' ').trim() + ' '
  const squeezed = mapped.replace(/[^a-z]+/g, '')
  return { words, squeezed }
}

function hasBlockedWord(s) {
  const { words, squeezed } = normalize(s)
  return BLOCKED_WORDS.some((w) =>
    words.includes(` ${w} `) || (w.length >= 5 && squeezed.includes(w))
  )
}

const LINK_RE = /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|biz|info|xyz|shop)\b/i
const EMAIL_RE = /\S@\S+\.\S/
const PHONE_RE = /(?:\d[\s\-.()]*){7,}/

// null = clean, {reject} = drop with a generic error, {hold: reason} = store
// but wait for human review
function inspectText(s) {
  if (!s) return null
  if (hasBlockedWord(s)) return { reject: true }
  if (LINK_RE.test(s)) return { hold: 'link' }
  if (EMAIL_RE.test(s)) return { hold: 'email' }
  if (PHONE_RE.test(s)) return { hold: 'phone' }
  const letters = s.replace(/[^a-zA-Z]/g, '')
  if (letters.length >= 20 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) {
    return { hold: 'shouting' }
  }
  return null
}

function cleanText(s, max) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

// ── Request helpers ─────────────────────────────────────────────────────────

async function readBody(request) {
  const len = Number(request.headers.get('Content-Length') || 0)
  if (len > MAX_BODY_BYTES) throw new ApiError(413, 'Body too large')
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) throw new ApiError(413, 'Body too large')
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(400, 'Invalid JSON')
  }
}

async function ipHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0'
  const salt = env.IP_SALT || 'dev-salt'
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + salt))
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

async function bumpRateLimit(env, ip, field, limit) {
  const key = `rl:${ip}:${today()}`
  const cur = (await env.COMMUNITY_KV.get(key, 'json')) || {}
  // Read the counter defensively: a field absent from an older record (or a
  // newly added one like `feedback`) must start at 0. `cur[field]++` on
  // undefined yields NaN, and NaN >= limit is always false, which silently
  // disables the limit for that field.
  const used = Number(cur[field]) || 0
  if (used >= limit) throw new ApiError(429, 'Daily limit reached — try again tomorrow')
  cur[field] = used + 1
  await env.COMMUNITY_KV.put(key, JSON.stringify(cur), { expirationTtl: 172800 })
}

function haversineMeters(lng1, lat1, lng2, lat2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function listAll(env, prefix) {
  const out = []
  let cursor
  do {
    const page = await env.COMMUNITY_KV.list({ prefix, cursor, limit: 1000 })
    out.push(...page.keys)
    cursor = page.list_complete ? null : page.cursor
  } while (cursor)
  return out
}

// ── Public endpoints ────────────────────────────────────────────────────────

async function handleSubmit(request, env) {
  const body = await readBody(request)
  const kind = String(body.kind || '')
  if (!KINDS.has(kind)) throw new ApiError(400, 'Unknown kind')
  const name = cleanText(body.name, MAX_NAME)
  const desc = cleanText(body.desc, MAX_TEXT)
  if (name.length < 3) throw new ApiError(400, 'Name too short')
  const lng = Number(body.lng)
  const lat = Number(body.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new ApiError(400, 'Bad coordinates')
  if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) {
    throw new ApiError(400, 'Location outside the US coverage area')
  }

  for (const t of [name, desc]) {
    const v = inspectText(t)
    if (v?.reject) throw new ApiError(422, 'Submission rejected')
  }
  const holds = [name, desc].map((t) => inspectText(t)?.hold).filter(Boolean)

  const ip = await ipHash(request, env)
  await bumpRateLimit(env, ip, 'spots', SPOTS_PER_DAY)

  // Near-duplicate of a live spot → hold for review rather than double-list.
  // Listing metadata only (no gets); past ~5k spots this check degrades to
  // the merge script's dedupe, which always runs.
  const existing = await listAll(env, 'spot:')
  if (existing.length <= 5000) {
    for (const k of existing) {
      const m = k.metadata
      if (!m || m.st === 'no' || m.k !== kind) continue
      if (haversineMeters(lng, lat, m.g[0], m.g[1]) < DUP_METERS) {
        holds.push('duplicate')
        break
      }
    }
  }

  const requireApproval = String(env.REQUIRE_APPROVAL) === 'true'
  const st = holds.length || requireApproval ? 'held' : 'auto'
  const id = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  const spot = { id, kind, name, desc, lng, lat, created: new Date().toISOString(), ip, st, flags: holds }
  await env.COMMUNITY_KV.put(`spot:${id}`, JSON.stringify(spot), {
    metadata: { k: kind, g: [lng, lat], st },
  })
  return json({ ok: true, id, held: st === 'held' }, 201)
}

async function handleCheckin(request, env) {
  const body = await readBody(request)
  const spotId = String(body.spot || '')
  if (!/^c_[0-9a-f]{10}$/.test(spotId)) throw new ApiError(400, 'Bad spot id')
  const spotRaw = await env.COMMUNITY_KV.get(`spot:${spotId}`, 'json')
  if (!spotRaw || spotRaw.st === 'no') throw new ApiError(404, 'Spot not found')

  const ok = Boolean(body.ok)
  const comment = cleanText(body.comment, MAX_TEXT)
  const v = inspectText(comment)
  if (v?.reject) throw new ApiError(422, 'Submission rejected')

  const ip = await ipHash(request, env)
  await bumpRateLimit(env, ip, 'actions', ACTIONS_PER_DAY)

  const record = {
    spot: spotId,
    date: today(),
    ok,
    comment,
    ip,
    ...(v?.hold && { held: v.hold }),
  }
  // Keyed per person per day — a repeat same-day check-in overwrites itself
  await env.COMMUNITY_KV.put(`ci:${spotId}:${ip}:${today()}`, JSON.stringify(record))
  return json({ ok: true, held: Boolean(v?.hold) }, 201)
}

async function handleFlag(request, env) {
  const body = await readBody(request)
  const spotId = String(body.spot || '')
  if (!/^c_[0-9a-f]{10}$/.test(spotId)) throw new ApiError(400, 'Bad spot id')
  const ip = await ipHash(request, env)
  await bumpRateLimit(env, ip, 'actions', ACTIONS_PER_DAY)
  const reason = cleanText(body.reason, 140)
  await env.COMMUNITY_KV.put(
    `fl:${spotId}:${ip}:${today()}`,
    JSON.stringify({ spot: spotId, date: today(), reason, ip })
  )
  return json({ ok: true }, 201)
}

// ── Feedback ────────────────────────────────────────────────────────────────
//
// Deliberately not a spot: free text, no coordinates, and it becomes a GitHub
// issue rather than map data. Contact is optional — the whole point is that
// someone with no account can still be heard — and it is the one field that
// can carry an email, so the link/email filters must not reject on it.

async function handleFeedback(request, env) {
  const body = await readBody(request)
  const kind = String(body.kind || '')
  if (!FEEDBACK_KINDS.has(kind)) throw new ApiError(400, 'Unknown feedback kind')
  const message = cleanText(body.message, MAX_FEEDBACK)
  if (message.length < 10) throw new ApiError(400, 'Please add a little more detail')
  const contact = cleanText(body.contact, 120)

  // Profanity still rejects; the softer signals only hold for review, and are
  // checked on the message alone so a contact address can't trip them
  if (hasBlockedWord(message)) throw new ApiError(422, 'Submission rejected')
  const holds = []
  const v = inspectText(message)
  if (v?.hold) holds.push(v.hold)
  if (contact && hasBlockedWord(contact)) throw new ApiError(422, 'Submission rejected')

  const ip = await ipHash(request, env)
  await bumpRateLimit(env, ip, 'feedback', FEEDBACK_PER_DAY)

  const requireApproval = String(env.REQUIRE_APPROVAL) === 'true'
  const st = holds.length || requireApproval ? 'held' : 'new'
  const id = 'f_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  const record = { id, kind, message, contact, created: new Date().toISOString(), ip, st, flags: holds }
  await env.COMMUNITY_KV.put(`fb:${id}`, JSON.stringify(record), { metadata: { st } })
  return json({ ok: true, id, held: st === 'held' }, 201)
}

// Only what the issue-filing Action should act on; held items wait for /queue
async function handleFeedbackExport(request, env) {
  const all = await getAllValues(env, 'fb:')
  const pending = all.filter((f) => f.st === 'new')
  // The IP hash is for rate limiting only and must never leave the Worker
  const safe = pending.map(({ ip, ...rest }) => rest)
  return json({ ok: true, exported: new Date().toISOString(), feedback: safe })
}

// Called back by the Action once an issue exists, so nothing is filed twice
async function handleFeedbackFiled(request, env) {
  const body = await readBody(request)
  const filed = Array.isArray(body.filed) ? body.filed : []
  const updated = []
  for (const entry of filed.slice(0, 200)) {
    const id = String(entry.id || '')
    if (!/^f_[0-9a-f]{10}$/.test(id)) continue
    const key = `fb:${id}`
    const rec = await env.COMMUNITY_KV.get(key, 'json')
    if (!rec || rec.st !== 'new') continue
    rec.st = 'filed'
    rec.issue = Number(entry.issue) || null
    await env.COMMUNITY_KV.put(key, JSON.stringify(rec), { metadata: { st: 'filed' } })
    updated.push(id)
  }
  return json({ ok: true, updated })
}

// ── Admin endpoints ─────────────────────────────────────────────────────────

async function requireAdmin(request, env, handler) {
  const header = request.headers.get('Authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '')
  const expected = env.ADMIN_TOKEN || ''
  if (!expected || !timingSafeEqual(token, expected)) {
    throw new ApiError(401, 'Unauthorized')
  }
  return handler(request, env)
}

function timingSafeEqual(a, b) {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

async function getAllValues(env, prefix) {
  const keys = await listAll(env, prefix)
  const values = []
  for (const k of keys) {
    const v = await env.COMMUNITY_KV.get(k.name, 'json')
    if (v) values.push({ key: k.name, ...v })
  }
  return values
}

async function handleExport(request, env) {
  const [spots, checkins, flags] = await Promise.all([
    getAllValues(env, 'spot:'),
    getAllValues(env, 'ci:'),
    getAllValues(env, 'fl:'),
  ])
  return json({ ok: true, exported: new Date().toISOString(), spots, checkins, flags })
}

async function handleQueue(request, env) {
  const [spots, checkins, flags] = await Promise.all([
    getAllValues(env, 'spot:'),
    getAllValues(env, 'ci:'),
    getAllValues(env, 'fl:'),
  ])
  const flagCounts = {}
  for (const f of flags) flagCounts[f.spot] = (flagCounts[f.spot] || 0) + 1
  const feedback = await getAllValues(env, 'fb:')
  return json({
    ok: true,
    held_feedback: feedback.filter((f) => f.st === 'held'),
    held_spots: spots.filter((s) => s.st === 'held'),
    flagged_spots: spots.filter((s) => s.st !== 'no' && flagCounts[s.id]),
    held_checkins: checkins.filter((c) => c.held),
    flag_reports: flags,
  })
}

async function handleModerate(request, env) {
  const body = await readBody(request)
  const action = String(body.action || '')
  if (body.type === 'checkin') {
    if (action !== 'reject') throw new ApiError(400, 'Unknown action')
    if (!String(body.key || '').startsWith('ci:')) throw new ApiError(400, 'Bad key')
    await env.COMMUNITY_KV.delete(body.key)
    return json({ ok: true })
  }
  if (body.type === 'feedback') {
    const fid = String(body.id || '')
    if (!/^f_[0-9a-f]{10}$/.test(fid)) throw new ApiError(400, 'Bad feedback id')
    const rec = await env.COMMUNITY_KV.get(`fb:${fid}`, 'json')
    if (!rec) throw new ApiError(404, 'Feedback not found')
    // approve releases it to the next issue-filing run; reject drops it
    const fst = { approve: 'new', reject: 'no', delete: 'no' }[action]
    if (!fst) throw new ApiError(400, 'Unknown action')
    rec.st = fst
    await env.COMMUNITY_KV.put(`fb:${fid}`, JSON.stringify(rec), { metadata: { st: fst } })
    return json({ ok: true, id: fid, st: fst })
  }
  const id = String(body.id || '')
  const key = `spot:${id}`
  const spot = await env.COMMUNITY_KV.get(key, 'json')
  if (!spot) throw new ApiError(404, 'Spot not found')
  const st = { approve: 'ok', reject: 'no', delete: 'no' }[action]
  if (!st) throw new ApiError(400, 'Unknown action')
  spot.st = st
  await env.COMMUNITY_KV.put(key, JSON.stringify(spot), {
    metadata: { k: spot.kind, g: [spot.lng, spot.lat], st },
  })
  return json({ ok: true, id, st })
}
