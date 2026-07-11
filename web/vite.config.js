import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Served at cidrlab.org/boondock_map/ (GitHub Pages project site)
  base: '/boondock_map/',
  plugins: [react()],
  server: {
    // Dev server must read shared source outside web/ (../boondock/src)
    fs: { allow: ['..'] },
  },
})
