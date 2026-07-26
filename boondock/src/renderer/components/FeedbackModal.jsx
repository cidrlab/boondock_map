import { useEffect, useRef, useState } from 'react'
import { FEEDBACK_KINDS, MAX_FEEDBACK_CHARS, submitFeedback } from '../../shared/feedback'

import './WaypointModal.css'

// Feedback dialog (VISION row 66). Same dialog bones as ReportSpotModal, but
// this one ends up as a GitHub issue rather than a map pin. No account, and
// contact is optional — leaving it blank is a supported way to use this.

export default function FeedbackModal({ onClose }) {
  const [kind, setKind] = useState('bug')
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const tooShort = message.trim().length < 10

  const handleSubmit = async () => {
    if (tooShort || busy || done) return
    setBusy(true)
    setError(null)
    try {
      const res = await submitFeedback({
        kind,
        message: message.trim(),
        contact: contact.trim(),
      })
      setDone({ held: res.held })
    } catch (e) {
      setError(e.message || 'Could not send feedback')
    } finally {
      setBusy(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() }
  }

  const active = FEEDBACK_KINDS.find(k => k.id === kind)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="wp-modal" onClick={e => e.stopPropagation()}>
        <div className="wp-modal-header">
          <h3>Send feedback</h3>
        </div>

        {done ? (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: '4px 0 14px' }}>
              {done.held
                ? 'Thanks — this one needs a quick look before it goes through, so it may take a few days to land.'
                : 'Thanks — this goes into the tracker on the next nightly run. If you left a contact we may follow up; otherwise it still gets read.'}
            </p>
            <div className="wp-modal-actions">
              <button className="btn-primary" onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 10px' }}>
              Tell us what&apos;s broken or what you wish this did. No account
              needed — it becomes a tracked issue either way.
            </p>

            <div className="wp-modal-icons">
              {FEEDBACK_KINDS.map(k => (
                <button
                  key={k.id}
                  className={`wp-icon-btn ${kind === k.id ? 'active' : ''}`}
                  onClick={() => setKind(k.id)}
                  title={k.hint}
                  style={{ flex: '1 0 46%' }}
                >
                  <span>{k.label}</span>
                </button>
              ))}
            </div>

            <textarea
              ref={inputRef}
              placeholder={
                kind === 'bug'
                  ? 'What did you do, and what happened instead?'
                  : kind === 'data'
                    ? 'Which place, and what is wrong about it? Coordinates help.'
                    : 'What would you like?'
              }
              value={message}
              maxLength={MAX_FEEDBACK_CHARS}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKey}
              rows={5}
            />

            <input
              placeholder="Email, if you want a reply (optional)"
              value={contact}
              maxLength={120}
              onChange={e => setContact(e.target.value)}
              onKeyDown={handleKey}
              style={{ marginTop: 8 }}
            />

            {error && (
              <div style={{ fontSize: 12, color: 'var(--danger)', margin: '8px 0 0' }}>{error}</div>
            )}

            <div className="wp-modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={handleSubmit} disabled={tooShort || busy}>
                {busy ? 'Sending…' : 'Send feedback'}
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </div>

            <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5, margin: '10px 0 0' }}>
              {active?.hint ? `${active.hint}. ` : ''}
              Sent anonymously. Your message becomes a public issue in the
              project tracker, so don&apos;t include anything private — a
              contact address, if you give one, is only shared there too.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
