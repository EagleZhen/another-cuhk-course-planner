import { analytics } from './analytics'
import { STALE_CHUNK_REFRESH_PARAM } from './constants'

// A deploy retires the chunk an open tab asks for; navigating again picks up the new build.

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

// Recovery navigates to this instead of reloading, so the marker arrives with the new
// page. Written into the page we are leaving, it would show the notice a moment early.
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

// Split from the recovery below because a React boundary must answer this while
// rendering, before it is allowed to navigate.
//
// The marker is the whole loop guard: only a page that mounts strips it, so a failure that
// never mounts keeps it and refuses a second try. That suffices because deploys are atomic
// and content-hashed — a live build never 404s its own chunks, so every stale-chunk failure
// is a retired-build document one reload replaces. A same-build loop guard would be needed
// only if the app left atomic static hosting.
export function canRecoverFromStaleChunk(error: Error): boolean {
  return isStaleChunkError(error) && !hasRefreshMarker(window.location.href)
}

// Decides and acts in one call, for a caller that has no separate render to gate.
export function recoverFromStaleChunk(error: Error): boolean {
  if (!canRecoverFromStaleChunk(error)) return false

  // Handled — the user sees a reload, not a failure, so this is not one to triage.
  analytics.chunkLoadRecovered()
  window.location.replace(withRefreshMarker(window.location.href))
  return true
}

// A chunk failing before hydration leaves no boundary mounted, so React never sees it.
// Registered ahead of posthog's lazily loaded autocapture, so a recovered chunk stops
// here and reports chunk_load_recovered instead of an exception.
export function registerStaleChunkRecovery(): void {
  const recover = (event: Event, thrown: unknown) => {
    if (thrown instanceof Error && recoverFromStaleChunk(thrown)) event.stopImmediatePropagation()
  }

  window.addEventListener('error', (event) => recover(event, event.error))
  window.addEventListener('unhandledrejection', (event) => recover(event, event.reason))
}
