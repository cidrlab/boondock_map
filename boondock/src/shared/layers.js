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
    description: 'USFS Motor Vehicle Use Map — legal forest roads by vehicle type (National Forests only). Tap a road for its name and details.',
    // Service has no tile cache; ArcGIS export renders per-tile via bbox.
    // layers=show:1,2 = just roads+trails, skipping the low-zoom
    // "Data Available" status watermark sublayers
    direct: true,
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&layers=show:1,2&f=image',
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
    description: 'National Forest trail system',
    // The old EDW_Trail_01 tile cache 404s; the publish service renders via
    // export, restyled through dynamicLayers so trails read on the dark base
    direct: true,
    tileUrl: 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_TrailNFSPublish_01/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&dynamicLayers='
      + encodeURIComponent(JSON.stringify([{
          id: 101,
          source: { type: 'mapLayer', mapLayerId: 0 },
          drawingInfo: { renderer: { type: 'simple', symbol: { type: 'esriSLS', style: 'esriSLSShortDash', color: [139, 171, 208, 255], width: 1.8 } }, showLabels: false },
        }])),
    attribution: 'USFS',
    sourceMinzoom: 8,
    sourceMaxzoom: 15,
    zoomOpacity: [
      [6,  0.0],
      [8,  0.6],
      [11, 0.95],
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
        key: 'coarse',
        tileUrl: 'https://carto.nationalmap.gov/arcgis/rest/services/contours/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&dpi=96&transparent=true&format=png32&f=image&layers=show:10,11',
        sourceMinzoom: 10,
        sourceMaxzoom: 14,
        zoomOpacity: [[9.5, 0.0], [10.5, 0.65], [12.4, 0.65], [12.9, 0.0]],
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

export const DEFAULT_OVERLAYS = {
  'mvum': true,
  'usfs-trails': true,
  'sites': true,
  'names': false,
  'blm-land': false,
  'contours': false,
}

export const DEFAULT_BASE = 'boondock'
export const DEFAULT_CENTER = [-121.88, 47.95]  // Monroe, WA area
export const DEFAULT_ZOOM = 12
