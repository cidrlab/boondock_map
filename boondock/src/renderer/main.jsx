// Bundled, not fetched from a CDN (VISION row 118). index.html used to pull
// this stylesheet from unpkg on every launch, which made a third-party request
// the app has no functional need for, left the map controls unstyled with no
// network in an app whose whole point is working offline, and pinned 4.1.0
// against the 4.7.1 we actually run.
import 'maplibre-gl/dist/maplibre-gl.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
