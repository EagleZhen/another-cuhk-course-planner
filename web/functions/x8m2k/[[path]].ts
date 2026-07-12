// Reverse proxy to PostHog so analytics ride our own origin and ad blockers
// don't see PostHog's domain. Replaces the next.config rewrite (dropped under
// output: 'export') and is our only Function; everything else is static.
//
// Single-host to match the old rewrite exactly; splitting the assets host is #177.

interface Env {
  POSTHOG_HOST?: string // optional binding to override the region host
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context
  const host = env.POSTHOG_HOST ?? 'https://us.i.posthog.com'

  // Catch-all segments: array for a/b, string for a, undefined for the bare path.
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  const search = new URL(request.url).search

  return fetch(`${host}/${path}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow', // resolve redirects server-side so the browser never sees PostHog's domain
  })
}
