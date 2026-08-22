/**
 * Tests for the off-pavement router (VISION rows 91/133).
 *
 *     node boondock/src/shared/router.test.mjs
 *     node boondock/src/shared/router.test.mjs path/to/routegraph-or.json
 *
 * No framework and no fixtures on disk: the graph below is built inline so the
 * suite runs anywhere, and a real graph can be passed as an argument once one
 * has been built (data-pipeline/build_route_graph.py).
 *
 * The load-bearing test is `A* matches Dijkstra`. A router that returns a
 * plausible-looking path that isn't the cheapest one is the failure mode you
 * never notice in a screenshot, so every search is checked against a plain
 * Dijkstra with no heuristic and no heap.
 */

import fs from 'node:fs'
import {
  buildIndex, route, haversineMi, distanceToRouteMi, turnWord, edgeMinutes, VEH_BITS,
} from './router.js'

let pass = 0, fail = 0
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? '  ' + detail : ''}`) }
  else { fail++; console.log(`  ✗ ${name}  ${detail}`) }
}

// A deliberate little network, laid out along 45°N:
//   Spine Rd  west→east through two junctions
//   North Rd  meets the spine at −121.4 and runs north
//   South Rd  meets it at −121.3, high-clearance only
//   Parallel  ~110 m off the spine and touching nothing — must stay separate
const G = (() => {
  const n = [
    [-121.5, 45.0],    // 0 spine west end
    [-121.4, 45.0],    // 1 junction with North Rd
    [-121.3, 45.0],    // 2 junction with South Rd
    [-121.2, 45.0],    // 3 spine east end
    [-121.4, 45.1],    // 4 North Rd end
    [-121.3, 44.95],   // 5 South Rd end
    [-121.35, 45.001], // 6 Parallel Rd west
    [-121.25, 45.001], // 7 Parallel Rd east
  ]
  const seg = (a, b, extra) => ({
    a, b, g: [n[a], n[b]], m: haversineMi(n[a], n[b]),
    surf: 'GRAVEL', oml: 3, veh: 63, sym: 2, rte: null, ...extra,
  })
  return {
    nodes: n,
    edges: [
      seg(0, 1, { name: 'Spine Rd' }),
      seg(1, 2, { name: 'Spine Rd' }),
      seg(2, 3, { name: 'Spine Rd' }),
      seg(1, 4, { name: 'North Rd', surf: 'DIRT', oml: 2 }),
      seg(2, 5, { name: 'South Rd', surf: 'NATIVE', oml: 2, veh: VEH_BITS.highClearance }),
      seg(6, 7, { name: 'Parallel Rd' }),
    ],
  }
})()

/** Reference shortest path: no heuristic, no heap. The thing A* must match. */
function dijkstra(index, start, goal, vehicleBit = 0) {
  const { graph, adj } = index
  const dist = new Map([[start, 0]])
  const seen = new Set()
  for (;;) {
    let u = -1, best = Infinity
    for (const [node, d] of dist) if (!seen.has(node) && d < best) { best = d; u = node }
    if (u === -1) return Infinity
    if (u === goal) return best
    seen.add(u)
    for (const link of adj.get(u) || []) {
      const e = graph.edges[link.edge]
      if (vehicleBit && !(e.veh & vehicleBit)) continue
      const alt = best + edgeMinutes(e)
      if (alt < (dist.get(link.to) ?? Infinity)) dist.set(link.to, alt)
    }
  }
}

console.log('\n── geometry helpers')
{
  ok('haversine 0.1° lon at 45°N ≈ 4.89 mi',
     Math.abs(haversineMi([-121.5, 45], [-121.4, 45]) - 4.89) < 0.05)
  ok('turnWord: straight', turnWord(5) === 'continue')
  ok('turnWord: right', turnWord(90) === 'turn right')
  ok('turnWord: left', turnWord(-90) === 'turn left')
  ok('turnWord: wraps past 180', turnWord(350) === 'continue')
  ok('turnWord: U-turn', turnWord(180) === 'make a U-turn')
}

console.log('\n── routing the known network')
{
  const idx = buildIndex(G)
  const r = route(idx, [-121.5, 45.0], [-121.2, 45.0])
  ok('routes end to end', r.ok, r.reason || '')
  ok('one merged step for one road', r.steps.length === 1 && r.steps[0].label === 'Spine Rd',
     r.steps.map(s => s.label).join(' / '))
  ok('A* matches Dijkstra', Math.abs(r.minutes - dijkstra(idx, 0, 3)) < 1e-9)

  const r2 = route(idx, [-121.5, 45.0], [-121.4, 45.1])
  ok('names both roads in order', r2.steps.map(s => s.label).join('→') === 'Spine Rd→North Rd',
     r2.steps.map(s => s.label).join('→'))
  ok('the turn onto North Rd is a left', r2.steps[1].turn === 'turn left', r2.steps[1].turn)
  ok('A* matches Dijkstra on the turn', Math.abs(r2.minutes - dijkstra(idx, 0, 4)) < 1e-9)
}

console.log('\n── vehicle class is a hard constraint, not a preference')
{
  const idx = buildIndex(G)
  const to = [-121.3, 44.95]
  ok('open to anything with no filter', route(idx, [-121.5, 45], to).ok)
  const car = route(idx, [-121.5, 45], to, { vehicleBit: VEH_BITS.passenger })
  ok('a passenger car is refused', !car.ok && car.reason === 'no-legal-route', car.reason || 'routed anyway')
  ok('high clearance is allowed', route(idx, [-121.5, 45], to, { vehicleBit: VEH_BITS.highClearance }).ok)
}

console.log('\n── snapping to the road, not to its junctions')
{
  const idx = buildIndex(G)
  const r = route(idx, [-121.45, 45.0005], [-121.2, 45.0])
  ok('routes from mid-road', r.ok, r.reason || '')
  ok('starts where you are', Math.abs(r.coordinates[0][0] + 121.45) < 1e-4)
  ok('so it is shorter than the whole spine', r.miles < 14.6 && r.miles > 11, `${r.miles.toFixed(2)} mi`)
  ok('reports the walk to the road', r.startOffRoadMi > 0 && r.startOffRoadMi < 0.1,
     `${(r.startOffRoadMi * 5280).toFixed(0)} ft`)

  const hop = route(idx, [-121.45, 45.0], [-121.35, 45.0])
  ok('a hop along one road stays on it', hop.ok && hop.steps.length === 1)
  ok('and is the direct distance', Math.abs(hop.miles - 4.89) < 0.1, `${hop.miles.toFixed(2)} mi`)

  // Landing on a junction must use it, or the roads meeting there go missing
  ok('snapping onto a junction keeps its other roads',
     route(idx, [-121.4, 45.00001], [-121.4, 45.1]).ok)
}

console.log('\n── failures are named, not thrown')
{
  const idx = buildIndex(G)
  ok('start too far from any road', route(idx, [-100, 40], [-121.2, 45]).reason === 'start-too-far')
  ok('destination too far', route(idx, [-121.5, 45], [-100, 40]).reason === 'end-too-far')
  const d = route(idx, [-121.5, 45.0], [-121.30001, 45.001])
  ok('not connected to the network', !d.ok && d.reason === 'not-connected', d.reason || 'routed anyway')
  ok('no graph loaded', route(buildIndex({ nodes: [], edges: [] }), [0, 0], [1, 1]).reason === 'no-graph')
}

console.log('\n── off-route detection')
{
  const idx = buildIndex(G)
  const r = route(idx, [-121.5, 45.0], [-121.2, 45.0])
  ok('on the line reads ~0', distanceToRouteMi(r.coordinates, [-121.35, 45.0]) < 1e-6)
  const off = distanceToRouteMi(r.coordinates, [-121.35, 45.05])
  ok('off the line reads the real distance', Math.abs(off - 3.45) < 0.2, `${off.toFixed(2)} mi`)
}

// Optional: a real graph, if one has been built and passed in
const realPath = process.argv[2]
if (realPath && fs.existsSync(realPath)) {
  console.log(`\n── real graph: ${realPath}`)
  const graph = JSON.parse(fs.readFileSync(realPath, 'utf8'))
  const idx = buildIndex(graph)
  const seen = new Set()
  let biggest = []
  for (let n = 0; n < graph.nodes.length; n++) {
    if (seen.has(n)) continue
    const stack = [n], comp = []
    seen.add(n)
    while (stack.length) {
      const u = stack.pop()
      comp.push(u)
      for (const l of idx.adj.get(u) || []) if (!seen.has(l.to)) { seen.add(l.to); stack.push(l.to) }
    }
    if (comp.length > biggest.length) biggest = comp
  }
  console.log(`  ${graph.nodes.length} nodes, ${graph.edges.length} edges, ` +
              `largest component ${biggest.length} (${(biggest.length / graph.nodes.length * 100).toFixed(0)}%)`)
  const sample = biggest.slice(0, 300)
  let A = sample[0], B = sample[0], far = 0
  for (const n of sample) for (const m of sample) {
    const d = haversineMi(graph.nodes[n], graph.nodes[m])
    if (d > far) { far = d; A = n; B = m }
  }
  const t0 = Date.now()
  const r = route(idx, graph.nodes[A], graph.nodes[B])
  const ms = Date.now() - t0
  ok('routes on real data', r.ok, r.reason || '')
  ok('fast enough to feel instant', ms < 400, `${ms} ms over ${graph.edges.length} edges`)
  ok('at least the straight line', r.ok && r.miles >= far - 1e-6, `${r.miles?.toFixed(1)} vs ${far.toFixed(1)} crow`)
  ok('matches Dijkstra', r.ok && Math.abs(r.minutes - dijkstra(idx, A, B)) < 1e-9)
  ok('every step is labelled', r.ok && r.steps.every(s => s.label && s.turn))
  if (r.ok) console.log(`  → ${r.miles.toFixed(1)} mi, ${Math.round(r.minutes)} min, ${r.steps.length} steps`)
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed\n`)
process.exit(fail ? 1 : 0)
