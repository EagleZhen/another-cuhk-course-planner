import { describe, expect, it } from 'vitest'
import { shouldReloadForStaleChunk } from './staleChunk'

function chunkLoadError() {
  const error = new Error('Loading chunk 123 failed.')
  error.name = 'ChunkLoadError'
  return error
}

describe('shouldReloadForStaleChunk', () => {
  it('reloads on the first stale chunk', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), false)).toBe(true)
  })

  it('gives up once a reload has already been tried', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), true)).toBe(false)
  })

  it('leaves other errors to the error page', () => {
    expect(shouldReloadForStaleChunk(new TypeError('unrelated'), false)).toBe(false)
  })

  // Without storage the guard cannot persist, so a reload would repeat forever.
  it('does not reload when the flag cannot be read', () => {
    expect(shouldReloadForStaleChunk(chunkLoadError(), null)).toBe(false)
  })
})
