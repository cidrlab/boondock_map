/**
 * Loading the routing graphs (VISION rows 91/133).
 *
 * Same shape as the per-state sites data: nothing is fetched until the map
 * needs it, and what's fetched is cached for the session. The difference is
 * that routing graphs are built one region at a time, so most of the country
 * has none yet — and a button that can only fail is worse than no button.
 * `routingAvailableAt()` is what the UI asks before offering to route.
 *
 * `data/routegraphs.json` is the index of what exists, written by
 * data-pipeline/build_route_graph.py. It's small, fetched once, and its
 * absence simply means routing is off — not an error worth showing anyone.
 */

import { buildIndex } from './router.js'

const base = (path) => new URL(import.meta.env.BASE_URL + path, location.href).href

let manifestPromise = null
let manifestSnapshot = null       // resolved copy, for the synchronous check below
const graphCache = new Map()      // key → { graph, index } once loaded
const inflight = new Map()

/** The index of built graphs. Resolves to [] when there are none. */
export function loadManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch(base('data/routegraphs.json'))
      .then(r => (r.ok ? r.json() : { graphs: [] }))
      .then(d => (Array.isArray(d?.graphs) ? d.graphs : []))
      .catch(() => [])            // offline, or none built: routing is just off
      .then(graphs => {
        manifestSnapshot = graphs
        return graphs
      })
  }
  return manifestPromise
}

const inBbox = ([w, s, e, n], [lng, lat]) => lng >= w && lng <= e && lat >= s && lat <= n

/** Which built graph covers this point, if any. */
export async function graphKeyAt(point) {
  const graphs = await loadManifest()
  return graphs.find(g => inBbox(g.bbox, point))?.key ?? null
}

/**
 * Can we route between these two points? Both ends have to sit inside the same
 * graph: a route that leaves the region would stop at its edge, and silently
 * returning half a route is worse than saying no.
 */
export async function routingAvailableAt(from, to) {
  const graphs = await loadManifest()
  const g = graphs.find(x => inBbox(x.bbox, from) && inBbox(x.bbox, to))
  return g ? { key: g.key, miles: g.miles, bytes: g.bytes } : null
}

/**
 * Does any built graph cover this point? Deliberately asks only about the
 * destination: whether to *offer* a route is a question about the map data,
 * not about whether GPS has answered yet. Tying the offer to a fix meant the
 * button could never appear, since the fix only starts flowing once you are
 * already navigating.
 */
export function coversPointSync(point) {
  if (!manifestSnapshot || !point) return null
  return manifestSnapshot.find(x => inBbox(x.bbox, point)) ?? null
}

/**
 * The same question, answerable without awaiting — popups are built as HTML in
 * one pass, and a button cannot appear later. Returns null until the manifest
 * has landed, which means the offer is simply absent for the first moment
 * after launch rather than appearing and then retracting.
 */
export function routingAvailableSync(from, to) {
  if (!manifestSnapshot || !from || !to) return null
  const g = manifestSnapshot.find(x => inBbox(x.bbox, from) && inBbox(x.bbox, to))
  return g ? { key: g.key, miles: g.miles, bytes: g.bytes } : null
}

/** Load (and index) one graph, at most once. */
export function loadGraph(key) {
  if (graphCache.has(key)) return Promise.resolve(graphCache.get(key))
  if (inflight.has(key)) return inflight.get(key)
  const p = fetch(base(`data/routegraph-${key}.json`))
    .then(r => {
      if (!r.ok) throw new Error(`routegraph-${key}: HTTP ${r.status}`)
      return r.json()
    })
    .then(graph => {
      const entry = { graph, index: buildIndex(graph) }
      graphCache.set(key, entry)
      inflight.delete(key)
      return entry
    })
    .catch(err => {
      inflight.delete(key)
      throw err
    })
  inflight.set(key, p)
  return p
}

/** For tests and for the offline-pack accounting to see what's resident. */
export function loadedGraphKeys() {
  return [...graphCache.keys()]
}
