import 'maplibre-gl/dist/maplibre-gl.css'
import { requestPersistentStorage } from './boondock-web'  // installs window.boondock before App reads it
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../../boondock/src/renderer/App'
import '../../boondock/src/renderer/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Waypoints and tracks live in IndexedDB here, which browsers may evict.
// Asking once on startup is what makes them durable (VISION row 114).
requestPersistentStorage()

// Offline app shell (map tiles still need network until Phase 2 packs)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
}
