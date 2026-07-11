# Boondock Map — Brand & Style Guide

**Collective Impact Data & Research Lab**
Version 1.0 | April 2026

---

## Overview

Boondock Map is an offline-capable topo map application built by the CiDR Lab for boondocking, hiking, and off-road exploration. The app follows CiDR Lab brand guidelines to maintain visual consistency across the lab's products and research tools.

This document defines the color palette, typography, iconography, and UI patterns used in the Boondock Map application. All styling decisions derive from the CiDR Lab master brand (see `BRAND.md` in the CiDR Lab library repository).

---

## Color Palette

The Boondock Map palette is derived directly from the CiDR Lab brand colors, adapted for a dark-theme map application. The three brand colors anchor the interface, with derived tints and opacities filling out the full dark UI system.

### Brand Colors

| Name | Hex | CiDR Role | Boondock Usage |
|---|---|---|---|
| Red | `#F9322B` | Primary accent, mark circle | `--accent`, buttons, record, active track, default waypoint pin |
| Dark Navy | `#19222C` | Headers, footers, dark backgrounds | `--bg-secondary`, toolbar, sidebar, glass overlays |
| Blue Navy | `#223754` | Body text, nav, secondary accent | `--bg-elevated`, layer cards, elevated surfaces |
| Cool Blue | `#e8eef4` | Light background tint | `--text-primary`, primary text color against dark navy |

### Dark Theme Background Ramp

The background ramp extends the brand navy into a smooth gradient for layered UI depth. Each step is derived from the CiDR dark and blue navies.

| CSS Variable | Hex | Usage |
|---|---|---|
| `--bg-primary` | `#10151c` | App background, deepest layer |
| `--bg-secondary` | `#19222C` | Toolbar, sidebar, modals (CiDR dark navy) |
| `--bg-tertiary` | `#1e2a38` | Input fields, nested containers |
| `--bg-elevated` | `#223754` | Layer cards, elevated surfaces (CiDR blue navy) |
| `--bg-hover` | `#2a4060` | Hover states on interactive elements |
| `--bg-active` | `#324a6a` | Active/pressed states |

### Accent Opacity Scale

| CSS Variable | Value | Usage |
|---|---|---|
| `--accent` | `#F9322B` | Full accent (buttons, active states) |
| `--accent-hover` | `#ff4f48` | Hover state on accent elements |
| `--accent-dim` | `rgba(249,50,43,0.12)` | Tinted backgrounds (recording pill, toggle bg) |
| `--accent-muted` | `rgba(249,50,43,0.25)` | Borders on accent-colored elements |

### Text Colors

| CSS Variable | Value | Usage |
|---|---|---|
| `--text-primary` | `#e8eef4` | Primary text (CiDR cool blue tint) |
| `--text-secondary` | `rgba(232,238,244,0.58)` | Labels, descriptions |
| `--text-muted` | `rgba(232,238,244,0.34)` | Placeholders, disabled text |

---

## Typography

The app uses the system font stack for UI elements to ensure native feel and crisp rendering at small sizes. The CiDR Lab brand font **DM Sans** is reserved for splash/about screens and print materials.

| Context | Size | Font |
|---|---|---|
| Brand wordmark | 14px / 600 | System stack (`-apple-system`, `BlinkMacSystemFont`) |
| UI labels & inputs | 13px / 400–500 | System stack |
| Sidebar headings | 12px / 600 | System stack, uppercase tracking |
| Status bar | 11px / 400 | System stack, monospace for coordinates |
| Map popups | 13px / 400 | System stack |

---

## Iconography

All icons are custom SVG monoline icons defined in `Icons.jsx`. The icon library follows Lucide/Feather conventions: 24×24 viewBox, 1.5px stroke, round caps and joins, no fill. Icons accept `size`, `color`, and `className` props. The library contains 40+ icons covering navigation, location, layers, waypoints, actions, and tracking.

### Waypoint Pin Colors

| Type | Hex | Icon Component | Notes |
|---|---|---|---|
| Generic | `#F9322B` | `MapPin` | CiDR red — default pin |
| Camp | `#22c55e` | `Tent` | Green — campsite |
| Water | `#38bdf8` | `Droplet` | Sky blue — water source |
| Hazard | `#fbbf24` | `AlertTriangle` | Amber warning |
| Trailhead | `#f59e0b` | `Footprints` | Warm amber |
| Viewpoint | `#a78bfa` | `Camera` | Soft purple |
| Fuel | `#fb923c` | `Fuel` | Orange |
| Parking | `#e8eef4` | `ParkingCircle` | CiDR cool blue tint |

---

## UI Patterns

### Glass Effect

Map controls, popups, and overlays use a translucent glass effect: `rgba(25, 34, 44, 0.90)` background with `backdrop-filter: blur(16px)`. This keeps map content partially visible while maintaining legibility of UI controls.

### Border Radii

Three radius tokens are used consistently: `--radius: 10px` for cards and modals, `--radius-sm: 6px` for buttons and inputs, and `--radius-xs: 4px` for small toggles and chips. Recording pills use a full `100px` radius.

### Button System

| Variant | Background | Text | Use Case |
|---|---|---|---|
| `btn-primary` | CiDR red (`--accent`) | White | Primary actions (save, confirm) |
| `btn-secondary` | Elevated navy (`--bg-elevated`) | Muted text | Secondary actions (cancel, keep recording) |
| `btn-ghost` | Transparent | Secondary text | Icon-only toolbar actions |
| `btn-danger` | Red-tinted | `--danger` | Destructive actions (delete, discard) |

The record button uses `--accent` (brand red) for its border, filled circle icon, and the recording pill indicator.

---

## Map Layers

Five base layers and six overlays are defined in `shared/layers.js`. The default base layer is USGS Topo (modern style). The default active overlays are Roads & Trails, Road Labels, and Hiking Trails.

Overlays use zoom-interpolated opacity expressions for progressive disclosure at different zoom levels. The Road Labels overlay (ESRI World Boundaries and Places) adds text labels for road names, place names, and boundaries over any base layer — particularly useful on satellite and shaded relief views where road names aren't built in. The Hybrid base layer automatically stacks this labels layer in addition to the transportation reference.

---

## File Reference

Key files controlling visual style:

| File | Controls |
|---|---|
| `styles/global.css` | CSS custom properties (all colors, radii, shadows) |
| `styles/app.css` | Layout, MapLibre overrides, button system, modals |
| `components/Icons.jsx` | SVG icon library, waypoint color + icon maps |
| `components/Toolbar.css` | Toolbar, record/stop button, brand wordmark |
| `components/Sidebar.css` | Search, layer picker, waypoint list, toggles |
| `components/Map.jsx` | Marker SVG rendering, track colors, bbox draw |
| `shared/layers.js` | Tile URLs, overlay opacity curves, default center |
