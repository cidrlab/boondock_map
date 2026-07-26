/**
 * In-app feedback (VISION row 66).
 *
 * Anyone can report a bug or ask for something without a GitHub account: the
 * message goes to the same Worker the community reports use, and a nightly
 * GitHub Action opens the issue with the repo's own token. Nothing here
 * knows about GitHub.
 *
 * Shares COMMUNITY_API with shared/community.js, so deploying the Worker
 * once turns on both features.
 */

import { COMMUNITY_API, communityEnabled } from './community'

export const FEEDBACK_KINDS = [
  { id: 'bug', label: 'Something is broken', hint: 'A button, a layer, a crash, wrong behaviour' },
  { id: 'idea', label: 'Idea or request', hint: 'Something you wish the app did' },
  { id: 'data', label: 'Map data is wrong', hint: 'A site, road, or zone that does not match reality' },
  { id: 'other', label: 'Something else', hint: '' },
]

export const feedbackEnabled = communityEnabled

export const MAX_FEEDBACK_CHARS = 2000

export async function submitFeedback({ kind, message, contact }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(`${COMMUNITY_API}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message, contact }),
      signal: ctrl.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Could not send feedback (${res.status})`)
    return data
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('No connection to the feedback service')
    throw e
  } finally {
    clearTimeout(timer)
  }
}
