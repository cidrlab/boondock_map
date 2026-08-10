/**
 * pmtilesCache — makes the self-hosted vector tilesets survive losing signal.
 *
 * The road and trail layers are single .pmtiles archives read by HTTP range
 * request. That is what makes them cheap online — you fetch the few KB your
 * screen needs, not a 49 MB file — and it is exactly why they used to vanish
 * offline: the browser Cache API refuses to store a 206 Partial Content
 * response ("Partial response (status code 206) is unsupported"), so the
 * service worker could never keep them (VISION rows 123/124).
 *
 * So we keep the bytes ourselves. Every range read is served from IndexedDB
 * when we already hold it and fetched-then-stored when we don't, which means
 * an area you have looked at once online is still there with no signal —
 * the same bargain the tile packs already make, without a separate download
 * step.
 *
 * Reads are aligned to fixed-size chunks so overlapping ranges can't turn the
 * store into a pile of near-duplicate slices: a request for bytes 100–200 and
 * one for 150–900 share the same chunk.
 *
 * Its own database, deliberately: `boondock-tiles` holds the user's
 * downloaded packs, and adding a store there would mean an upgrade migration
 * over data people cannot re-download in the field.
 */

import { FetchSource } from 'pmtiles'

const DB_NAME = 'boondock-pmtiles'
const CHUNKS = 'chunks'
const META = 'meta'
const CHUNK = 64 * 1024

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CHUNKS)
        req.result.createObjectStore(META)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function idb(store, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const out = fn(t.objectStore(store))
    t.oncomplete = () => resolve(out?.result ?? out)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

const chunkKey = (url, i) => `${url}#${i}`

/** Drop every chunk of one archive — used when upstream's etag moves. */
async function purge(url) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const t = db.transaction(CHUNKS, 'readwrite')
    const store = t.objectStore(CHUNKS)
    // Keys are `${url}#${i}`; '#' … '$' brackets exactly this archive's range
    const req = store.openKeyCursor(IDBKeyRange.bound(`${url}#`, `${url}$`, false, true))
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return
      store.delete(cur.key)
      cur.continue()
    }
    t.oncomplete = resolve
    t.onerror = () => reject(t.error)
  })
}

/**
 * A pmtiles Source that reads through IndexedDB.
 *
 * Falls back to the network for anything it does not hold, and stores what it
 * fetches. Offline with nothing cached, the underlying fetch rejects and the
 * layer simply doesn't draw — the same as any other missing tile.
 */
export class CachingSource {
  constructor(url) {
    this.url = url
    this.remote = new FetchSource(url)
  }

  getKey() {
    return this.url
  }

  async getBytes(offset, length, signal, etag) {
    const first = Math.floor(offset / CHUNK)
    const last = Math.floor((offset + length - 1) / CHUNK)

    const held = new Map()
    await idb(CHUNKS, 'readonly', (store) => {
      for (let i = first; i <= last; i++) {
        const r = store.get(chunkKey(this.url, i))
        r.onsuccess = () => { if (r.result) held.set(i, r.result) }
      }
    })

    const missing = []
    for (let i = first; i <= last; i++) if (!held.has(i)) missing.push(i)

    if (missing.length) {
      // Coalesce neighbouring gaps into one request — a fresh view is usually
      // a contiguous run, and one range beats twenty
      const runs = []
      for (const i of missing) {
        const tail = runs[runs.length - 1]
        if (tail && i === tail[1] + 1) tail[1] = i
        else runs.push([i, i])
      }
      for (const [a, b] of runs) {
        const start = a * CHUNK
        const want = (b - a + 1) * CHUNK
        const res = await this.remote.getBytes(start, want, signal, etag)
        const bytes = new Uint8Array(res.data)

        // A changed etag means the archive was rebuilt; anything we hold for
        // it is now wrong, and serving stale road geometry is worse than
        // refetching (VISION row 97 stamps these rebuilds).
        const seen = await idb(META, 'readonly', (s) => s.get(this.url))
        if (res.etag && seen && seen !== res.etag) await purge(this.url)
        if (res.etag && seen !== res.etag) {
          await idb(META, 'readwrite', (s) => s.put(res.etag, this.url))
        }

        await idb(CHUNKS, 'readwrite', (store) => {
          for (let i = a; i <= b; i++) {
            const slice = bytes.slice((i - a) * CHUNK, (i - a + 1) * CHUNK)
            if (!slice.length) break            // ran past the end of the file
            held.set(i, slice)
            store.put(slice, chunkKey(this.url, i))
          }
        })
      }
    }

    // Stitch the requested window back out of the chunks
    const out = new Uint8Array(length)
    let written = 0
    for (let i = first; i <= last; i++) {
      const chunk = held.get(i)
      if (!chunk) break
      const chunkStart = i * CHUNK
      const from = Math.max(0, offset - chunkStart)
      const to = Math.min(chunk.length, offset + length - chunkStart)
      if (to <= from) continue
      const piece = chunk.subarray(from, to)
      out.set(piece, written)
      written += piece.length
    }
    return { data: (written === length ? out : out.subarray(0, written)).buffer }
  }
}

/** Bytes we are holding for the tilesets, for the Offline tab to report. */
export async function cachedBytes() {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    let total = 0
    const t = db.transaction(CHUNKS, 'readonly')
    const req = t.objectStore(CHUNKS).openCursor()
    req.onsuccess = () => {
      const cur = req.result
      if (!cur) return
      total += cur.value?.byteLength || cur.value?.length || 0
      cur.continue()
    }
    t.oncomplete = () => resolve(total)
    t.onerror = () => reject(t.error)
  })
}

export async function clearCachedTilesets() {
  await idb(CHUNKS, 'readwrite', (s) => s.clear())
  await idb(META, 'readwrite', (s) => s.clear())
}
