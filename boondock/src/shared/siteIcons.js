/**
 * Site badges — the logo every spot in the sites database wears.
 *
 * A site used to be a flat coloured dot: colour was the only thing telling a
 * campsite from a water fill, which the night-red theme erases entirely and
 * colour-blind eyes never had. Each spot now draws as a dark disc ringed in
 * its kind's colour with the kind's logo inside, so shape carries the meaning
 * and colour only reinforces it.
 *
 * This module is the single source of truth for those glyphs. The map paints
 * them into MapLibre images (`Map.jsx`), the Legend renders them as inline SVG
 * (`Legend.jsx`) — same path data both places, so the two can't drift.
 *
 * Glyphs are plain SVG path strings on the 24×24 grid the rest of the icon set
 * uses (`Icons.jsx`), drawn monoline. Paths only — no <rect>/<circle>/<line>
 * — so the map can stroke them straight onto a canvas with Path2D, which keeps
 * badge building synchronous. (Decoding an SVG image instead would defer the
 * layer adds past the rest of the load sequence and quietly restack the map.)
 * The stroke is heavier than Icons.jsx's 1.5 because these land at roughly
 * 9–13 px on the map, where a hairline vanishes.
 */

import { SITE_KINDS } from './layers'

export const SITE_GLYPH_PATHS = {
  campsite: [
    'M3 22l9-16 9 16H3z',
    'M12 6v16',
  ],
  rv_park: [
    'M4 6h16a2 2 0 0 1 2 2v7H2V8a2 2 0 0 1 2-2z',   // body
    'M5.5 9h4.5v3.5H5.5z',                            // window
    'M5.7 17.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0',
    'M14.7 17.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0',
  ],
  dump: [
    'M12 3v9',
    'M8 8l4 4 4-4',
    'M5 15h14v3a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
  ],
  water: [
    'M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z',
  ],
  trailhead: [
    'M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5 10 7.89 8 10 8 12v4',
    'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6-1.87 0-2.5 1.8-2.5 3.5 0 2.39 2 4.5 2 6.5v4',
  ],
}

// A spot whose kind we have no logo for still gets a badge, not nothing
export const SITE_FALLBACK_KIND = 'other'
const FALLBACK_PATHS = ['M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8']
const FALLBACK_COLOR = '#e8eef4'    // CiDR cool blue tint

const COLOR_BY_KIND = Object.fromEntries(SITE_KINDS.map(k => [k.id, k.color]))

export const SITE_BADGE_KINDS = [...SITE_KINDS.map(k => k.id), SITE_FALLBACK_KIND]

export const siteGlyphPaths = (kind) => SITE_GLYPH_PATHS[kind] || FALLBACK_PATHS
export const siteColor = (kind) => COLOR_BY_KIND[kind] || FALLBACK_COLOR

const STROKE = 2.3                           // monoline weight on the 24-unit grid
const DISC_FILL = 'rgba(16, 21, 28, 0.92)'   // the map's dark navy, so the logo reads
const GLYPH_IN_DISC = 0.54                   // glyph box as a fraction of the badge

/**
 * Paint a kind's logo onto a canvas at `px` square. What the map turns into a
 * MapLibre image — the ring and disc there come from the circle layer beneath,
 * so they stay vector-crisp and keep growing with zoom.
 */
export function drawSiteGlyph(ctx, kind, px, color = siteColor(kind)) {
  const scale = px / 24
  ctx.save()
  ctx.scale(scale, scale)
  ctx.strokeStyle = color
  ctx.lineWidth = STROKE
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of siteGlyphPaths(kind)) ctx.stroke(new Path2D(d))
  ctx.restore()
}

/**
 * The whole badge as SVG markup — ringed disc with the logo inside. For places
 * with no circle layer under them to draw the ring: the legend, and anywhere
 * else the map's symbology needs showing in the UI.
 */
export function siteBadgeSvg(kind, px, { ring = siteColor(kind) } = {}) {
  const g = GLYPH_IN_DISC
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="10.4" fill="${DISC_FILL}" stroke="${ring}" stroke-width="2.2"/>` +
    `<g transform="translate(12 12) scale(${g}) translate(-12 -12)" fill="none" ` +
    `stroke="${siteColor(kind)}" stroke-width="${(STROKE / g).toFixed(2)}" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    siteGlyphPaths(kind).map(d => `<path d="${d}"/>`).join('') +
    `</g></svg>`
}
