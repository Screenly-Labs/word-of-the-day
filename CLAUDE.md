# CLAUDE.md

Guidance for working in this repo.

## What this is

A **word-of-the-day** app for Screenly digital signage: a single full-screen
page that shows one word, its pronunciation, and its definition. Part of the
same family as `weather-app`, `clock-app`, and `quotes`, and it shares their
visual language (warm ink ground, paper text, gilt accent, Fraunces + Hanken
Grotesk).

Unlike the `weather-app`/`clock-app` templates — which are **Cloudflare Workers**
(Hono SSR + Wrangler) — this app is a **static site hosted on GitHub Pages**.
There is no server runtime: selection happens entirely in the browser. It is
closest to the `quotes` app, which it was adapted from.

Live at **https://word.srly.io** (custom domain, served from the repo root).

## Architecture

- **Static `index.html`** holds the page shell and a fallback entry.
- **`assets/static/js/word.ts`** — pure, unit-tested helpers (no DOM):
  `pickIndexForDate`, `dayNumber`, `isWordEntry`, and the `WordEntry` type.
- **`assets/static/js/main.ts`** — the browser entry. A self-executing module
  with **no top-level exports** (Bun bundles it to a self-contained classic
  `<script>`). It fetches `words.json`, picks today's word, and writes it into
  the DOM. Keep it export-free and free of top-level `await`.
- **`assets/static/styles/tailwind.css`** — Tailwind v4 source (CSS-first config:
  `@import "tailwindcss"` + `@theme` tokens + `@font-face`). No `tailwind.config.js`.
- **`assets/static/data/words.json`** — the curated dataset (committed).

### Selection is deterministic per day

The defining behavior: the word is chosen by the **calendar date**, not at
random. `pickIndexForDate(new Date(), N)` returns `dayNumber(date) mod N`, where
`dayNumber` is the local calendar day as an integer count of days since the Unix
epoch. Consequences:

- Every device shows the **same word on a given day**.
- The word **advances at local midnight** (uses the device's local date).
- Reloading within a day never changes the word.
- The curated list is in an intentional shuffled (non-alphabetical) order, so
  consecutive days are unrelated; it cycles through all ~364 words before
  repeating.

## Commands (Bun only — no npm/npx)

```bash
bun install            # install deps (also needed before sync-fonts/build)
bun run typecheck      # tsc --noEmit (strict)
bun run lint           # biome lint --error-on-warnings
bun run format         # biome format --write
bun test               # bun:test — helper determinism + words.json validation
bun run sync-fonts     # vendor Fraunces + Hanken woff2 into assets/static/fonts
bun run build          # build static site into ./dist
bun run dev            # build, then serve ./dist locally
```

## Build → `dist/`

`build.js` is non-destructive (it never minifies sources in place):

1. `syncFonts()` vendors the woff2 from `@fontsource-variable/*`.
2. Copies `index.html` + `assets/static/{fonts,images,data}` into `dist/`.
3. Compiles + minifies Tailwind → `dist/static/styles/main.css`.
4. Bundles `main.ts` (inlining `word.ts`) → `dist/static/js/main.js`, minified.
5. Stamps a SHA-256 content hash into `?v=__ASSET_VERSION__` URLs for cache-busting.
6. Writes `dist/CNAME` (`word.srly.io`).

`dist/` is gitignored; CI uploads it as the Pages artifact.

## Data — curating words

`words.json` is an array of `{ word, pronunciation, definition }`:
- `word`: lowercase headword.
- `pronunciation`: General American IPA in `/slashes/`.
- `definition`: one concise sentence (≤ 160 chars).

The list was **hand-curated** (no external dataset, no fetch step), favoring
interesting-but-usable, work-appropriate vocabulary. `test/word.test.ts`
validates shape, uniqueness, length caps, and slash-delimited pronunciations —
but it cannot verify IPA *correctness*, so review pronunciations by hand when
editing. Keep entries safe-for-work.

## CI/CD

- `.github/workflows/ci.yml` — on PRs to `master`: typecheck, lint, test, build.
- `.github/workflows/deploy-pages.yml` — on push to `master` (or manual dispatch):
  build and deploy to GitHub Pages.

The repo's default branch is **`master`**, so both triggers are correct.

## Supported resolutions

Aim for full responsiveness; at minimum the layout must look correct at each
resolution below, in **both orientations**, across the fluid range 480 px → 4K.

| Resolution | Orientation | Notes |
| --- | --- | --- |
| 4096×2160 / 3840×2160 | landscape | 4K |
| 2160×4096 / 2160×3840 | portrait | 4K |
| 1920×1080 | landscape | 1080p |
| 1080×1920 | portrait | 1080p |
| 1280×720 | landscape | 720p |
| 720×1280 | portrait | 720p |
| 800×480 | landscape | RPi Touch Display |
| 480×800 | portrait | RPi Touch Display |
