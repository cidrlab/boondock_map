/**
 * Map layer / tile source definitions for Boondock Map
 *
 * BASE LAYERS (mutually exclusive)
 *   usgs-topo        USGS National Map Topo — same terrain rendering as ngmdb.usgs.gov/topoview
 *   topo-imagery     ESRI satellite + USGS topo overlay (high-res composite)
 *   esri-satellite   ESRI World Imagery (high-res satellite, global)
 *   esri-hybrid      ESRI satellite + road/place labels
 *   osm-topo         OpenTopoMap (global fallback, lighter style)
 */

export const BASE_LAYERS = {
  'usgs-topo': {
    id: 'usgs-topo',
    label: 'USGS Topo',
    icon: '🗺️',
    description: 'Modern USGS 1:24,000 topo — contours, trails, roads. Same as TopoView.',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map',
    maxZoom: 16,
    minZoom: 0,
    tmsYFlip: false,
  },
  'topo-imagery': {
    id: 'topo-imagery',
    label: 'Topo + Imagery',
    icon: '🏔️',
    description: 'ESRI high-res satellite with USGS topo lines overlaid — zoom 19 with contours',
    composite: true,  // handled in Map.jsx buildStyle
    attribution: 'ESRI, Maxar, USGS',
    maxZoom: 19,
    minZoom: 0,
  },
  'esri-satellite': {
    id: 'esri-satellite',
    label: 'Satellite',
    icon: '🌍',
    description: 'ESRI World Imagery — global high-res satellite',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI, Maxar, GeoEye',
    maxZoom: 19,
    minZoom: 0,
    tmsYFlip: false,
  },
  'esri-hybrid': {
    id: 'esri-hybrid',
    label: 'Hybrid',
    icon: '🗾',
    description: 'Satellite imagery with road labels and boundaries',
    composite: true,  // handled in Map.jsx buildStyle
    attribution: 'ESRI, Maxar, HERE',
    maxZoom: 19,
    minZoom: 0,
  },
  'osm-topo': {
    id: 'osm-topo',
    label: 'OpenTopo',
    icon: '⛰️',
    description: 'OpenTopoMap — global topo with OSM detail',
    tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '© OpenTopoMap, OpenStreetMap',
    maxZoom: 17,
    minZoom: 0,
    tmsYFlip: false,
  },
}

// USGS Topo tile URL (used for composite overlay in topo-imagery mode)
export const USGS_TOPO_URL =
  'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'

export const OVERLAY_LAYERS = {
  // Roads: ESRI Transportation reference — transparent PNG tiles, works on any base layer.
  // Zoom-driven opacity: visible but faint from high up, full opacity when close in.
  'roads': {
    id: 'roads',
    label: 'Roads & Trails',
    icon: '🛤️',
    description: 'All roads including forest/primitive roads + trail network. Transparent overlay.',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI',
    // opacity: [zoom-stop, opacity] pairs — boosted visibility at mid-zooms for satellite views
    zoomOpacity: [
      [5,  0.45],
      [9,  0.65],
      [12, 0.85],
      [15, 0.95],
    ],
  },
  'usfs-roads': {
    id: 'usfs-roads',
    label: 'Forest Roads',
    icon: '🌲',
    description: 'USFS primitive & forest roads only — stacks on top of roads overlay for extra detail',
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadCoreAttributes_01/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USFS',
    zoomOpacity: [
      [8,  0.0],
      [10, 0.5],
      [12, 0.75],
      [15, 0.90],
    ],
  },
  'usfs-trails': {
    id: 'usfs-trails',
    label: 'Hiking Trails',
    icon: '🥾',
    description: 'National Forest and NPS trail system',
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Trail_01/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USFS / NPS',
    zoomOpacity: [
      [8,  0.0],
      [10, 0.6],
      [13, 0.85],
    ],
  },
  'road-labels': {
    id: 'road-labels',
    label: 'Road Labels',
    icon: '🏷️',
    description: 'Road names, place names, and boundaries — adds text labels over any base',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI',
    zoomOpacity: [
      [8,  0.0],
      [10, 0.6],
      [12, 0.80],
      [15, 0.95],
    ],
  },
  'contours': {
    id: 'contours',
    label: 'Contour Lines',
    icon: '〰️',
    description: '40ft contour lines from USGS — useful on satellite/imagery layers',
    tileUrl: 'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map',
    maxZoom: 16,
    zoomOpacity: [
      [8,  0.0],
      [10, 0.5],
      [13, 0.80],
    ],
  },
  'blm-land': {
    id: 'blm-land',
    label: 'Public Land',
    icon: '🏕️',
    description: 'BLM Surface Management Agency — shows who manages each land parcel (BLM, USFS, NPS, etc.)',
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
}

// ESRI reference tile URLs (transparent background, stack on any base)
export const ESRI_REFERENCE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

// Road names, place names, boundaries — adds text labels that World_Transportation lacks
export const ESRI_LABELS_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

export const DEFAULT_BASE = 'usgs-topo'
export const DEFAULT_CENTER = [-121.88, 47.95]  // Monroe, WA area
export const DEFAULT_ZOOM = 12  // zoom 12+ shows topo detail well
