import { describe, expect, it } from 'bun:test'
import { dayNumber, isWordEntry, pickIndexForDate, type WordEntry } from '../assets/static/js/word'

describe('dayNumber', () => {
  it('counts days since the Unix epoch from the local calendar date', () => {
    expect(dayNumber(new Date(1970, 0, 1))).toBe(0)
    expect(dayNumber(new Date(1970, 0, 2))).toBe(1)
    expect(dayNumber(new Date(2024, 0, 1))).toBe(19723)
  })

  it('ignores the time of day — only the calendar date matters', () => {
    const morning = new Date(2024, 5, 29, 6, 0, 0)
    const night = new Date(2024, 5, 29, 23, 59, 59)
    expect(dayNumber(morning)).toBe(dayNumber(night))
  })
})

describe('pickIndexForDate', () => {
  const N = 365

  it('is deterministic: the same date always yields the same index', () => {
    const a = pickIndexForDate(new Date(2026, 5, 29), N)
    const b = pickIndexForDate(new Date(2026, 5, 29), N)
    expect(a).toBe(b)
  })

  it('does not depend on the time of day', () => {
    const a = pickIndexForDate(new Date(2026, 5, 29, 0, 1), N)
    const b = pickIndexForDate(new Date(2026, 5, 29, 22, 30), N)
    expect(a).toBe(b)
  })

  it('advances by exactly one (mod length) from one day to the next', () => {
    const today = new Date(2026, 5, 29)
    const tomorrow = new Date(2026, 5, 30)
    expect(pickIndexForDate(tomorrow, N)).toBe((pickIndexForDate(today, N) + 1) % N)
  })

  it('wraps around the end of the list', () => {
    // Walking `length` consecutive days returns to the same index.
    const start = new Date(2026, 0, 1)
    const wrapped = new Date(2026, 0, 1 + N)
    expect(pickIndexForDate(wrapped, N)).toBe(pickIndexForDate(start, N))
  })

  it('always returns an index in [0, length), including pre-1970 and far-future', () => {
    const dates = [
      new Date(1900, 0, 1),
      new Date(1969, 11, 31),
      new Date(1970, 0, 1),
      new Date(2026, 5, 29),
      new Date(3000, 11, 31)
    ]
    for (const d of dates) {
      const idx = pickIndexForDate(d, N)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(N)
      expect(Number.isInteger(idx)).toBe(true)
    }
  })

  it('guards against empty or invalid lengths', () => {
    expect(pickIndexForDate(new Date(2026, 5, 29), 0)).toBe(0)
    expect(pickIndexForDate(new Date(2026, 5, 29), -5)).toBe(0)
    expect(pickIndexForDate(new Date(2026, 5, 29), Number.NaN)).toBe(0)
  })
})

describe('isWordEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(isWordEntry({ word: 'a', pronunciation: '/b/', definition: 'c' })).toBe(true)
  })

  it('rejects malformed or incomplete values', () => {
    expect(isWordEntry(null)).toBe(false)
    expect(isWordEntry('nope')).toBe(false)
    expect(isWordEntry({ word: 'a', pronunciation: '/b/' })).toBe(false)
    expect(isWordEntry({ word: '', pronunciation: '/b/', definition: 'c' })).toBe(false)
  })
})

describe('words.json dataset', () => {
  // Loaded from the served data file so the test guards exactly what ships.
  const load = async (): Promise<unknown> => Bun.file('assets/static/data/words.json').json()

  it('is a non-empty array of roughly a year of words', async () => {
    const data = await load()
    expect(Array.isArray(data)).toBe(true)
    const words = data as unknown[]
    expect(words.length).toBeGreaterThanOrEqual(300)
  })

  it('contains only well-formed entries', async () => {
    const data = (await load()) as unknown[]
    for (const entry of data) {
      expect(isWordEntry(entry)).toBe(true)
    }
  })

  it('has no duplicate words (case-insensitive)', async () => {
    const data = (await load()) as WordEntry[]
    const seen = new Set<string>()
    const dupes: string[] = []
    for (const { word } of data) {
      const key = word.toLowerCase()
      if (seen.has(key)) dupes.push(word)
      seen.add(key)
    }
    expect(dupes).toEqual([])
  })

  it('keeps definitions concise and pronunciations slash-delimited', async () => {
    const data = (await load()) as WordEntry[]
    for (const { word, pronunciation, definition } of data) {
      expect(definition.length, `definition too long for "${word}"`).toBeLessThanOrEqual(160)
      expect(pronunciation.startsWith('/'), `pronunciation missing leading / for "${word}"`).toBe(
        true
      )
      expect(pronunciation.endsWith('/'), `pronunciation missing trailing / for "${word}"`).toBe(
        true
      )
    }
  })
})
