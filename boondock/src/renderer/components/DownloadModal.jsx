import { useState, useRef } from 'react'
import { BASE_LAYERS } from '../../shared/layers'
import { downloadPack, tilesInBbox } from '../../shared/offlineTiles'
import { Download, Box, Crosshair } from './Icons'
import './DownloadModal.css'

const OFFLINE_LAYERS = Object.values(BASE_LAYERS).filter(l => l.offlineOk)

export default function DownloadModal({ bbox: bboxProp, getViewBbox, onClose, onStartDownload }) {
  const [bbox, setBbox] = useState(bboxProp)
  const [name, setName] = useState(`Region ${new Date().toLocaleDateString()}`)
  const [minZoom, setMinZoom] = useState(8)
  const [maxZoom, setMaxZoom] = useState(14)
  const [selectedLayer, setSelectedLayer] = useState(OFFLINE_LAYERS[0]?.id)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const abortRef = useRef(null)

  const tileCount = bbox ? tilesInBbox(bbox, minZoom, maxZoom).length : 0
  const estMB = Math.round(tileCount * 0.015)

  const startDownload = async () => {
    if (!bbox) return
    setDownloading(true)
    setResult(null)
    setProgress({ done: 0, total: tileCount, bytes: 0 })
    abortRef.current = new AbortController()
    try {
      const pack = await downloadPack(
        { name, layerId: selectedLayer, bbox, minZoom, maxZoom, signal: abortRef.current.signal },
        setProgress
      )
      setResult(pack)
      onStartDownload()
    } catch (e) {
      if (!e.canceled) alert('Download failed: ' + e.message)
      setProgress(null)
    } finally {
      setDownloading(false)
    }
  }

  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="modal-overlay" onClick={!downloading ? onClose : undefined}>
      <div className="dl-modal" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-header">
          <Download size={18} color="var(--accent)" />
          <h3>Download Offline Maps</h3>
        </div>

        {bbox ? (
          <div className="dl-bbox">
            <Box size={13} />
            <span>{bbox[0].toFixed(3)}, {bbox[1].toFixed(3)} → {bbox[2].toFixed(3)}, {bbox[3].toFixed(3)}</span>
          </div>
        ) : (
          <p className="dl-info">Pick the area to save: use the current map view, or close this and draw a box with the toolbar download tool.</p>
        )}

        {!downloading && getViewBbox && (
          <button className="btn-secondary full-width" style={{ marginBottom: 10 }} onClick={() => setBbox(getViewBbox())}>
            <Crosshair size={14} /> Use current map view
          </button>
        )}

        <label className="dl-label">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} disabled={downloading} />

        <label className="dl-label">Layer</label>
        <select value={selectedLayer} onChange={e => setSelectedLayer(e.target.value)} disabled={downloading}>
          {OFFLINE_LAYERS.map(l => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>

        <div className="dl-zoom-row">
          <div>
            <label className="dl-label">Min zoom</label>
            <input type="number" min={1} max={maxZoom} value={minZoom}
              onChange={e => setMinZoom(+e.target.value)} disabled={downloading} />
          </div>
          <div>
            <label className="dl-label">Max zoom</label>
            <input type="number" min={minZoom} max={16} value={maxZoom}
              onChange={e => setMaxZoom(+e.target.value)} disabled={downloading} />
          </div>
        </div>

        <div className="dl-estimate">
          <span>~{tileCount.toLocaleString()} tiles</span>
          <span>~{estMB} MB</span>
          {tileCount > 10000 && <span className="dl-warn">Large download</span>}
        </div>

        {downloading && progress && (
          <div className="dl-progress">
            <div className="dl-progress-bar">
              <div className="dl-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="dl-progress-text">
              {progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)
              {progress.bytes > 0 && ` · ${(progress.bytes / 1048576).toFixed(1)} MB`}
            </div>
          </div>
        )}

        {result && (
          <div className="dl-estimate">
            <span>Saved “{result.name}” — {result.count.toLocaleString()} tiles, {(result.bytes / 1048576).toFixed(1)} MB{result.failed ? ` (${result.failed} failed)` : ''}</span>
          </div>
        )}

        <div className="dl-actions">
          {!downloading ? (
            <>
              <button className="btn-primary" onClick={startDownload} disabled={!bbox || tileCount === 0}>
                <Download size={15} /> Download
              </button>
              <button className="btn-secondary" onClick={onClose}>Close</button>
            </>
          ) : (
            <button className="btn-danger" onClick={() => abortRef.current?.abort()}>Cancel download</button>
          )}
        </div>
      </div>
    </div>
  )
}
