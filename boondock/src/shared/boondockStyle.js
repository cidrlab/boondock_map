/**
 * The Boondock basemap — our own terrain style.
 *
 * CiDR navy terrain: client-rendered hillshade under a minimalist vector
 * map. Water and forest carry the brand navies, roads are cool-blue
 * hairlines, and mountain peaks label their elevation in feet. Sources are
 * keyless and free: OpenFreeMap vector tiles (OpenMapTiles schema) and the
 * public terrain-tiles DEM on AWS (Mapzen terrarium encoding).
 */

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

// Palettes — derived from BRAND.md tokens
const NIGHT = {
  land:       '#16202b',
  landDark:   '#121a23',
  forest:     '#1b2b34',   // wooded ground sits slightly lighter than clearings
  scrub:      '#182631',
  park:       '#1a2c40',
  water:      '#223754',
  waterway:   '#35506e',
  building:   '#222f3d',
  roadMajor:  '#587a9e',
  roadMid:    '#47617e',
  roadMinor:  '#3a536e',
  path:       '#6b87a6',
  rail:       '#31414f',
  boundary:   'rgba(232, 238, 244, 0.28)',
  textBright: '#e8eef4',
  text:       '#c6d4e2',
  textDim:    '#9fb4c8',
  textFaint:  '#6d8098',
  halo:       '#0e141b',
  ice:        '#28394c',
  waterName:  '#7d9bbf',
  peakText:   '#b9c9d9',
  cityText:   '#e8eef4',
  hsExaggeration: 0.32,
  hsShadow:    '#070b10',
  hsHighlight: '#52719b',
  hsAccent:    '#0d131b',
}

// Daylight: same structure, navy ink on paper-light ground for full sun
const DAY = {
  land:       '#eef1f4',
  landDark:   '#e4e9ee',
  forest:     '#e0e8e0',   // wooded ground a shade darker than clearings
  scrub:      '#e7ece7',
  park:       '#dce8f0',
  water:      '#b9cfe4',
  waterway:   '#9dbcd8',
  building:   '#d9dfe7',
  roadMajor:  '#3f5a78',
  roadMid:    '#55708e',
  roadMinor:  '#8199b1',
  path:       '#6e87a3',
  rail:       '#b6c0cc',
  boundary:   'rgba(25, 34, 44, 0.30)',
  textBright: '#19222C',
  text:       '#2e4054',
  textDim:    '#55708e',
  textFaint:  '#7e91a6',
  halo:       '#f2f5f8',
  ice:        '#e6edf5',
  waterName:  '#5b7ea3',
  peakText:   '#3d5270',
  cityText:   '#26364a',
  roadSoften: true,   // dense urban grids read calmer with opacity ramps
  hsExaggeration: 0.25,
  hsShadow:    '#93a6bc',
  hsHighlight: '#ffffff',
  hsAccent:    '#cdd8e4',
}

export const BOONDOCK_GLYPHS = GLYPHS

// Route numbers for the roads you navigate by (VISION row 105). The map drew
// highways but never named them, so an interstate was a slightly thicker line
// and nothing else — no way to tell I-5 from US-97 while planning a way out.
// `ref` is a separate field from `name` in the OpenMapTiles schema, so the
// road-name layer below, which labels `name`, never showed a route number.
//
// Bold haloed text rather than a shield graphic: shields need a sprite sheet
// and this style deliberately has none, and a legible "I-5" beats a fake
// shield. Built here rather than inline because the same shields ride the
// Names & Labels overlay over Satellite, and two copies of a symbol layer
// drift apart.
export function buildRoadShieldLayer(mode, id, visibility) {
  const C = mode === 'day' ? DAY : NIGHT
  return {
    id,
    type: 'symbol',
    source: 'omt',
    'source-layer': 'transportation_name',
    minzoom: 8,
    filter: ['all',
      ['has', 'ref'],
      ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
    ],
    layout: {
      // `ref` is the bare number, so an interstate would render as a lone "5"
      // — indistinguishable from a state route and easily mistaken for a site
      // cluster count. `network` (confirmed present in the OpenFreeMap
      // TileJSON) says which shield it would be, so it reads I-5 / US 97, and
      // anything else keeps its own ref, which already carries a letter suffix
      // like 99W.
      'text-field': ['case',
        ['==', ['get', 'network'], 'us-interstate'], ['concat', 'I-', ['get', 'ref']],
        ['==', ['get', 'network'], 'us-highway'], ['concat', 'US ', ['get', 'ref']],
        ['get', 'ref'],
      ],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 12.5],
      'symbol-placement': 'line',
      'symbol-spacing': 220,
      'text-rotation-alignment': 'viewport',   // shields read upright, not along the curve
      'text-padding': 3,
      ...(visibility && { visibility }),
    },
    paint: {
      'text-color': C.textBright,
      'text-halo-color': C.halo,
      'text-halo-width': 2.2,
    },
  }
}

// The basemap's vector source, and the single most important thing in this
// file for offline use.
//
// Defining it with `url:` means MapLibre must fetch a TileJSON before the
// style can finish loading — and when that fetch fails, the map's `load`
// event never fires, so **none** of the app's layers are ever added. Not the
// roads, not the sites, not the saved offline pack. Verified 2026-08-09:
// blocking tiles.openfreemap.org alone, with everything else reachable, left
// the map completely blank (VISION row 126).
//
// So the source is defined inline from a cached tile template whenever we
// have one, which needs no network to construct. The template is remembered
// because OpenFreeMap's URL carries a dated build path
// (…/planet/20260802_080001_pt/…) that rotates, so it cannot simply be
// hardcoded — we learn it while online and keep it.
const OMT_TILES_KEY = 'boondock-omt-tiles'
const OMT_TILEJSON = 'https://tiles.openfreemap.org/planet'
const OMT_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'

function cachedOmt() {
  try {
    const raw = JSON.parse(localStorage.getItem(OMT_TILES_KEY))
    if (raw?.tiles?.length) return raw
  } catch { /* private mode, or nothing stored yet */ }
  return null
}

/**
 * Learn (or refresh) the tile template while we have a connection, so the
 * next launch can build the style without asking anyone's permission. Safe to
 * call on every start; a failure leaves whatever we already knew.
 */
export async function refreshOmtTemplate() {
  try {
    const res = await fetch(OMT_TILEJSON)
    if (!res.ok) return
    const j = await res.json()
    if (!j?.tiles?.length) return
    localStorage.setItem(OMT_TILES_KEY, JSON.stringify({
      tiles: j.tiles,
      minzoom: j.minzoom ?? 0,
      maxzoom: j.maxzoom ?? 14,
    }))
  } catch { /* offline, or blocked — keep the old template */ }
}

export function omtSource() {
  const hit = cachedOmt()
  if (hit) {
    return {
      type: 'vector',
      tiles: hit.tiles,
      minzoom: hit.minzoom,
      maxzoom: hit.maxzoom,
      attribution: OMT_ATTRIBUTION,
    }
  }
  // First run with nothing cached: the TileJSON is the only way to learn the
  // template, and a first-ever run with no network cannot work regardless.
  return { type: 'vector', url: OMT_TILEJSON, attribution: OMT_ATTRIBUTION }
}


export function buildBoondockStyle(mode = 'night') {
  const C = mode === 'day' ? DAY : NIGHT
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: omtSource(),
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        // z12 relief is plenty when overzoomed; halves DEM requests up close
        maxzoom: 12,
        attribution: 'Terrain: Mapzen terrain tiles (USGS 3DEP, SRTM) via AWS',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': C.land } },

      // Terrain first: everything else reads on top of the relief
      {
        id: 'hillshade', type: 'hillshade', source: 'dem',
        paint: {
          'hillshade-exaggeration': C.hsExaggeration,
          'hillshade-shadow-color': C.hsShadow,
          'hillshade-highlight-color': C.hsHighlight,
          'hillshade-accent-color': C.hsAccent,
        },
      },

      // ── Landcover ──────────────────────────────────────────────────────
      {
        id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['any', ['==', ['get', 'class'], 'wood'], ['==', ['get', 'class'], 'forest']],
        paint: { 'fill-color': C.forest, 'fill-opacity': 0.5 },
      },
      {
        id: 'landcover-scrub', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['any', ['==', ['get', 'class'], 'grass'], ['==', ['get', 'class'], 'scrub'], ['==', ['get', 'class'], 'wetland']],
        paint: { 'fill-color': C.scrub, 'fill-opacity': 0.4 },
      },
      {
        id: 'landcover-ice', type: 'fill', source: 'omt', 'source-layer': 'landcover',
        filter: ['==', ['get', 'class'], 'ice'],
        paint: { 'fill-color': C.ice, 'fill-opacity': 0.55 },
      },
      {
        id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park',
        paint: { 'fill-color': C.park, 'fill-opacity': 0.3 },
      },
      {
        id: 'landuse-residential', type: 'fill', source: 'omt', 'source-layer': 'landuse',
        filter: ['any', ['==', ['get', 'class'], 'residential'], ['==', ['get', 'class'], 'commercial'], ['==', ['get', 'class'], 'industrial']],
        paint: { 'fill-color': C.landDark, 'fill-opacity': 0.6 },
      },

      // ── Water ──────────────────────────────────────────────────────────
      {
        id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
        paint: { 'fill-color': C.water },
      },
      {
        id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
        paint: {
          'line-color': C.waterway,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.5, 14, 2.2],
        },
      },

      // ── Buildings (close zooms only) ───────────────────────────────────
      {
        id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-color': C.building, 'fill-opacity': 0.7 },
      },

      // ── Aeroway / rail ─────────────────────────────────────────────────
      {
        id: 'aeroway', type: 'line', source: 'omt', 'source-layer': 'aeroway', minzoom: 10,
        paint: { 'line-color': C.roadMinor, 'line-width': 1.5 },
      },
      {
        id: 'rail', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'rail'],
        paint: { 'line-color': C.rail, 'line-width': 1, 'line-dasharray': [4, 3] },
      },

      // ── Roads — cool-blue hairlines, thinner than anyone else's ───────
      {
        id: 'road-path', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
        filter: ['==', ['get', 'class'], 'path'],
        paint: {
          'line-color': C.path,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 1.6],
          'line-dasharray': [2.5, 1.6],
        },
      },
      {
        id: 'road-track', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 10,
        filter: ['==', ['get', 'class'], 'track'],
        paint: {
          'line-color': C.path,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 2],
          'line-dasharray': [4, 2],
        },
      },
      {
        id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        minzoom: 11,
        paint: {
          'line-color': C.roadMinor,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 11, 0.5, 18, 5],
          ...(C.roadSoften && { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.45, 14, 0.9] }),
        },
      },
      {
        id: 'road-secondary', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        paint: {
          'line-color': C.roadMid,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.6, 18, 7],
          ...(C.roadSoften && { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 13, 0.9] }),
        },
      },
      {
        id: 'road-primary', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk']]],
        paint: {
          'line-color': C.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 6, 0.8, 18, 9],
          ...(C.roadSoften && { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.65, 12, 0.95] }),
        },
      },
      {
        id: 'road-motorway', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        paint: {
          'line-color': C.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 5, 1, 18, 11],
          ...(C.roadSoften && { 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 0.95] }),
        },
      },

      // ── Boundaries ─────────────────────────────────────────────────────
      {
        id: 'boundary-state', type: 'line', source: 'omt', 'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 4],
        paint: { 'line-color': C.boundary, 'line-width': 1, 'line-dasharray': [3, 2] },
      },
      {
        id: 'boundary-country', type: 'line', source: 'omt', 'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 2],
        paint: { 'line-color': C.boundary, 'line-width': 1.5 },
      },

      // ── Labels ─────────────────────────────────────────────────────────
      {
        id: 'water-name', type: 'symbol', source: 'omt', 'source-layer': 'water_name',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 11,
        },
        paint: { 'text-color': C.waterName, 'text-halo-color': C.halo, 'text-halo-width': 1 },
      },
      {
        id: 'road-name', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10.5,
          'symbol-placement': 'line',
        },
        paint: { 'text-color': C.textDim, 'text-halo-color': C.halo, 'text-halo-width': 1 },
      },
      buildRoadShieldLayer(mode, 'road-shield'),
      {
        // Peaks label their elevation in feet — the map carries its own numbers
        id: 'peak', type: 'symbol', source: 'omt', 'source-layer': 'mountain_peak', minzoom: 9,
        filter: ['has', 'ele'],
        layout: {
          'text-field': ['concat',
            ['coalesce', ['get', 'name'], 'Peak'], '\n',
            ['to-string', ['round', ['*', ['get', 'ele'], 3.28084]]], ' ft'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 10,
          'text-line-height': 1.25,
        },
        paint: { 'text-color': C.peakText, 'text-halo-color': C.halo, 'text-halo-width': 1.1 },
      },
      {
        id: 'place-village', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['village', 'hamlet', 'suburb']]],
        minzoom: 10,
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
        paint: { 'text-color': C.textDim, 'text-halo-color': C.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'town'],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12.5 },
        paint: { 'text-color': C.text, 'text-halo-color': C.halo, 'text-halo-width': 1.3 },
      },
      {
        id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'city'],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-letter-spacing': 0.02 },
        paint: { 'text-color': C.cityText, 'text-halo-color': C.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-state', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'state'],
        maxzoom: 8,
        layout: {
          'text-field': ['upcase', ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-letter-spacing': 0.25,
        },
        paint: { 'text-color': C.textFaint, 'text-halo-color': C.halo, 'text-halo-width': 1 },
      },
    ],
  }
}
