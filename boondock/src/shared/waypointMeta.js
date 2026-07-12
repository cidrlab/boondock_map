/**
 * Waypoint visit-status + rating vocabulary, shared by the save modal,
 * sidebar editor, map markers, popups, and legend.
 *
 * status:   'been' | 'been-nc' | 'explore' | undefined (not sure)
 * favorite: boolean — renders the status badge as a star
 * labels:   string[] — user-defined quick checkmarks ("view", "near water")
 * ratings:  { quiet?, clean?, access? } — 1..5 stars
 */

export const WP_STATUS_META = {
  'been':    { color: '#22c55e', label: 'Been & stayed' },
  'been-nc': { color: '#fb923c', label: 'Been, not camped' },
  'explore': { color: '#F9322B', label: 'Want to explore' },
}

// Favorite with no status still earns a star — neutral cool blue
export const WP_FAVORITE_NEUTRAL = '#e8eef4'

export const WP_STATUS_OPTIONS = [
  { id: 'been',    label: 'Been & stayed' },
  { id: 'been-nc', label: 'Been, not camped' },
  { id: 'unknown', label: 'Not sure' },
  { id: 'explore', label: 'Explore' },
]

export const WP_RATING_KEYS = [
  { id: 'quiet',  label: 'Quiet' },
  { id: 'clean',  label: 'Cleanliness' },
  { id: 'access', label: 'Accessibility' },
]

export function statusBadgeColor(wp) {
  if (wp.status && WP_STATUS_META[wp.status]) return WP_STATUS_META[wp.status].color
  return wp.favorite ? WP_FAVORITE_NEUTRAL : null
}

// Waypoint filter: { status: id|null, favorite: bool, labels: string[] }
export function matchesWpFilter(wp, f) {
  if (!f) return true
  if (f.favorite && !wp.favorite) return false
  if (f.status && wp.status !== f.status) return false
  if (f.labels?.length && !f.labels.every(l => (wp.labels || []).includes(l))) return false
  return true
}
