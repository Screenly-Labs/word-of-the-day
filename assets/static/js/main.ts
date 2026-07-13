// Browser entry. esbuild bundles this (inlining ./word) into a self-contained
// classic script with no exports, so it loads from a plain <script>. Keep it
// export-free and free of top-level await.

// Side-effect import: installs the replaceChildren shim for the older-browser
// degraded mode. Must stay first so the shim is in place before any render.
import '@screenly-labs/signage-kit/polyfills'
import { removeScreenlyBranding } from '@screenly-labs/signage-kit/branding'

import { isWordEntry, pickIndexForDate, type WordEntry } from './word'

// Shown if the words file can't be fetched or is empty, so the screen is never
// blank on signage with flaky connectivity.
const FALLBACK: WordEntry = {
  word: 'serendipity',
  pronunciation: '/ˌsɛrənˈdɪpɪti/',
  definition: 'The occurrence of happy or beneficial events by chance.'
}

const DATA_URL = '/static/data/words.json'

// Scale the headword down so it fits the stage on one line. The CSS clamp is the
// upper bound; this only shrinks (never grows past it), so short words stay
// monumental and long ones never overflow or wrap. Re-run on resize/orientation
// change and once the display font has loaded (metrics change when it swaps in).
const fitWord = (): void => {
  const wordEl = document.getElementById('word-text')
  const stage = document.querySelector('.stage')
  if (!wordEl || !(stage instanceof HTMLElement)) return
  const cs = getComputedStyle(stage)
  const available = stage.clientWidth - Number.parseFloat(cs.paddingLeft) - Number.parseFloat(cs.paddingRight)
  wordEl.style.fontSize = '' // reset to the CSS clamp before measuring
  const base = Number.parseFloat(getComputedStyle(wordEl).fontSize)
  const full = wordEl.scrollWidth
  if (full > available && full > 0) wordEl.style.fontSize = `${(base * available) / full}px`
}

// en-US so the date format is consistent across devices (matches the US-English
// word list), e.g. "June 29, 2026".
const formatDate = (date: Date): string =>
  date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

const render = (entry: WordEntry, today: Date): void => {
  const wordEl = document.getElementById('word-text')
  const pronEl = document.getElementById('word-pronunciation')
  const defEl = document.getElementById('word-definition')
  const dateEl = document.getElementById('word-date')
  if (wordEl) wordEl.textContent = entry.word
  if (pronEl) pronEl.textContent = entry.pronunciation
  if (defEl) defEl.textContent = entry.definition
  if (dateEl) dateEl.textContent = ` · ${formatDate(today)}`
  fitWord()
  if (document.fonts?.ready) document.fonts.ready.then(fitWord)
  document.documentElement.dataset.state = 'ready'
}

const loadWord = async (today: Date): Promise<WordEntry> => {
  try {
    // no-cache: revalidate so a redeploy's new list isn't masked by a stale
    // cached copy, while still working offline from cache when unreachable.
    const res = await fetch(DATA_URL, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    const words = Array.isArray(data) ? data.filter(isWordEntry) : []
    if (words.length === 0) throw new Error('no valid words in payload')
    // Deterministic per calendar day: everyone sees the same word today, and it
    // advances at local midnight. Reloads within a day never change it.
    return words[pickIndexForDate(today, words.length)]
  } catch (error) {
    console.error('Word of the day: using fallback —', error)
    return FALLBACK
  }
}

const init = (): void => {
  removeScreenlyBranding()
  // One date drives both the word selection and the displayed date, so they
  // always agree (the local calendar day).
  const today = new Date()
  loadWord(today).then((entry) => render(entry, today))
  // Re-fit on orientation/resolution changes (signage can rotate).
  let resizeTimer = 0
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(fitWord, 150)
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
