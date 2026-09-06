import { STALE_CHUNK_REFRESH_PARAM, STALE_CHUNK_RELOAD_KEY } from './constants'

// A deploy removes the chunk an open tab asks for; navigating again picks up the new
// build. Two facts with different lifetimes: which build we last tried this from (the
// loop guard, in session storage) and whether the navigation just made was ours (the URL).

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

// Recover only from a build we have not already tried. Getting the same build back means
// the navigation did not reach a new one, so repeating it cannot help — while a later
// deploy is a different build and recovers normally.
export function shouldReloadForStaleChunk(
  error: Error,
  lastBuildId: string | null,
  buildId: string
): boolean {
  return isStaleChunkError(error) && lastBuildId !== buildId
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

/** The build this tab last tried to recover from, or null if it has not tried. */
export function readStaleChunkReload(): string | null {
  return sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)
}

export function rememberStaleChunkReload(buildId: string): void {
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, buildId)
}
