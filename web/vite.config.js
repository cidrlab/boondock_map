import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Shared components under ../boondock/src import react/maplibre by name.
// Pin those to web's node_modules so resolution works without boondock's
// install (CI) and never loads two copies (local).
const dep = (name) => path.resolve(__dirname, 'node_modules', name)

export default defineConfig({
  // Served at cidrlab.org/boondock_map/ (GitHub Pages project site)
  base: '/boondock_map/',
  plugins: [react()],
  resolve: {
    alias: {
      'maplibre-gl': dep('maplibre-gl'),
      'react-dom': dep('react-dom'),
      react: dep('react'),
    },
  },
  server: {
    // Dev server must read shared source outside web/ (../boondock/src)
    fs: { allow: ['..'] },
  },
})
