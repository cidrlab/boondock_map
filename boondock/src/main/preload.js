const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('boondock', {
  // Waypoints
  loadWaypoints: () => ipcRenderer.invoke('waypoints:load'),
  saveWaypoints: (wps) => ipcRenderer.invoke('waypoints:save', wps),
  getSyncPath: () => ipcRenderer.invoke('waypoints:sync-path'),
  onRemoteWaypointUpdate: (cb) => {
    ipcRenderer.on('waypoints:remote-update', (_, data) => cb(data))
  },

  // Tracks
  loadTracks: () => ipcRenderer.invoke('tracks:load'),
  saveTracks: (tracks) => ipcRenderer.invoke('tracks:save', tracks),

  // Offline tiles
  listTilePacks: () => ipcRenderer.invoke('tiles:list'),
  getTilesDir: () => ipcRenderer.invoke('tiles:dir'),
  downloadTiles: (opts) => ipcRenderer.invoke('tiles:download', opts),
  onTileProgress: (cb) => {
    ipcRenderer.on('tiles:progress', (_, data) => cb(data))
  },

  // Import / Export
  exportGPX: (data) => ipcRenderer.invoke('export:gpx', data),
  importGPX: () => ipcRenderer.invoke('import:gpx'),

  // Preferences (viewport, base layer, overlays)
  loadPrefs: () => ipcRenderer.invoke('prefs:load'),
  savePrefs: (prefs) => ipcRenderer.invoke('prefs:save', prefs),

  // Search history
  loadSearchHistory: () => ipcRenderer.invoke('search-history:load'),
  saveSearchHistory: (history) => ipcRenderer.invoke('search-history:save', history),

  // Utilities
  openSyncFolder: () => ipcRenderer.invoke('util:open-sync-folder'),
})
