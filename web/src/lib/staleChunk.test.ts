import { describe, expect, it } from 'vitest'
import {
  hasRefreshMarker,
  shouldReloadForStaleChunk,
  withoutRefreshMarker,
  withRefreshMarker,
} from './staleChunk'

function chunkLoadError() {
  const error = new Error('Loading chunk 123 failed.')
  error.name = 'ChunkLoadError'
  return error
}

const now = 1_000_000_000_000
const minutes = (n: number) => n * 60_000

describe('shouldReloadForStaleChunk', () => {
  it('reloads on the first stale chunk', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), null, now)).toBe(true)
  })

  it('gives up when the last reload was moments ago', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), now - minutes(1), now)).toBe(false)
  })

  // A later deploy is a fresh reason to recover, not the broken build the guard is for.
  it('recovers again once the cooldown has passed', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), now - minutes(6), now)).toBe(true)
  })

  it('leaves other errors to the error page', () => {
    expect(shouldReloadForStaleChunk(new TypeError('unrelated'), null, now)).toBe(false)
  })

  // What an unreadable flag reports: no guard can persist, so a reload would repeat.
  it('does not reload when the last reload reads as just now', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), now, now)).toBe(false)
  })
})

describe('the refresh marker', () => {
  const page = 'https://example.com/?term=2026'

  it('rides the recovery navigation', () => {
    expect(hasRefreshMarker(withRefreshMarker(page))).toBe(true)
  })

  it('is absent from an ordinary URL', () => {
    expect(hasRefreshMarker(page)).toBe(false)
  })

  // Stripping must leave the rest of the URL alone — the term drives what the page shows.
  it('strips only itself', () => {
    expect(withoutRefreshMarker(withRefreshMarker(page))).toBe('/?term=2026')
  })
})
