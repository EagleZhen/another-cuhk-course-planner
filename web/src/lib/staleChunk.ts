import { STALE_CHUNK_RELOAD_KEY } from './constants'

// A deploy removes the chunk an open tab asks for; reloading picks up the new build.
// Only once, though — a genuinely broken build would reload forever.

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

// null = the flag is unreadable, so the guard cannot work. Reloading anyway is the loop.
export function shouldReloadForStaleChunk(error: Error, alreadyReloaded: boolean | null): boolean {
  return isStaleChunkError(error) && alreadyReloaded === false
}

// Storage throws where site data is blocked. These run in the root error boundary, which
// has nothing beneath it to catch a throw, so they report failure instead.

export function readStaleChunkReload(): boolean | null {
  try {
    return sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) !== null
  } catch {
    return null
  }
}

/** False if the guard could not be stored — reloading then would loop. */
export function rememberStaleChunkReload(): boolean {
  try {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, '1')
    return true
  } catch {
    return false
  }
}

export function forgetStaleChunkReload(): void {
  try {
    sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
}
