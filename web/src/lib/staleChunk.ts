import { STALE_CHUNK_REFRESH_PARAM, STALE_CHUNK_RELOAD_KEY } from './constants'

// A deploy removes the chunk an open tab asks for; reloading picks up the new build.
// Two facts with different lifetimes: whether we already tried (the loop guard, kept in
// session storage) and whether the navigation that just happened was ours (the URL).

// A second failure this soon after a reload means the build is broken, not that someone
// deployed again. Much longer and a tab left open across two deploys would be stranded.
const RELOAD_COOLDOWN_MS = 5 * 60_000

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

export function shouldReloadForStaleChunk(
  error: Error,
  lastReloadAt: number | null,
  now: number
): boolean {
  if (!isStaleChunkError(error)) return false
  return lastReloadAt === null || now - lastReloadAt > RELOAD_COOLDOWN_MS
}

// Recovering navigates to this rather than reloading, so the marker rides the navigation
// instead of existing in the page we are leaving — which is what would let the notice
// fire a moment too early.
export function withRefreshMarker(href: string): string {
  const url = new URL(href)
  url.searchParams.set(STALE_CHUNK_REFRESH_PARAM, '1')
  return url.toString()
}

export function hasRefreshMarker(href: string): boolean {
  return new URL(href).searchParams.has(STALE_CHUNK_REFRESH_PARAM)
}

/** Relative, for history.replaceState. */
export function withoutRefreshMarker(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(STALE_CHUNK_REFRESH_PARAM)
  return url.pathname + url.search + url.hash
}

// Storage throws where site data is blocked. These run in the root error boundary, which
// has nothing beneath it to catch a throw, so they report failure instead.

/** `now` when storage is unreadable: we cannot rule out having just reloaded, and
 *  recovering with no guard to persist is what loops. */
export function readStaleChunkReload(now: number): number | null {
  try {
    const at = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY))
    return at > 0 ? at : null
  } catch {
    return now
  }
}

/** False if nothing was stored — reloading then would loop. */
export function rememberStaleChunkReload(at: number): boolean {
  try {
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(at))
    return true
  } catch {
    return false
  }
}
