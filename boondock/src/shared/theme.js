/**
 * App theme — the chrome around the map (VISION rows 63/64).
 *
 * The map has had day and night basemaps since 2026-07-11, but the sidebar,
 * toolbar and popups stayed dark whichever one you picked. These themes are
 * pure CSS-variable swaps in styles/global.css, applied by setting
 * `data-theme` on <html>; nothing re-renders.
 *
 * `auto` is the default and resolves from the basemap, so choosing Boondock
 * Day lightens the whole app without a second setting to find.
 *
 * `red` is a night-vision mode: near-black backgrounds, red-band text, and a
 * filter over the map canvas so the map itself stops emitting blue and green
 * light. Dim red preserves dark adaptation — the same reason cockpits,
 * observatories and ship bridges use it.
 */

export const THEMES = [
  { id: 'auto',  label: 'Auto',      description: 'Follows the basemap — light with Boondock Day, dark otherwise' },
  { id: 'dark',  label: 'Dark',      description: 'The night interface, whatever the map is showing' },
  { id: 'light', label: 'Light',     description: 'Daylight interface — easier to read in full sun' },
  { id: 'red',   label: 'Night Red', description: 'Dim red for real darkness — keeps your night vision' },
]

export const THEME_IDS = THEMES.map(t => t.id)
export const DEFAULT_THEME = 'auto'

// Only the daylight basemap implies a light interface; satellite is mixed
// imagery and reads better with dark chrome, same as the night basemap.
export function resolveTheme(theme, baseLayer) {
  if (theme === 'auto') return baseLayer === 'boondock-day' ? 'light' : 'dark'
  return THEME_IDS.includes(theme) ? theme : 'dark'
}

export function applyTheme(theme, baseLayer) {
  const resolved = resolveTheme(theme, baseLayer)
  document.documentElement.dataset.theme = resolved
  return resolved
}
