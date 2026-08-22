/**
 * Off-pavement routing over the self-hosted USFS network (VISION rows 91/133).
 *
 * Google and Apple route you on pavement and stop at the forest boundary. This
 * routes the other half: the legal motorized network from the MVUM data we
 * already host (row 83), entirely on the device, so asking "how do I drive to
 * that spot" sends nothing to anybody.
 *
 * The graph is built offline by data-pipeline/build_route_graph.py, which nodes
 * the MVUM linework at shared endpoints. This module is the part that runs in
 * the app: snap the endpoints, A* over the graph, and turn the resulting node
 * chain into something a driver can follow.
 *
 * What this deliberately is NOT: a highway router. It knows only forest roads,
 * so it answers "get me from this forest road to that campsite", not "get me
 * from home". Callers must say so — see `route()`'s `reachable` result.
 */

// ── Vehicle classes ────────────────────────────────────────────────────────
// Bit order mirrors the `veh` bitmask built in build_road_pmtiles.py's SQL and
// shared/usfsCodes.js. If one moves, all three move.
export const VEH_BITS = {
  passenger: 1,
  highClearance: 2,
  truck: 4,
  bus: 8,
  motorhome: 16,
  fourwdGt50: 32,
  twowdGt50: 64,
  atv: 128,
  motorcycle: 256,
}

export const VEHICLE_PROFILES = [
  { id: 'passenger', label: 'Passenger car', bit: VEH_BITS.passenger },
  { id: 'highClearance', label: 'High clearance', bit: VEH_BITS.highClearance },
  { id: 'motorhome', label: 'Motorhome / RV', bit: VEH_BITS.motorhome },
  { id: 'truck', label: 'Truck with trailer', bit: VEH_BITS.truck },
  { id: 'atv', label: 'ATV', bit: VEH_BITS.atv },
  { id: 'motorcycle', label: 'Motorcycle', bit: VEH_BITS.motorcycle },
  { id: 'any', label: 'Any vehicle', bit: 0 },   // 0 = don't filter
]

// Rough travel speeds in mph by surface, used only to order alternatives and
// give an honest time estimate. These are forest roads: the number is a
// planning aid, not a promise, and the UI says so.
const SPEED_BY_SURFACE = {
  'PAVED': 35,
  'ASPHALT': 35,
  'CONCRETE': 35,
  'IMPROVED': 25,
  'AGGREGATE': 22,
  'GRAVEL': 22,
  'CRUSHED': 22,
  'DIRT': 14,
  'NATIVE': 12,
  'NATIVE MATERIAL': 12,
}
const DEFAULT_SPEED = 15

// Maintenance level 1 is "basic custodial care (CLOSED)"; 2 is high-clearance.
// Slower than the surface alone suggests.
const OML_PENALTY = { 1: 0.35, 2: 0.75, 3: 1, 4: 1.1, 5: 1.2 }

// Closer than this to a junction and we use the junction itself rather than
// cutting a new node beside it (~50 ft)
const JUNCTION_SNAP_MI = 0.01

const R_EARTH_MI = 3958.8
const rad = (d) => (d * Math.PI) / 180

export function haversineMi(a, b) {
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH_MI * Math.asin(Math.min(1, Math.sqrt(s)))
}

function edgeSpeed(edge) {
  const surf = String(edge.surf || '').toUpperCase()
  const base = SPEED_BY_SURFACE[surf] ?? DEFAULT_SPEED
  const factor = OML_PENALTY[edge.oml] ?? 1
  return Math.max(4, base * factor)
}

/** Minutes to drive an edge. Cost function for the search. */
export function edgeMinutes(edge) {
  const miles = edge.m ?? 0
  return (miles / edgeSpeed(edge)) * 60
}

/**
 * Adjacency built once per graph, then reused across searches. Kept separate
 * from the graph payload so the graph stays a plain, cacheable document.
 */
export function buildIndex(graph) {
  const adj = new Map()
  graph.edges.forEach((edge, i) => {
    if (!adj.has(edge.a)) adj.set(edge.a, [])
    if (!adj.has(edge.b)) adj.set(edge.b, [])
    // Undirected: MVUM carries no one-way information, so both directions are
    // legal unless a future data source says otherwise
    adj.get(edge.a).push({ edge: i, to: edge.b, forward: true })
    adj.get(edge.b).push({ edge: i, to: edge.a, forward: false })
  })
  return { graph, adj }
}

/** Nearest graph node to a point, with its distance in miles. */
export function nearestNode(index, point, maxMi = Infinity) {
  const { graph } = index
  let best = -1
  let bestMi = Infinity
  for (let i = 0; i < graph.nodes.length; i++) {
    const d = haversineMi(point, graph.nodes[i])
    if (d < bestMi) {
      bestMi = d
      best = i
    }
  }
  return bestMi <= maxMi ? { node: best, mi: bestMi } : null
}

/**
 * Nearest point on the network itself, which is not the same question as the
 * nearest junction — and it's the one that matters. You are almost never
 * parked at a junction; you are somewhere along a road whose junctions may be
 * miles apart. Snapping to the nearest *node* can start the route facing the
 * wrong way down that road, or pick a different road entirely.
 */
export function nearestOnEdge(index, point, maxMi = Infinity) {
  const { graph } = index
  let best = null
  for (let i = 0; i < graph.edges.length; i++) {
    const g = graph.edges[i].g
    for (let s = 1; s < g.length; s++) {
      const hit = projectOnSegment(point, g[s - 1], g[s])
      if (!best || hit.mi < best.mi) best = { edge: i, seg: s - 1, t: hit.t, coord: hit.coord, mi: hit.mi }
    }
  }
  return best && best.mi <= maxMi ? best : null
}

function projectOnSegment(p, a, b) {
  const latScale = Math.cos(rad(p[1]))
  const ax = a[0] * latScale, ay = a[1]
  const bx = b[0] * latScale, by = b[1]
  const px = p[0] * latScale, py = p[1]
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const coord = [(ax + t * dx) / latScale, ay + t * dy]
  return { t, coord, mi: haversineMi(p, coord) }
}

function lineMiles(coords) {
  let sum = 0
  for (let i = 1; i < coords.length; i++) sum += haversineMi(coords[i - 1], coords[i])
  return sum
}

/** Cut an edge's geometry at a projected point, returning both halves. */
function splitGeometry(g, seg, t) {
  const cut = projectOnSegment(g[seg], g[seg], g[seg + 1]).coord && (() => {
    const a = g[seg], b = g[seg + 1]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  })()
  const head = [...g.slice(0, seg + 1), cut]
  const tail = [cut, ...g.slice(seg + 1)]
  return { cut, head, tail }
}

/**
 * Splice temporary endpoints into the graph for one search.
 *
 * Each end snaps onto an edge; where that lands mid-edge we add a temporary
 * node and the two half-edges around it, and block the original so the search
 * can't both use the whole edge and its halves. Both ends landing on the same
 * edge is the interesting case — it becomes three pieces, and a short trip
 * along one road stays a short trip along one road.
 */
function spliceEndpoints(index, snaps) {
  const { graph } = index
  const N = graph.nodes.length
  const overlay = { nodes: [], edges: [], adj: new Map(), blocked: new Set() }
  const addAdj = (from, to, edgeId, forward) => {
    if (!overlay.adj.has(from)) overlay.adj.set(from, [])
    overlay.adj.get(from).push({ edge: edgeId, to, forward })
  }
  const addEdge = (a, b, geom, base) => {
    const id = -(overlay.edges.length + 1)          // negative ids = temporary
    overlay.edges.push({ ...base, a, b, g: geom, m: lineMiles(geom) })
    addAdj(a, b, id, true)
    addAdj(b, a, id, false)
    return id
  }

  const nodeFor = new Array(snaps.length)
  const pending = []

  // Land on a junction and *use* the junction. Cutting a new node a metre away
  // from one instead leaves it joined only to the road we happened to snap to,
  // stranded from every other road meeting there — which reads as "no route"
  // on a graph that plainly has one.
  snaps.forEach((snap, which) => {
    const edge = graph.edges[snap.edge]
    const toA = haversineMi(snap.coord, graph.nodes[edge.a])
    const toB = haversineMi(snap.coord, graph.nodes[edge.b])
    if (Math.min(toA, toB) <= JUNCTION_SNAP_MI) {
      const node = toA <= toB ? edge.a : edge.b
      nodeFor[which] = { node, coord: graph.nodes[node], mi: snap.mi }
    } else {
      pending.push({ ...snap, which })
    }
  })

  // Group the rest by edge, so two snaps onto one road are cut together and in
  // order — a short hop along a single road stays a short hop along it
  const byEdge = new Map()
  for (const hit of pending) {
    if (!byEdge.has(hit.edge)) byEdge.set(hit.edge, [])
    byEdge.get(hit.edge).push(hit)
  }

  for (const [edgeIdx, hits] of byEdge) {
    const edge = graph.edges[edgeIdx]
    hits.sort((p, q) => (p.seg - q.seg) || (p.t - q.t))
    overlay.blocked.add(edgeIdx)
    let geom = edge.g
    let prevNode = edge.a
    let consumed = 0        // vertices of the original already emitted
    for (const hit of hits) {
      const { cut, head, tail } = splitGeometry(geom, hit.seg - consumed, hit.t)
      const tempNode = N + overlay.nodes.length
      overlay.nodes.push(cut)
      nodeFor[hit.which] = { node: tempNode, coord: cut, mi: hit.mi }
      addEdge(prevNode, tempNode, head, edge)
      prevNode = tempNode
      geom = tail
      consumed = hit.seg
    }
    addEdge(prevNode, edge.b, geom, edge)
  }
  return { overlay, nodeFor }
}

const coordOf = (index, overlay, n) =>
  n < index.graph.nodes.length ? index.graph.nodes[n] : overlay.nodes[n - index.graph.nodes.length]

const edgeOf = (index, overlay, id) =>
  id < 0 ? overlay.edges[-id - 1] : index.graph.edges[id]

function neighborsOf(index, overlay, n) {
  const base = (index.adj.get(n) || []).filter(l => !overlay.blocked.has(l.edge))
  const extra = overlay.adj.get(n) || []
  return extra.length ? base.concat(extra) : base
}

// Binary heap keyed on f-score. A sorted-array frontier is fine for a few
// hundred nodes and quietly quadratic for a state-sized graph.
class Heap {
  constructor() { this.a = [] }
  get size() { return this.a.length }
  push(item) {
    const a = this.a
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].f <= a[i].f) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }
  pop() {
    const a = this.a
    const top = a[0]
    const last = a.pop()
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && a[l].f < a[m].f) m = l
        if (r < a.length && a[r].f < a[m].f) m = r
        if (m === i) break
        ;[a[m], a[i]] = [a[i], a[m]]
        i = m
      }
    }
    return top
  }
}

/**
 * A* from one graph node to another, in minutes.
 *
 * The heuristic is straight-line distance at the fastest speed any edge could
 * have, which never overestimates — so the first path found is the cheapest.
 */
function search(index, overlay, startNode, goalNode, { vehicleBit = 0, maxExpansions = 400000 } = {}) {
  const goalPt = coordOf(index, overlay, goalNode)
  const bestSpeed = Math.max(...Object.values(SPEED_BY_SURFACE), DEFAULT_SPEED)
  const h = (n) => (haversineMi(coordOf(index, overlay, n), goalPt) / bestSpeed) * 60

  const gScore = new Map([[startNode, 0]])
  const cameFrom = new Map()
  const open = new Heap()
  const closed = new Set()
  open.push({ node: startNode, f: h(startNode) })

  let expansions = 0
  while (open.size) {
    const { node } = open.pop()
    if (closed.has(node)) continue
    if (node === goalNode) return { gScore, cameFrom, reached: true }
    closed.add(node)
    if (++expansions > maxExpansions) break

    for (const link of neighborsOf(index, overlay, node)) {
      const edge = edgeOf(index, overlay, link.edge)
      // Legality: an edge closed to this vehicle is not a route, at any cost
      if (vehicleBit && !(edge.veh & vehicleBit)) continue
      if (closed.has(link.to)) continue
      const tentative = gScore.get(node) + edgeMinutes(edge)
      if (tentative < (gScore.get(link.to) ?? Infinity)) {
        gScore.set(link.to, tentative)
        cameFrom.set(link.to, { from: node, edge: link.edge, forward: link.forward })
        open.push({ node: link.to, f: tentative + h(link.to) })
      }
    }
  }
  return { gScore, cameFrom, reached: false }
}

/** Walk cameFrom back to the start, producing edges in travel order. */
function reconstruct(cameFrom, goalNode) {
  const legs = []
  let cur = goalNode
  while (cameFrom.has(cur)) {
    const step = cameFrom.get(cur)
    legs.push(step)
    cur = step.from
  }
  return legs.reverse()
}

function bearing(a, b) {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]))
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]))
  return (Math.atan2(y, x) * 180) / Math.PI
}

/** "bear left", "turn right", … from the angle between two legs. */
export function turnWord(deltaDeg) {
  const d = ((deltaDeg + 540) % 360) - 180
  const a = Math.abs(d)
  if (a < 20) return 'continue'
  if (a < 55) return d < 0 ? 'bear left' : 'bear right'
  if (a < 140) return d < 0 ? 'turn left' : 'turn right'
  if (a < 170) return d < 0 ? 'sharp left' : 'sharp right'
  return 'make a U-turn'
}

/**
 * Consecutive edges on the same named road are one instruction. Nobody wants
 * "continue on FR 22" eleven times because the source data split the road at
 * every county line.
 */
function toSteps(index, overlay, legs) {
  const steps = []
  for (const leg of legs) {
    const edge = edgeOf(index, overlay, leg.edge)
    const geom = leg.forward ? edge.g : [...edge.g].reverse()
    const label = edge.name || edge.rte || 'unnamed road'
    const prev = steps[steps.length - 1]
    if (prev && prev.label === label) {
      prev.miles += edge.m ?? 0
      prev.minutes += edgeMinutes(edge)
      prev.coordinates.push(...geom.slice(1))
      continue
    }
    steps.push({
      label,
      surf: edge.surf || null,
      miles: edge.m ?? 0,
      minutes: edgeMinutes(edge),
      coordinates: prev ? geom : [...geom],
    })
  }
  // Turn words come from the angle between the end of one step and the start
  // of the next, which is why they're assigned after the merge above
  for (let i = 0; i < steps.length; i++) {
    const c = steps[i].coordinates
    if (i === 0) {
      steps[i].turn = 'start'
      continue
    }
    const prevC = steps[i - 1].coordinates
    const inB = bearing(prevC[prevC.length - 2] || prevC[0], prevC[prevC.length - 1])
    const outB = bearing(c[0], c[1] || c[0])
    steps[i].turn = turnWord(outB - inB)
  }
  return steps
}

/**
 * Route between two points.
 *
 * Returns `{ ok: false, reason }` rather than throwing, because every failure
 * here is a thing the user needs told plainly: too far from any known road, no
 * legal route for this vehicle, or the two ends aren't connected on the forest
 * network at all (which usually means the trip needs pavement we don't have).
 */
export function route(index, from, to, opts = {}) {
  const { vehicleBit = 0, snapMi = 2 } = opts
  const { graph } = index
  if (!graph?.nodes?.length) return { ok: false, reason: 'no-graph' }

  // Snap to the network, not to its junctions — see nearestOnEdge
  const startSnap = nearestOnEdge(index, from, snapMi)
  if (!startSnap) return { ok: false, reason: 'start-too-far', snapMi }
  const goalSnap = nearestOnEdge(index, to, snapMi)
  if (!goalSnap) return { ok: false, reason: 'end-too-far', snapMi }

  const { overlay, nodeFor } = spliceEndpoints(index, [startSnap, goalSnap])
  const startNode = nodeFor[0].node
  const goalNode = nodeFor[1].node
  if (startNode === goalNode) return { ok: false, reason: 'same-place' }

  const { cameFrom, gScore, reached } = search(index, overlay, startNode, goalNode, { vehicleBit })
  if (!reached) return { ok: false, reason: vehicleBit ? 'no-legal-route' : 'not-connected' }

  const legs = reconstruct(cameFrom, goalNode)
  const steps = toSteps(index, overlay, legs)
  const coordinates = steps.flatMap((s, i) => (i ? s.coordinates.slice(1) : s.coordinates))

  return {
    ok: true,
    minutes: gScore.get(goalNode),
    miles: steps.reduce((sum, s) => sum + s.miles, 0),
    coordinates,
    steps,
    // Where the road actually starts and ends relative to the points asked
    // for, and how far that leaves you to travel off-network at each end
    startOnRoad: startSnap.coord,
    endOnRoad: goalSnap.coord,
    startOffRoadMi: startSnap.mi,
    endOffRoadMi: goalSnap.mi,
  }
}

/**
 * Distance in miles from a point to the route line, for off-route detection.
 * Straight segment-distance, which is accurate enough at the scale a driver
 * cares about (tens of metres) and cheap enough to run on every GPS fix.
 */
export function distanceToRouteMi(coordinates, point) {
  let best = Infinity
  for (let i = 1; i < coordinates.length; i++) {
    const d = pointToSegmentMi(point, coordinates[i - 1], coordinates[i])
    if (d < best) best = d
  }
  return best
}

function pointToSegmentMi(p, a, b) {
  // Local flat approximation: at these distances the error is far below GPS noise
  const latScale = Math.cos(rad(p[1]))
  const ax = a[0] * latScale, ay = a[1]
  const bx = b[0] * latScale, by = b[1]
  const px = p[0] * latScale, py = p[1]
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx, cy = ay + t * dy
  return haversineMi([p[0], p[1]], [cx / latScale, cy])
}
