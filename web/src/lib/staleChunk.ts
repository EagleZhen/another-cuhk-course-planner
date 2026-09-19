import { analytics } from './analytics'
import { STALE_CHUNK_REFRESH_PARAM, STALE_CHUNK_RELOAD_KEY } from './constants'

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? null

// A deploy retires the chunk an open tab asks for; navigating again picks up the new build.

// PostHog groups these by error.name, and our events show this string.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

// Recover only from a navigation we have not already made: the URL marker says one just
// brought us here (only a page that mounts strips it), and the recorded build id says we
// already tried this one. Repeating either cannot help. A later deploy is a different
// build, arriving without a marker, and recovers normally.
export function shouldReloadForStaleChunk({
  href,
  lastBuildId,
  buildId,
}: {
  href: string
  lastBuildId: string | null
  /** Null when the build had no commit to name it; the marker is then the whole guard. */
  buildId: string | null
}): boolean {
  if (hasRefreshMarker(href)) return false
  return buildId === null || lastBuildId !== buildId
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

/** The build this tab last tried to recover from, or null if it has not tried. */
export function readStaleChunkReload(): string | null {
  return sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)
}

export function rememberStaleChunkReload(buildId: string): void {
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, buildId)
}

// Split from the recovery below because a React boundary must answer this while
// rendering, before it is allowed to navigate.
export function canRecoverFromStaleChunk(error: Error): boolean {
  return (
    // Checked first, so no other error pays for the storage read below.
    isStaleChunkError(error) &&
    shouldReloadForStaleChunk({
      href: window.location.href,
      lastBuildId: readStaleChunkReload(),
      buildId: BUILD_ID,
    })
  )
}

// Decides and acts in one call, for a caller that has no separate render to gate.
export function recoverFromStaleChunk(error: Error): boolean {
  if (!canRecoverFromStaleChunk(error)) return false

  if (BUILD_ID) rememberStaleChunkReload(BUILD_ID)
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
