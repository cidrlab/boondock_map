/**
 * Map layer definitions for Boondock Map — the two-base model.
 *
 * BASE LAYERS
 *   boondock    Our own designed terrain basemap (vector + hillshade,
 *               built in shared/boondockStyle.js)
 *   satellite   ESRI World Imagery
 *
 * OVERLAYS stack on either base: MVUM roads, hiking trails, the Sites
 * database, names/labels (mainly for satellite), BLM public land, and
 * USGS topo contours (with elevation figures — best over satellite).
 *
 * PACK_LAYERS are downloadable for offline use but are not bases: USGS
 * Topo packs appear automatically as the fallback map when offline.
 */

export const BASE_LAYERS = {
  'boondock': {
    id: 'boondock',
    label: 'Boondock',
    description: 'Our terrain map — hillshade relief, peak elevations in feet, minimalist CiDR style',
    custom: true,   // style built in boondockStyle.js, not a raster URL
    styleMode: 'night',
    maxZoom: 19,
  },
  'boondock-day': {
    id: 'boondock-day',
    label: 'Boondock Day',
    description: 'The same map in daylight tones — easier to read in full sun',
    custom: true,
    styleMode: 'day',
    maxZoom: 19,
  },
  'satellite': {
    id: 'satellite',
    label: 'Satellite',
    // USGS orthoimagery, not ESRI (Tim's call, 2026-08-10). ESRI's World
    // Imagery cannot be cached under its terms, which made the satellite view
    // the one base that could never work offline. USGS imagery is **public
    // domain**, comes from the same National Map host the topo packs already
    // use, and is therefore downloadable like everything else. The trade is
    // honest and worth stating: USGS covers the United States, where this app
    // works, rather than the globe.
    description: 'USGS orthoimagery — scout the actual ground cover. Public domain, so it downloads for offline use.',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS The National Map: Orthoimagery',
    maxZoom: 19,
    minZoom: 0,
    // The service advertises LOD 23, but imagery thins out well before that in
    // the backcountry; stop requesting past 16 and let MapLibre scale up —
    // fuzzy close-up beats a blank map on a forest road.
    sourceMaxzoom: 16,
    offlineOk: true,
  },
}

// Downloadable offline packs (not selectable bases). Only public-domain
// US-government services until other providers' terms are verified
// (VISION.md) — that's why satellite and the vector base aren't here yet.
export const PACK_LAYERS = {
  'usgs-topo': {
    id: 'usgs-topo',
    label: 'USGS Topo (offline safety map)',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map',
    maxZoom: 16,
    offlineOk: true,
  },
  'blm-land': {
    id: 'blm-land',
    label: 'Public Land overlay (BLM)',
    tileUrl: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}',
    attribution: 'BLM',
    maxZoom: 15,
    offlineOk: true,
  },
  // The Boondock basemap's own vector tiles (VISION row 128). Served through
  // the tile protocol like everything else, so a downloaded pack is used first
  // and the network is the fallback — which is what finally makes the terrain
  // map itself work with no signal, rather than only the USGS topo fallback.
  // OpenFreeMap allows this explicitly: MIT-licensed, no API key, no rate
  // limit, commercial use fine (checked 2026-08-10). Attribution required and
  // carried on the source.
  'boondock-base': {
    id: 'boondock-base',
    label: 'Boondock basemap (terrain + roads)',
    vectorTilePack: true,
    attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors',
    maxZoom: 14,   // OpenFreeMap's own top zoom; past this MapLibre overzooms
    // NOT offered in the download picker yet (VISION row 128). The plumbing
    // works — the source is routed through the tile protocol, a pack saves,
    // and getTile answers for the right tile with real bytes — but the
    // basemap still does not draw from that pack with the network gone, and
    // an option that promises offline and delivers a blank map is worse than
    // no option. Turn this on with the same test that is written down in the
    // row, not before.
    offlineOk: false,
  },
  // Our own tilesets, downloadable as one pack (VISION row 127). These cache
  // themselves as you browse, but browsing is not planning: you should be able
  // to say "save the roads for this whole area" before leaving the driveway
  // rather than having to pan over every valley first.
  'forest-roads': {
    id: 'forest-roads',
    label: 'Forest roads & trails (MVUM, trails, all FS roads)',
    vectorPack: true,
    archives: ['mvum.pmtiles', 'mvum-trails.pmtiles', 'trails.pmtiles', 'roadcore.pmtiles'],
    attribution: 'USFS',
    maxZoom: 12,     // the zoom the tilesets are built to; past this MapLibre overzooms
    offlineOk: true,
  },
}

export const OVERLAY_LAYERS = {
  // First deliberately: this is the layer that answers the question the app
  // exists for — where might I be able to camp — so it leads the list rather
  // than sitting seventh (Tim, 2026-08-09). Order here drives the Overlays
  // list; it does not affect map draw order, because zones are added by
  // addZonesLayers() rather than by the raster loop in addOverlaySources().
  'zones': {
    id: 'zones',
    label: 'Boondock Zones β',
    description: 'Beta heuristic: USFS-owned land within ~300 m of a legal MVUM road. Not a statement of legality — always verify rules and closures locally.',
    zones: true,    // GeoJSON polygon layer, handled in Map.jsx
  },
  'mvum': {
    id: 'mvum',
    label: 'MVUM Roads',
    description: 'USFS Motor Vehicle Use Map — the roads and motorized trails you may legally drive, by vehicle type (National Forests only). Self-hosted vector tiles, so it does not depend on Forest Service servers staying up. Tap a route for its legal class, vehicles, season, and surface.',
    // Self-hosted vector tiles (VISION row 83): mvum.pmtiles (151,021 roads)
    // and mvum-trails.pmtiles (17,725 motorized trails), added by
    // addMvumVectorLayers() in Map.jsx.
    //
    // The live sublayer stays, drawn *under* the vector lines, and it is only
    // the trails half (mapLayerId 2). Reason: the roads bulk file matches the
    // live service exactly (Deschutes NF 4,990 either way, verified
    // 2026-08-09), so self-hosting roads loses nothing — but the motorized
    // trails bulk file carries geometry for just 17,725 of the 63,056 the
    // service holds, and whole forests differ (Ozark-St. Francis: 161 live,
    // 0 in the file). So we tile what exists and let the service fill in the
    // rest when there's a connection (Tim's call, 2026-08-09). Offline, the
    // raster simply doesn't draw and the vector lines remain.
    direct: true,
    // Restyled through dynamicLayers to the same amber the self-hosted
    // motorized trails use, so the online fill-in and the offline layer read
    // as one thing rather than two — USFS's own white symbology looked like a
    // different dataset sitting on top of ours.
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&dynamicLayers='
      + encodeURIComponent(JSON.stringify([{
          id: 102,
          source: { type: 'mapLayer', mapLayerId: 2 },
          drawingInfo: { renderer: { type: 'simple', symbol: { type: 'esriSLS', style: 'esriSLSDash', color: [242, 193, 78, 255], width: 1.2 } }, showLabels: false },
        }])),
    identifyUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/identify',
    attribution: 'USFS MVUM',
    sourceMinzoom: 7,   // don't request exports while the layer is invisible
    sourceMaxzoom: 15,
    zoomOpacity: [
      [5,  0.0],
      [7,  0.7],
      [11, 0.9],
    ],
  },
  'usfs-trails': {
    id: 'usfs-trails',
    label: 'Hiking Trails',
    description: 'National Forest trail system — self-hosted vector tiles, independent of agency uptime. Tap a trail for who it is managed for, its class, and surface.',
    // Self-hosted vector tiles (VISION row 83): trails.pmtiles, 77,234 trails,
    // added by addTrailsVectorLayers() in Map.jsx.
    //
    // Same arrangement as MVUM above, for the same reason: the bulk file holds
    // geometry for 77,234 trails while the live service returns 86,303 — it is
    // both geometry-complete and fresher than the 2025-05-11 export. The
    // raster draws beneath the vector lines so the gap fills in online without
    // hiding the crisper offline layer.
    direct: true,
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&dynamicLayers='
      + encodeURIComponent(JSON.stringify([{
          id: 101,
          source: { type: 'mapLayer', mapLayerId: 0 },
          drawingInfo: { renderer: { type: 'simple', symbol: { type: 'esriSLS', style: 'esriSLSShortDash', color: [139, 171, 208, 255], width: 1.8 } }, showLabels: false },
        }])),
    attribution: 'USFS',
    identifyUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/identify',
    sourceMinzoom: 8,
    sourceMaxzoom: 15,
    zoomOpacity: [
      [6,  0.0],
      [8,  0.6],
      [11, 0.95],
    ],
  },
  'blm-roads': {
    id: 'blm-roads',
    label: 'BLM Roads',
    description: 'BLM roads open to public motorized use — the drive-able road network on BLM land, mostly across the West. Public domain (BLM GTLF). Tap a road for its details.',
    // Live like MVUM: BLM's GTLF Public_Display MapServer renders per-tile via
    // export. layers 0+1 = public + limited-public motorized ROADS (2–7 are
    // trails, excluded). dynamicLayers restyles both to a burnt-orange line so
    // they read on the dark base and stand apart from the sky-blue trails.
    direct: true,
    tileUrl: 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF_Public_Display/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&dynamicLayers='
      + encodeURIComponent(JSON.stringify([
          { id: 101, source: { type: 'mapLayer', mapLayerId: 0 }, drawingInfo: { renderer: { type: 'simple', symbol: { type: 'esriSLS', style: 'esriSLSSolid', color: [200, 120, 48, 255], width: 1.6 } }, showLabels: false } },
          { id: 102, source: { type: 'mapLayer', mapLayerId: 1 }, drawingInfo: { renderer: { type: 'simple', symbol: { type: 'esriSLS', style: 'esriSLSDash', color: [200, 120, 48, 255], width: 1.4 } }, showLabels: false } },
        ])),
    identifyUrl: 'https://gis.blm.gov/arcgis/rest/services/transportation/BLM_Natl_GTLF_Public_Display/MapServer/identify',
    attribution: 'BLM GTLF',
    sourceMinzoom: 7,
    sourceMaxzoom: 15,
    zoomOpacity: [
      [5,  0.0],
      [7,  0.75],
      [11, 0.95],
    ],
  },
  'roadcore': {
    id: 'roadcore',
    label: 'All FS Roads',
    description: 'Every Forest Service road (USFS RoadCore), self-hosted as vector tiles. The full network, well beyond the legal-motorized MVUM subset: solid = open to some vehicle, faded dashes = closed. A road being here is not permission to drive it.',
    roadcore: true,   // vector PMTiles overlay, handled in Map.jsx
    attribution: 'USFS RoadCore',
  },
  'wildfire': {
    id: 'wildfire',
    label: 'Wildfires',
    description: 'Current active wildfire perimeters across the US (NIFC, refreshed every few minutes). Red areas are actively burning. A safety layer — conditions change fast, so verify closures and never head toward an active fire. Loads when you switch it on.',
    wildfire: true,   // GeoJSON fetched live from NIFC, handled in Map.jsx
    attribution: 'NIFC WFIGS',
  },
  'sites': {
    id: 'sites',
    label: 'Sites',
    description: 'Campsites, RV parks, dump stations, water fills, trailheads — 93,000+ places across all 50 states from OSM, Overture, Recreation.gov, and WA DNR',
    sites: true,    // GeoJSON spots layer, handled in Map.jsx
  },
  'names': {
    id: 'names',
    label: 'Names & Labels',
    description: 'Place and road names — the Boondock base has its own; use this over Satellite',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI',
    zoomOpacity: [
      [4,  0.6],
      [10, 0.8],
      [15, 0.95],
    ],
  },
  'blm-land': {
    id: 'blm-land',
    label: 'Public Land',
    description: 'BLM Surface Management Agency — who manages each parcel (BLM, USFS, NPS, state…)',
    tileUrl: 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cached_with_PriUnk/MapServer/tile/{z}/{y}/{x}',
    attribution: 'BLM',
    maxZoom: 23,
    zoomOpacity: [
      [5,  0.30],
      [8,  0.40],
      [12, 0.45],
      [15, 0.50],
    ],
  },
  'contours': {
    id: 'contours',
    label: 'Topo Lines',
    description: 'Contour lines with elevation figures — sparse index lines from afar, tighter intervals as you zoom',
    // The contours tile cache is dead at every zoom; export rendering works.
    // Two windows so lines never bunch: index-only lines first, the 50-foot
    // and large-scale sets once you're close enough for them to breathe.
    direct: true,
    attribution: 'USGS National Map',
    parts: [
      {
        // Small-scale set, labels off (sublayer 2 of group 0; the group is
        // valid 1:3M–1:600k). Tiles must stop at z8: a 512px export of a z9
        // tile is 1:577,790 — 4% outside the band, and ArcGIS returns blank.
        // z8 tiles overscale through the fade window. Low opacity — in steep
        // country these 100-ft lines are dense and read as terrain texture
        key: 'far',
        tileUrl: 'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&layers=show:2',
        sourceMinzoom: 8,
        sourceMaxzoom: 8,
        zoomOpacity: [[8.8, 0.0], [9.4, 0.22], [9.9, 0.22], [10.3, 0.0]],
      },
      {
        key: 'coarse',
        tileUrl: 'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&layers=show:10,11',
        sourceMinzoom: 10,
        sourceMaxzoom: 14,
        zoomOpacity: [[9.6, 0.0], [10.5, 0.65], [12.4, 0.65], [12.9, 0.0]],
      },
      {
        key: 'fine',
        tileUrl: 'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&layers=show:14,19',
        sourceMinzoom: 12,
        sourceMaxzoom: 16,
        zoomOpacity: [[12.4, 0.0], [12.9, 0.7]],
      },
    ],
  },
}

// Site categories in the spots database — ids match the GeoJSON `kind`
// property; colors match the map dots and the legend
export const SITE_KINDS = [
  { id: 'campsite',  label: 'Campsite',  color: '#22c55e' },
  { id: 'rv_park',   label: 'RV park',   color: '#a78bfa' },
  { id: 'dump',      label: 'Dump',      color: '#fb923c' },
  { id: 'water',     label: 'Water',     color: '#38bdf8' },
  { id: 'trailhead', label: 'Trailhead', color: '#f472b6' },
]

export const DEFAULT_OVERLAYS = {
  // Same order as OVERLAY_LAYERS above, so the two read together
  'zones': false,
  'mvum': true,
  'usfs-trails': true,
  'blm-roads': false,
  'roadcore': false,
  'wildfire': false,
  'sites': true,
  'names': false,
  'blm-land': false,
  'contours': false,
}

export const DEFAULT_BASE = 'boondock'
export const DEFAULT_CENTER = [-121.88, 47.95]  // Monroe, WA area
export const DEFAULT_ZOOM = 12
