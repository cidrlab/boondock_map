const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ─── iCloud sync path ───────────────────────────────────────────────────────
// Points save here → iCloud syncs to iPhone automatically
const ICLOUD_DOCS = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs'
)
const SYNC_DIR = path.join(ICLOUD_DOCS, 'BoondockMap')
const WAYPOINTS_FILE = path.join(SYNC_DIR, 'waypoints.json')
const TRACKS_FILE    = path.join(SYNC_DIR, 'tracks.json')
const PREFS_FILE     = path.join(SYNC_DIR, 'preferences.json')
const HISTORY_FILE   = path.join(SYNC_DIR, 'search-history.json')

function ensureSyncDir() {
  if (!fs.existsSync(SYNC_DIR)) {
    fs.mkdirSync(SYNC_DIR, { recursive: true })
  }
  if (!fs.existsSync(WAYPOINTS_FILE)) {
    fs.writeFileSync(WAYPOINTS_FILE, JSON.stringify([], null, 2))
  }
  if (!fs.existsSync(TRACKS_FILE)) {
    fs.writeFileSync(TRACKS_FILE, JSON.stringify([], null, 2))
  }
}

// ─── Offline tiles path ──────────────────────────────────────────────────────
const TILES_DIR = path.join(os.homedir(), 'Library/Application Support/BoondockMap/tiles')

function ensureTilesDir() {
  if (!fs.existsSync(TILES_DIR)) {
    fs.mkdirSync(TILES_DIR, { recursive: true })
  }
}

// ─── Window setup ────────────────────────────────────────────────────────────
let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // needed for loading local tile files
    },
  })

  const isDev = !app.isPackaged
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  ensureSyncDir()
  ensureTilesDir()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC: Waypoints ──────────────────────────────────────────────────────────
ipcMain.handle('waypoints:load', () => {
  try {
    const raw = fs.readFileSync(WAYPOINTS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
})

ipcMain.handle('waypoints:save', (_, waypoints) => {
  fs.writeFileSync(WAYPOINTS_FILE, JSON.stringify(waypoints, null, 2))
  return { ok: true }
})

ipcMain.handle('waypoints:sync-path', () => WAYPOINTS_FILE)

// Watch iCloud file for changes (phone saves a point → desktop updates live)
let waypointWatcher = null
function startWaypointWatcher() {
  if (waypointWatcher) waypointWatcher.close()
  waypointWatcher = fs.watch(WAYPOINTS_FILE, () => {
    setTimeout(() => {
      try {
        const raw = fs.readFileSync(WAYPOINTS_FILE, 'utf8')
        const waypoints = JSON.parse(raw)
        mainWindow?.webContents.send('waypoints:remote-update', waypoints)
      } catch {}
    }, 200) // small debounce for iCloud write completion
  })
}

app.whenReady().then(() => {
  setTimeout(startWaypointWatcher, 1000)
})

// ─── IPC: Tracks ─────────────────────────────────────────────────────────────
ipcMain.handle('tracks:load', () => {
  try {
    const raw = fs.readFileSync(TRACKS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
})

ipcMain.handle('tracks:save', (_, tracks) => {
  fs.writeFileSync(TRACKS_FILE, JSON.stringify(tracks, null, 2))
  return { ok: true }
})

// ─── IPC: Preferences (viewport, base layer, overlays) ─────────────────────
ipcMain.handle('prefs:load', () => {
  try {
    const raw = fs.readFileSync(PREFS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
})

ipcMain.handle('prefs:save', (_, prefs) => {
  fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2))
  return { ok: true }
})

// ─── IPC: Search history ────────────────────────────────────────────────────
const MAX_SEARCH_HISTORY = 50

ipcMain.handle('search-history:load', () => {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return []
  }
})

ipcMain.handle('search-history:save', (_, history) => {
  const trimmed = history.slice(0, MAX_SEARCH_HISTORY)
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2))
  return { ok: true }
})

// ─── IPC: Offline tiles ──────────────────────────────────────────────────────
ipcMain.handle('tiles:list', () => {
  try {
    return fs.readdirSync(TILES_DIR).filter(f => f.endsWith('.mbtiles'))
  } catch {
    return []
  }
})

ipcMain.handle('tiles:dir', () => TILES_DIR)

ipcMain.handle('tiles:download', async (_, { bbox, minZoom, maxZoom, name, tileUrl }) => {
  const https = require('https')
  const http = require('http')

  // Calculate tiles to download
  function lonLatToTile(lon, lat, zoom) {
    const n = Math.pow(2, zoom)
    const x = Math.floor(((lon + 180) / 360) * n)
    const latRad = (lat * Math.PI) / 180
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    )
    return { x, y, z: zoom }
  }

  const [minLon, minLat, maxLon, maxLat] = bbox
  let totalTiles = 0
  const tileList = []

  for (let z = minZoom; z <= maxZoom; z++) {
    const tl = lonLatToTile(minLon, maxLat, z)
    const br = lonLatToTile(maxLon, minLat, z)
    for (let x = tl.x; x <= br.x; x++) {
      for (let y = tl.y; y <= br.y; y++) {
        tileList.push({ z, x, y })
        totalTiles++
      }
    }
  }

  const outPath = path.join(TILES_DIR, `${name}.mbtiles`)

  // sql.js — pure WASM SQLite, no native compilation needed
  const initSqlJs = require('sql.js')
  const SQL = await initSqlJs()
  const db = new SQL.Database()

  db.run(`CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)`)
  db.run(`CREATE TABLE IF NOT EXISTS tiles (
    zoom_level INTEGER,
    tile_column INTEGER,
    tile_row INTEGER,
    tile_data BLOB,
    PRIMARY KEY (zoom_level, tile_column, tile_row)
  )`)
  db.run(`INSERT OR REPLACE INTO metadata VALUES ('name', ?)`, [name])
  db.run(`INSERT OR REPLACE INTO metadata VALUES ('format', 'png')`)
  db.run(`INSERT OR REPLACE INTO metadata VALUES ('minzoom', ?)`, [String(minZoom)])
  db.run(`INSERT OR REPLACE INTO metadata VALUES ('maxzoom', ?)`, [String(maxZoom)])
  db.run(`INSERT OR REPLACE INTO metadata VALUES ('bounds', ?)`, [bbox.join(',')])

  function fetchTile(url) {
    return new Promise((resolve) => {
      const client = url.startsWith('https') ? https : http
      client.get(url, { headers: { 'User-Agent': 'BoondockMap/1.0' } }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', () => resolve(null))
      }).on('error', () => resolve(null))
    })
  }

  let done = 0
  const CONCURRENCY = 4
  const queue = [...tileList]

  async function worker() {
    while (queue.length > 0) {
      const tile = queue.shift()
      if (!tile) break
      const url = tileUrl
        .replace('{z}', tile.z)
        .replace('{x}', tile.x)
        .replace('{y}', tile.y)
      const data = await fetchTile(url)
      if (data) {
        // MBTiles uses TMS y-axis (flip y)
        const tmsY = Math.pow(2, tile.z) - 1 - tile.y
        try {
          db.run('INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?)', [tile.z, tile.x, tmsY, data])
        } catch {}
      }
      done++
      if (done % 20 === 0) {
        mainWindow?.webContents.send('tiles:progress', {
          done, total: totalTiles, name,
        })
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, worker)
  await Promise.all(workers)

  // Write MBTiles file to disk
  const dbData = db.export()
  fs.writeFileSync(outPath, Buffer.from(dbData))
  db.close()

  mainWindow?.webContents.send('tiles:progress', { done: totalTiles, total: totalTiles, name, complete: true })
  return { ok: true, path: outPath, count: totalTiles }
})

// ─── IPC: Export GPX ─────────────────────────────────────────────────────────
ipcMain.handle('export:gpx', async (_, { waypoints, tracks }) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export GPX',
    defaultPath: path.join(os.homedir(), 'boondock-export.gpx'),
    filters: [{ name: 'GPX', extensions: ['gpx'] }],
  })
  if (!filePath) return { ok: false }

  const wptXml = waypoints.map(w => `
  <wpt lat="${w.lat}" lon="${w.lng}">
    ${w.elev_ft != null ? `<ele>${(w.elev_ft / 3.28084).toFixed(1)}</ele>` : ''}
    <name>${escapeXml(w.name)}</name>
    <desc>${escapeXml(w.notes || '')}</desc>
    <sym>${w.icon || 'Flag, Blue'}</sym>
    ${w.status ? `<type>${escapeXml(w.status)}</type>` : ''}
    <time>${w.createdAt}</time>
  </wpt>`).join('')

  const trkXml = tracks.map(t => `
  <trk>
    <name>${escapeXml(t.name)}</name>
    <trkseg>
      ${t.points.map(p => `<trkpt lat="${p.lat}" lon="${p.lng}"><ele>${p.ele || 0}</ele><time>${p.time || ''}</time></trkpt>`).join('\n      ')}
    </trkseg>
  </trk>`).join('')

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="BoondockMap" xmlns="http://www.topografix.com/GPX/1/1">
${wptXml}
${trkXml}
</gpx>`

  fs.writeFileSync(filePath, gpx, 'utf8')
  return { ok: true, filePath }
})

function escapeXml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── IPC: Import GPX ─────────────────────────────────────────────────────────
ipcMain.handle('import:gpx', async () => {
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import GPX',
    filters: [{ name: 'GPX', extensions: ['gpx'] }],
    properties: ['openFile', 'multiSelections'],
  })
  if (!filePaths.length) return { ok: false }
  const results = filePaths.map(fp => ({
    name: path.basename(fp),
    content: fs.readFileSync(fp, 'utf8'),
  }))
  return { ok: true, files: results }
})

// ─── IPC: Open sync folder in Finder ────────────────────────────────────────
ipcMain.handle('util:open-sync-folder', () => {
  shell.openPath(SYNC_DIR)
})
