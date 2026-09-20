import { describe, expect, it } from 'vitest'
import {
  hasRefreshMarker,
  isStaleChunkError,
  withoutRefreshMarker,
  withRefreshMarker,
} from './staleChunk'

function chunkLoadError() {
  const error = new Error('Loading chunk 123 failed.')
  error.name = 'ChunkLoadError'
  return error
}

describe('isStaleChunkError', () => {
  it('separates a stale chunk from every other error', () => {
    expect(isStaleChunkError(chunkLoadError())).toBe(true)
    expect(isStaleChunkError(new TypeError('unrelated'))).toBe(false)
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

  // Stripping must leave the rest of the URL alone — this feeds replaceState, so whatever
  // else is in the URL stays in what the user sees and copies.
  it('strips only itself', () => {
    expect(withoutRefreshMarker(withRefreshMarker(page))).toBe('/?term=2026')
  })
})
