import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { buildAtlas } from './scripts/sprite-atlas.mjs'

const SPRITES = fileURLToPath(new URL('./public/sprites/', import.meta.url))

// The sprite atlas (scripts/sprite-atlas.mjs): emitted into dist/sprites/ at build, and
// built fresh per request on the dev server so a newly drawn sprite shows at once.
function spriteAtlas() {
  return {
    name: 'hvi-sprite-atlas',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url || '').split('?')[0]
        if (path !== '/sprites/atlas.json' && path !== '/sprites/atlas.png') return next()
        try {
          const { png, json } = buildAtlas(SPRITES)
          res.setHeader('Cache-Control', 'no-cache')
          if (path.endsWith('.json')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(json)) }
          else { res.setHeader('Content-Type', 'image/png'); res.end(png) }
        } catch (e) { next(e) }
      })
    },
    generateBundle() {
      const { png, json, skipped } = buildAtlas(SPRITES)
      this.emitFile({ type: 'asset', fileName: 'sprites/atlas.png', source: png })
      this.emitFile({ type: 'asset', fileName: 'sprites/atlas.json', source: JSON.stringify(json) })
      if (skipped.length) this.warn(`sprite atlas skipped (not 8-bit PNG): ${skipped.join(', ')}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), spriteAtlas()],
  // Dev only: /api/* goes to `netlify functions:serve --port 9999` (local Blobs sandbox).
  // The functions' same-origin check sees the functions host, so the proxy presents it.
  server: { proxy: { '/api': { target: 'http://localhost:9999', changeOrigin: true, headers: { origin: 'http://localhost:9999' } } } },
})
