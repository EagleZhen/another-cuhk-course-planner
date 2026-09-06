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

const build = 'abc123'

describe('shouldReloadForStaleChunk', () => {
  it('recovers on the first stale chunk', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), null, build)).toBe(true)
  })

  // The navigation handed back the build we already failed on, so repeating it is the loop.
  it('gives up when the same build comes back', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), build, build)).toBe(false)
  })

  // A later deploy is a different build, and a fresh reason to recover.
  it('recovers again on a build it has not tried', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), 'older', build)).toBe(true)
  })

  it('leaves other errors to the error page', () => {
    expect(shouldReloadForStaleChunk(new TypeError('unrelated'), null, build)).toBe(false)
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
