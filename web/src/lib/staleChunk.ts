import { STALE_CHUNK_REFRESH_PARAM, STALE_CHUNK_RELOAD_KEY } from './constants'

// A deploy removes the chunk an open tab asks for; navigating again picks up the new
// build. Two facts with different lifetimes: which build we last tried this from (the
// loop guard, in session storage) and whether the navigation just made was ours (the URL).

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

// Recover only from a navigation we have not already made. The marker says one just
// brought us here — only a successful page mount strips it — and the build id says we
// already tried this one. Either way, repeating cannot help; a later deploy is a
// different build, arriving without a marker, and recovers normally.
export function shouldReloadForStaleChunk(
  error: Error,
  { href, lastBuildId, buildId }: { href: string; lastBuildId: string | null; buildId: string }
): boolean {
  if (!isStaleChunkError(error)) return false
  return !hasRefreshMarker(href) && lastBuildId !== buildId
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
