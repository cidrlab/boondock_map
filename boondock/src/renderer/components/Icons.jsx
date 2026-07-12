/**
 * Boondock Map — SVG Icon Library
 * Clean monoline icons (20x20 default). All icons accept size, color, className props.
 * Inspired by Lucide/Feather but purpose-built for map navigation.
 */

const defaults = { size: 20, color: 'currentColor', strokeWidth: 1.5 }

function I({ size = defaults.size, color = defaults.color, sw = defaults.strokeWidth, d, children, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {d ? <path d={d} /> : children}
    </svg>
  )
}

// ── Navigation & UI ──────────────────────────────────────────────────────
export const Menu = (p) => <I {...p}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></I>
export const X = (p) => <I {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></I>
export const Search = (p) => <I {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></I>
export const ChevronDown = (p) => <I {...p} d="M6 9l6 6 6-6" />
export const ChevronRight = (p) => <I {...p} d="M9 18l6-6-6-6" />
export const Settings = (p) => <I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></I>

// ── Map & Location ───────────────────────────────────────────────────────
export const MapPin = (p) => <I {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></I>
export const MapPinPlus = (p) => <I {...p}><path d="M19.43 12.98c.04-.32.07-.64.07-.98 0-4.42-3.58-8-8-8s-8 3.58-8 8c0 5.25 8 13 8 13"/><circle cx="11.5" cy="10" r="3"/><line x1="19" y1="15" x2="19" y2="21"/><line x1="16" y1="18" x2="22" y2="18"/></I>
export const Navigation = (p) => <I {...p} d="M3 11l19-9-9 19-2-8-8-2z" />
export const Compass = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></I>
export const Crosshair = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></I>
export const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></I>

// ── Layers & Map Types ───────────────────────────────────────────────────
export const Layers = (p) => <I {...p}><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></I>
export const Map = (p) => <I {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></I>
export const Mountain = (p) => <I {...p} d="M8 3l4 8 5-5 7 14H0L8 3z" />
export const Satellite = (p) => <I {...p}><path d="M13 7L9 3 3 9l4 4"/><path d="m17 11 4 4-6 6-4-4"/><line x1="8" y1="12" x2="12" y2="16"/><line x1="4.9" y1="19.1" x2="2" y2="22"/><circle cx="12" cy="12" r="2"/></I>
export const Image = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></I>

// ── Waypoint Types ───────────────────────────────────────────────────────
export const Tent = (p) => <I {...p}><path d="M3 22l9-16 9 16H3z"/><path d="M12 6v16"/></I>
export const Droplet = (p) => <I {...p} d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
export const AlertTriangle = (p) => <I {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></I>
export const Footprints = (p) => <I {...p}><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5 10 7.89 8 10 8 12v4"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6-1.87 0-2.5 1.8-2.5 3.5 0 2.39 2 4.5 2 6.5v4"/></I>
export const Camera = (p) => <I {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></I>
export const Fuel = (p) => <I {...p}><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17"/><path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 4"/><line x1="3" y1="22" x2="15" y2="22"/><line x1="6" y1="9" x2="12" y2="9"/></I>
export const ParkingCircle = (p) => <I {...p}><circle cx="12" cy="12" r="10"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/></I>

// ── Actions ──────────────────────────────────────────────────────────────
export const Play = (p) => <I {...p}><polygon points="5 3 19 12 5 21 5 3"/></I>
export const Square = (p) => <I {...p}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></I>
export const Circle = (p) => <I {...p}><circle cx="12" cy="12" r="10"/></I>
export const Download = (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></I>
export const Upload = (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></I>
export const FolderOpen = (p) => <I {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></I>
export const Share = (p) => <I {...p}><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></I>
export const Cloud = (p) => <I {...p}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></I>
export const Edit3 = (p) => <I {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></I>
export const Trash2 = (p) => <I {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></I>

// ── Data / Tracks ────────────────────────────────────────────────────────
export const Route = (p) => <I {...p}><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></I>
export const Activity = (p) => <I {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />

// ── Misc ─────────────────────────────────────────────────────────────────
export const TreePine = (p) => <I {...p}><path d="M12 2L7 10h2l-3 8h3l-2 4h14l-2-4h3l-3-8h2L12 2z"/></I>
export const Waves = (p) => <I {...p}><path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/></I>
export const Loader = (p) => <I {...p}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></I>
export const Box = (p) => <I {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></I>
export const Eye = (p) => <I {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></I>
export const EyeOff = (p) => <I {...p}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></I>
export const Maximize = (p) => <I {...p}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></I>

// ── Waypoint icon mapping (replaces emoji map) ──────────────────────────
export const WAYPOINT_ICON_COMPONENTS = {
  generic:   MapPin,
  camp:      Tent,
  water:     Droplet,
  hazard:    AlertTriangle,
  trailhead: Footprints,
  viewpoint: Camera,
  fuel:      Fuel,
  parking:   ParkingCircle,
}

export const WAYPOINT_COLORS = {
  generic:   '#F9322B',    /* CiDR red */
  camp:      '#22c55e',
  water:     '#38bdf8',
  hazard:    '#fbbf24',
  trailhead: '#f472b6',
  viewpoint: '#a78bfa',
  fuel:      '#fb923c',
  parking:   '#e8eef4',    /* CiDR cool blue tint */
}
