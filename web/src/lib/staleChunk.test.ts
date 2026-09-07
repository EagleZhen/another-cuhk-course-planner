import { describe, expect, it } from 'vitest'
import {
  hasRefreshMarker,
  isStaleChunkError,
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

describe('isStaleChunkError', () => {
  it('separates a stale chunk from every other error', () => {
    expect(isStaleChunkError(chunkLoadError())).toBe(true)
    expect(isStaleChunkError(new TypeError('unrelated'))).toBe(false)
  })
})

describe('shouldReloadForStaleChunk', () => {
  const fresh = { href: 'https://example.com/', lastBuildId: null, buildId: build }

  it('recovers on the first stale chunk', () => {
    expect(shouldReloadForStaleChunk(fresh)).toBe(true)
  })

  // The navigation handed back the build we already failed on, so repeating it is the loop.
  it('gives up when the same build comes back', () => {
    expect(shouldReloadForStaleChunk({ ...fresh, lastBuildId: build })).toBe(false)
  })

  // The marker means a recovery navigation already brought us here, and only a page that
  // mounted strips it — so it closes the loop even if the build id never persisted.
  it('gives up when a recovery navigation already brought us here', () => {
    expect(shouldReloadForStaleChunk({ ...fresh, href: 'https://example.com/?refreshed=1' })).toBe(
      false
    )
  })

  // A later deploy is a different build, and a fresh reason to recover.
  it('recovers again on a build it has not tried', () => {
    expect(shouldReloadForStaleChunk({ ...fresh, lastBuildId: 'older' })).toBe(true)
  })

  // No commit named this build, so nothing is stored and both sides read null. Comparing
  // them would say "already tried" and never recover; the marker is the whole guard here.
  it('falls back to the marker when the build is unnamed', () => {
    expect(shouldReloadForStaleChunk({ ...fresh, buildId: null, lastBuildId: null })).toBe(true)
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
