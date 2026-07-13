#!/usr/bin/env bun
/* global Bun */
// Builds the static site into ./dist for GitHub Pages. Unlike the Cloudflare
// Worker templates this is a plain static bundle — no server. The degraded-mode
// support floor, the CSS down-leveling recipe (cascade-layers flatten + Lightning
// CSS), the JS bundler, and the inline degraded-mode gate all come from
// @screenly-labs/signage-kit. This file only orchestrates the app-specific steps:
//   1. vendor fonts from @fontsource (sync-fonts.js)
//   2. assemble dist/ (index.html + static assets, copied not mutated)
//   3. compile Tailwind v4 CSS → the kit's CSS pipeline
//   4. bundle TypeScript → browser JS via the kit's bundler (./word inlined)
//   5. stamp a content hash into asset URLs (?v=) for cache-busting
//   6. write CNAME for the custom domain
//   7. write .nojekyll so Pages serves .well-known/ verbatim
// dist/ is gitignored; CI uploads it as the Pages artifact.

import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { bundleJs, injectGate, processCss } from '@screenly-labs/signage-kit/build'
import { run as syncFonts } from './sync-fonts.js'

const DIST = 'dist'
const DOMAIN = 'word.srly.io'

// 1. Vendor the Bun-managed webfonts into ./assets before copying.
await syncFonts()

// 2. Fresh dist/, then copy the web root (everything served at /static/...) and
// the page shell. Sources are never minified in place.
await rm(DIST, { recursive: true, force: true })
await mkdir(`${DIST}/static`, { recursive: true })
// Create the output subdirs up front so Tailwind/esbuild never race an absent dir.
await mkdir(`${DIST}/static/styles`, { recursive: true })
await mkdir(`${DIST}/static/js`, { recursive: true })
await cp('assets/static/fonts', `${DIST}/static/fonts`, { recursive: true })
await cp('assets/static/images', `${DIST}/static/images`, { recursive: true })
await cp('assets/static/data', `${DIST}/static/data`, { recursive: true })
// Signage app manifest served at the well-known path (see docs/app-manifest.md
// in the app-store repo). GitHub Pages serves .json as application/json and
// sends Access-Control-Allow-Origin: * on every response, satisfying the
// manifest's Content-Type and CORS requirements.
await cp('.well-known', `${DIST}/.well-known`, { recursive: true })
await writeFile(`${DIST}/index.html`, injectGate(await readFile('index.html', 'utf8')))

// 3. Tailwind → the kit's CSS pipeline (flatten @layer, down-level to the floor).
const cssOut = `${DIST}/static/styles/main.css`
const tailwind = Bun.spawn(
  [
    'node_modules/.bin/tailwindcss',
    '--input',
    'assets/static/styles/tailwind.css',
    '--output',
    cssOut
  ],
  { stdout: 'inherit', stderr: 'inherit' }
)
if ((await tailwind.exited) !== 0) {
  console.error('✗ Tailwind build failed')
  process.exit(1)
}
await writeFile(cssOut, await processCss(await readFile(cssOut, 'utf8'), { flattenLayers: true, filename: cssOut }))
console.log(`✓ CSS: ${cssOut}`)

// 4. Client TS -> the kit's bundler (self-contained IIFE at the floor's syntax level).
await bundleJs('assets/static/js/main.ts', `${DIST}/static/js/main.js`)
console.log(`✓ JS: ${DIST}/static/js/main.js`)

// 5. Cache-busting: hash the built JS + CSS + data so the token changes exactly
// when shipped content changes, then stamp it into the page's asset URLs.
const fingerprint = await Promise.all([
  readFile(`${DIST}/static/js/main.js`),
  readFile(`${DIST}/static/styles/main.css`),
  readFile(`${DIST}/static/data/words.json`)
])
const hasher = new Bun.CryptoHasher('sha256')
for (const buf of fingerprint) hasher.update(buf)
const version = hasher.digest('hex').slice(0, 10)

const html = await readFile(`${DIST}/index.html`, 'utf8')
await writeFile(`${DIST}/index.html`, html.replaceAll('__ASSET_VERSION__', version))
console.log(`✓ Stamped asset version ${version}`)

// 6. Custom domain for GitHub Pages.
await writeFile(`${DIST}/CNAME`, `${DOMAIN}\n`)
console.log(`✓ CNAME: ${DOMAIN}`)

// 7. Disable Jekyll so Pages serves files as-is — without this marker a Jekyll
// build would skip dot-prefixed directories like .well-known/, 404-ing the
// manifest.
await writeFile(`${DIST}/.nojekyll`, '')
console.log('✓ .nojekyll')

console.log('Build complete → dist/')
