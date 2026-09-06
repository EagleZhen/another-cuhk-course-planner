// A deploy removes the chunk an open tab asks for. Reloading fetches the new build and
// fixes it — but only once, or a genuinely broken build would reload forever.

// error.name is what PostHog groups these under, and what our own events show.
export function isStaleChunkError(error: Error): boolean {
  return error.name === 'ChunkLoadError'
}

export function shouldReloadForStaleChunk(error: Error, alreadyReloaded: boolean): boolean {
  return isStaleChunkError(error) && !alreadyReloaded
}
