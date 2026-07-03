import { describe, expect, test } from 'bun:test'
import manifest from '../.well-known/signage-app.json'

// Validates the signage-app manifest shipped at /.well-known/signage-app.json.
// The authoritative JSON Schema lives in the sibling app-store repo, so it isn't
// available to CI here; instead we encode the same invariants the store's index
// build enforces (see docs/app-manifest.md). This app takes no settings and
// picks its word deterministically from the local date, so — like the Quotes
// app — it carries neither a `settings` block nor `playback`, and `launch` is
// just the base URL.

const BASE_URL = 'https://word.srly.io/'
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Fields the store treats as URLs — each must parse and be absolute https.
const URL_FIELDS = ['icon', 'homepage', 'source', 'support'] as const

describe('signage-app manifest', () => {
  test('declares the manifest format version', () => {
    expect(manifest.manifestVersion).toBe('1')
  })

  test('has the required identity fields', () => {
    expect(typeof manifest.id).toBe('string')
    expect(manifest.id).toBe('word')
    expect(manifest.id).toMatch(ID_PATTERN)
    expect(typeof manifest.name).toBe('string')
    expect(manifest.name.length).toBeGreaterThan(0)
    expect(typeof manifest.description).toBe('string')
    expect(manifest.description.length).toBeGreaterThan(0)
  })

  test('tags are unique strings', () => {
    expect(Array.isArray(manifest.tags)).toBe(true)
    const tags = manifest.tags ?? []
    for (const t of tags) expect(typeof t).toBe('string')
    expect(new Set(tags).size).toBe(tags.length)
  })

  test('URL fields are absolute https URLs', () => {
    for (const field of URL_FIELDS) {
      const value = (manifest as Record<string, unknown>)[field]
      if (value === undefined) continue
      expect(typeof value).toBe('string')
      const url = new URL(value as string)
      expect(url.protocol).toBe('https:')
    }
  })

  test('launches from the production base URL', () => {
    expect(manifest.launch.baseUrl).toBe(BASE_URL)
    expect(new URL(manifest.launch.baseUrl).protocol).toBe('https:')
  })

  test('takes no settings, so it carries no launch template', () => {
    expect('settings' in manifest).toBe(false)
    expect('template' in manifest.launch).toBe(false)
  })

  test('is a single-shot page with nothing to pace', () => {
    // Fresh word per local date, no rotation loop, static data — no pacing.
    expect('playback' in manifest).toBe(false)
  })
})
