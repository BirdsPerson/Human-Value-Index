import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { buildAtlas } from './scripts/sprite-atlas.mjs'
import { FAMOUS_FIGURES } from './src/figures.js'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { routesIn } from './src/play/games.js'

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

// Link-preview scores come from the roster at build time, so a rescore never leaves the
// share text quoting yesterday's numbers.
function shareScores() {
  const score = name => FAMOUS_FIGURES.find(f => f.name === name)?.score
  const line = [['Tubman', 'Harriet Tubman'], ['Einstein', 'Albert Einstein'], ['Genghis Khan', 'Genghis Khan']]
    .filter(([, n]) => typeof score(n) === 'number').map(([l, n]) => `${l} ${score(n)}.`).join(' ')
  return { name: 'hvi-share-scores', transformIndexHtml: html => html.replaceAll('%HVI_SHARE_SCORES%', line) }
}

function gitSha() {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
}

export default defineConfig({
  // #play greys out a game tile whose route App.jsx does not serve yet (src/play/games.js).
  define: {
    __HVI_ROUTES__: JSON.stringify(routesIn(readFileSync(new URL('./src/App.jsx', import.meta.url), 'utf8'))),
    // The header's BETA tag: package.json version + the commit it was built from.
    __HVI_VERSION__: JSON.stringify(JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version),
    __HVI_BUILD__: JSON.stringify(gitSha()),
  },
  plugins: [react(), spriteAtlas(), shareScores()],
  // Dev only: /api/* goes to `netlify functions:serve --port 9999` (local Blobs sandbox).
  // The functions' same-origin check sees the functions host, so the proxy presents it.
  server: { proxy: { '/api': { target: 'http://localhost:9999', changeOrigin: true, headers: { origin: 'http://localhost:9999' } } } },
})
