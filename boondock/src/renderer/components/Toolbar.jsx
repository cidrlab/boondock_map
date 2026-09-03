import { useState } from 'react'
import { Menu, Circle, Square, Download, FolderOpen, Share, Cloud, Compass, BookOpen, HelpCircle, MessageSquare, Sun, Crosshair } from './Icons'
import './Toolbar.css'

export default function Toolbar({
  isRecordingTrack, onStartTrack, onStopTrack,
  onExportGPX, onImportGPX, onToggleSidebar,
  onToggleDownloadMode, downloadMode, onOpenSyncFolder,
  helpPanel, onToggleHelp, onFeedback, feedbackEnabled, onSunPath, onSight,
}) {
  const [trackName, setTrackName] = useState('')
  const [showStopModal, setShowStopModal] = useState(false)

  const handleStopTrack = () => {
    onStopTrack(trackName || undefined)
    setTrackName('')
    setShowStopModal(false)
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button className="toolbar-brand" onClick={onToggleSidebar} title="Toggle sidebar">
          <Compass size={18} />
          <span className="brand-text">Boondock</span>
        </button>
      </div>

      <div className="toolbar-center">
        {!isRecordingTrack ? (
          <button className="tb-btn record-btn" onClick={onStartTrack} title="Record a track">
            <Circle size={14} />
            <span>Record</span>
          </button>
        ) : (
          <>
            <div className="recording-pill">
              <span className="rec-dot" />
              <span>Recording</span>
            </div>
            <button className="tb-btn stop-btn" onClick={() => setShowStopModal(true)} title="Stop recording">
              <Square size={12} />
              <span>Stop</span>
            </button>
          </>
        )}
      </div>

      <div className="toolbar-right">
        <button className="tb-icon-btn" onClick={onSight} title="Sight a point — aim the camera at a road or feature you can see, and mark where it is">
          <Crosshair size={16} />
        </button>
        <button className="tb-icon-btn" onClick={onSunPath} title="Sun path — where the sun tracks from a spot">
          <Sun size={16} />
        </button>
        <button className={`tb-icon-btn ${helpPanel === 'guide' ? 'active' : ''}`} onClick={() => onToggleHelp?.('guide')} title="How to use Boondock Map">
          <BookOpen size={16} />
        </button>
        <button className={`tb-icon-btn ${helpPanel === 'legend' ? 'active' : ''}`} onClick={() => onToggleHelp?.('legend')} title="Map legend">
          <HelpCircle size={16} />
        </button>
        {feedbackEnabled && (
          <button className="tb-icon-btn" onClick={onFeedback} title="Send feedback">
            <MessageSquare size={16} />
          </button>
        )}
        <div className="toolbar-divider" />
        <button className={`tb-icon-btn tb-draw-download ${downloadMode ? 'active' : ''}`} onClick={onToggleDownloadMode} title="Download offline tiles">
          <Download size={16} />
        </button>
        <button className="tb-icon-btn" onClick={onImportGPX} title="Import GPX">
          <FolderOpen size={16} />
        </button>
        <button className="tb-icon-btn" onClick={onExportGPX} title="Export GPX">
          <Share size={16} />
        </button>
        <div className="toolbar-divider tb-sync" />
        <button className="tb-icon-btn tb-sync" onClick={onOpenSyncFolder} title="Open iCloud sync folder">
          <Cloud size={16} />
        </button>
      </div>

      {showStopModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowStopModal(false) }}>
          <div className="stop-modal">
            <h3>Save Track</h3>
            <input
              placeholder="Track name (optional)"
              value={trackName}
              onChange={e => setTrackName(e.target.value)}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleStopTrack()}
            />
            <div className="stop-modal-actions">
              <button className="btn-primary" onClick={handleStopTrack}>Save</button>
              <button className="btn-danger" onClick={() => { onStopTrack(''); setShowStopModal(false) }}>Discard</button>
              <button className="btn-secondary" onClick={() => setShowStopModal(false)}>Keep Recording</button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
