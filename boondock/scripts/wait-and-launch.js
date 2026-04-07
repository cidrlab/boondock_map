#!/usr/bin/env node
// Waits for Vite dev server, then launches Electron
// Replaces the 'wait-on' CLI dep — no extra install needed

const http = require('http')
const { spawn } = require('child_process')

const PORT = 5173
const MAX_WAIT_MS = 30000
const POLL_MS = 300

function check() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${PORT}`, (res) => {
      resolve(res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(500, () => { req.destroy(); resolve(false) })
  })
}

async function waitForVite() {
  const start = Date.now()
  while (Date.now() - start < MAX_WAIT_MS) {
    if (await check()) return true
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  return false
}

waitForVite().then((ready) => {
  if (!ready) {
    console.error('[electron] Vite did not start in time')
    process.exit(1)
  }
  const env = { ...process.env, VITE_DEV_SERVER_URL: `http://localhost:${PORT}` }
  const child = spawn('electron', ['.'], { stdio: 'inherit', env, shell: true })
  child.on('exit', (code) => process.exit(code ?? 0))
})
