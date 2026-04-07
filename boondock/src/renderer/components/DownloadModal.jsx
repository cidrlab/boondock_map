import { useState, useEffect } from 'react'
import { BASE_LAYERS } from '../../shared/layers'
import { Download, Box } from './Icons'
import './DownloadModal.css'

function estimateTileCount(bbox, minZ, maxZ) {
  if (!bbox) return 0
  let total = 0
  function lonLatToTile(lon, lat, zoom) {
    const n = Math.pow(2, zoom)
    const x = Math.floor(((lon + 180) / 360) * n)
    const latRad = (lat * Math.PI) / 180
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
    return { x, y }
  }
  for (let z = minZ; z <= maxZ; z++) {
    const tl = lonLatToTile(bbox[0], bbox[3], z)
    const br = lonLatToTile(bbox[2], bbox[1], z)
    total += (br.x - tl.x + 1) * (br.y - tl.y + 1)
  }
  return total
}

export default function DownloadModal({ bbox, onClose, onStartDownload }) {
  const [name, setName] = useState(`Region ${new Date().toLocaleDateString()}`)
  const [minZoom, setMinZoom] = useState(8)
  const [maxZoom, setMaxZoom] = useState(14)
  const [selectedLayer, setSelectedLayer] = useState('usgs-topo')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState(null)

  const tileCount = estimateTileCount(bbox, minZoom, maxZoom)
  const estMB = Math.round(tileCount * 0.015)

  useEffect(() => {
    if (!window.boondock) return
    window.boondock.onTileProgress((p) => setProgress(p))
  }, [])

  const startDownload = async () => {
    if (!bbox || !window.boondock) return
    const layer = BASE_LAYERS[selectedLayer]
    if (!layer?.tileUrl) { alert('This layer does not support tile download'); return }
    setDownloading(true)
    setProgress({ done: 0, total: tileCount, name })
    try {
      await window.boondock.downloadTiles({
        bbox, minZoom, maxZoom,
        name: name.replace(/[^a-z0-9_-]/gi, '_'),
        tileUrl: layer.tileUrl,
      })
    } catch (e) {
      console.error(e)
      alert('Download failed: ' + e.message)
    } finally {
      setDownloading(false)
      onStartDownload()
    }
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="modal-overlay" onClick={!downloading ? onClose : undefined}>
      <div className="dl-modal" onClick={e => e.stopPropagation()}>
        <div className="dl-modal-header">
          <Download size={18} color="var(--accent)" />
          <h3>Download Offline Tiles</h3>
        </div>

        {bbox && (
          <div className="dl-bbox">
            <Box size={13} />
            <span>{bbox[0].toFixed(3)}, {bbox[1].toFixed(3)} → {bbox[2].toFixed(3)}, {bbox[3].toFixed(3)}</span>
          </div>
        )}

        <label className="dl-label">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} disabled={downloading} />

        <label className="dl-label">Layer</label>
        <select value={selectedLayer} onChange={e => setSelectedLayer(e.target.value)} disabled={downloading}>
          {Object.values(BASE_LAYERS).filter(l => l.tileUrl && !l.layers).map(l => (
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
            <div className="dl-progress-text">{progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pct}%)</div>
          </div>
        )}

        <div className="dl-actions">
          {!downloading ? (
            <>
              <button className="btn-primary" onClick={startDownload} disabled={!bbox || tileCount === 0}>
                <Download size={15} /> Download
              </button>
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
            </>
          ) : (
            <div className="dl-downloading">Downloading… do not close</div>
          )}
        </div>
      </div>
    </div>
  )
}
