#!/usr/bin/env bun
/* global Bun */
// Builds the static site into ./dist for GitHub Pages. Unlike the Cloudflare
// Worker templates this is a plain static bundle — no server. Steps:
//   1. vendor fonts from @fontsource (sync-fonts.js)
//   2. assemble dist/ (index.html + static assets, copied not mutated)
//   3. compile Tailwind v4 CSS (minified)
//   4. bundle TypeScript → browser JS (minified, ./word inlined)
//   5. stamp a content hash into asset URLs (?v=) for cache-busting
//   6. write CNAME for the custom domain
//   7. write .nojekyll so Pages serves .well-known/ verbatim
// dist/ is gitignored; CI uploads it as the Pages artifact.

import { rm, mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import cascadeLayers from '@csstools/postcss-cascade-layers'
import browserslist from 'browserslist'
import { build as esbuild } from 'esbuild'
import { browserslistToTargets, transform as lightningcss } from 'lightningcss'
import postcss from 'postcss'
import { run as syncFonts } from './sync-fonts.js'

const DIST = 'dist'
const DOMAIN = 'word.srly.io'

// Single browser-support floor for the whole build: the `browserslist` field in
// package.json drives both the CSS down-leveling (Lightning CSS) and the JS
// syntax floor, so old signage players get a build they can actually run. See
// the degraded-mode notes in index.html / tailwind.css.
const cssTargets = browserslistToTargets(browserslist())

// 1. Vendor the Bun-managed webfonts into ./assets before copying.
await syncFonts()

// 2. Fresh dist/, then copy the web root (everything served at /static/...) and
// the page shell. Sources are never minified in place.
await rm(DIST, { recursive: true, force: true })
await mkdir(`${DIST}/static`, { recursive: true })
await cp('assets/static/fonts', `${DIST}/static/fonts`, { recursive: true })
await cp('assets/static/images', `${DIST}/static/images`, { recursive: true })
await cp('assets/static/data', `${DIST}/static/data`, { recursive: true })
// Signage app manifest served at the well-known path (see docs/app-manifest.md
// in the app-store repo). GitHub Pages serves .json as application/json and
// sends Access-Control-Allow-Origin: * on every response, satisfying the
// manifest's Content-Type and CORS requirements.
await cp('.well-known', `${DIST}/.well-known`, { recursive: true })
await cp('index.html', `${DIST}/index.html`)

// 3. Tailwind: compile the source CSS (unminified), then down-level + minify it
// for the browserslist floor. cascade-layers flattens @layer into :not(#\#)
// specificity so the cascade survives on engines that drop @layer contents;
// Lightning CSS then lowers color-mix()/nesting, adds prefixes, and minifies.
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
const flattened = await postcss([cascadeLayers()]).process(await readFile(cssOut, 'utf8'), {
  from: cssOut
})
const { code: cssCode } = lightningcss({
  filename: cssOut,
  code: Buffer.from(flattened.css),
  minify: true,
  targets: cssTargets
})
await writeFile(cssOut, cssCode)
console.log(`✓ CSS: ${cssOut} (Tailwind → cascade-layers flatten → Lightning CSS)`)

// 4. TypeScript → browser JS with esbuild. Bundles main.ts (inlining ./word
// and the polyfills shim), lowers modern syntax (?., ??, spread) to the ES2017
// floor so old engines can parse it, and emits an IIFE so the output stays a
// self-contained self-executing classic script loadable from a plain <script>.
try {
  await esbuild({
    entryPoints: ['assets/static/js/main.ts'],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2017'],
    outfile: `${DIST}/static/js/main.js`
  })
} catch (err) {
  console.error('✗ JS build failed')
  console.error(err)
  process.exit(1)
}
console.log(`✓ JS: ${DIST}/static/js/main.js (esbuild, iife, es2017)`)

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
