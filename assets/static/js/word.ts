// Pure, framework-free helpers for the word-of-the-day app. Kept separate from
// main.ts so they can be unit-tested with `bun:test`; main.ts is the (untestable,
// no-exports) browser entry that wires these into the DOM.

export type WordEntry = { word: string; pronunciation: string; definition: string }

const MS_PER_DAY = 86_400_000

// Local calendar day as an integer count of days since 1970-01-01. Uses the
// device's local Y/M/D (not its clock instant), so the value flips at local
// midnight and is identical for every device on the same calendar date,
// regardless of timezone or time of day.
export const dayNumber = (date: Date): number =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY)

// Deterministic pick for a given calendar date: the same date always yields the
// same index, consecutive days advance by one (mod length), and the result is
// always in [0, length) — including pre-1970 and far-future dates. Guards
// against empty/invalid input.
export const pickIndexForDate = (date: Date, length: number): number => {
  if (!Number.isFinite(length) || length <= 0) return 0
  const n = dayNumber(date)
  return ((n % length) + length) % length
}

// Runtime type guard — the fetched JSON is untrusted `unknown` until validated.
export const isWordEntry = (value: unknown): value is WordEntry => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.word === 'string' &&
    entry.word.length > 0 &&
    typeof entry.pronunciation === 'string' &&
    entry.pronunciation.length > 0 &&
    typeof entry.definition === 'string' &&
    entry.definition.length > 0
  )
}
