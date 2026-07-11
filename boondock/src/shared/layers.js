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
    maxZoom: 19,
  },
  'satellite': {
    id: 'satellite',
    label: 'Satellite',
    description: 'ESRI World Imagery — scout the actual ground cover',
    tileUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'ESRI, Maxar, GeoEye',
    maxZoom: 19,
    minZoom: 0,
  },
}

// Downloadable offline packs (not selectable bases)
export const PACK_LAYERS = {
  'usgs-topo': {
    id: 'usgs-topo',
    label: 'USGS Topo (offline safety map)',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map',
    maxZoom: 16,
    // Public-domain USGS service — only layer cleared for offline pack
    // downloads until ESRI/OpenTopoMap terms are verified (VISION.md)
    offlineOk: true,
  },
}

export const OVERLAY_LAYERS = {
  'mvum': {
    id: 'mvum',
    label: 'MVUM Roads',
    description: 'USFS Motor Vehicle Use Map — which forest roads are legal to drive, by vehicle type',
    // Service has no tile cache; ArcGIS export renders per-tile via bbox
    direct: true,
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image',
    attribution: 'USFS MVUM',
    // Below z10 the service renders a "Data Available" coverage watermark —
    // keep the layer for close zooms where actual roads draw
    zoomOpacity: [
      [9.5,  0.0],
      [10.5, 0.85],
      [13,   0.95],
    ],
  },
  'usfs-trails': {
    id: 'usfs-trails',
    label: 'Hiking Trails',
    description: 'National Forest and NPS trail system',
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_Trail_01/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USFS / NPS',
    zoomOpacity: [
      [8,  0.0],
      [10, 0.6],
      [13, 0.85],
    ],
  },
  'sites': {
    id: 'sites',
    label: 'Sites',
    description: 'Campsites, RV parks, dump stations, water fills — baseline database (Washington to start; OpenStreetMap)',
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
  'topo': {
    id: 'topo',
    label: 'Topo Overlay',
    description: 'USGS topo blended over the base — contour lines and elevation figures; great with Satellite',
    tileUrl: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',
    attribution: 'USGS National Map',
    maxZoom: 16,
    zoomOpacity: [
      [8,  0.50],
      [14, 0.45],
      [16, 0.40],
    ],
  },
}

export const DEFAULT_OVERLAYS = {
  'mvum': true,
  'usfs-trails': true,
  'sites': true,
  'names': false,
  'blm-land': false,
  'topo': false,
}

export const DEFAULT_BASE = 'boondock'
export const DEFAULT_CENTER = [-121.88, 47.95]  // Monroe, WA area
export const DEFAULT_ZOOM = 12
