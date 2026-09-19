// Reverse proxy to PostHog so analytics ride our own origin and ad blockers
// don't see PostHog's domain. Replaces the next.config rewrite (dropped under
// output: 'export') and is our only Function; everything else is static.

const ASSETS_HOST = 'https://us-assets.i.posthog.com'
const INGEST_HOST = 'https://us.i.posthog.com'

export const onRequest: PagesFunction = async (context) => {
  const { request, params } = context

  // Catch-all segments: array for a/b, string for a, undefined for the bare path.
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  // Prefixes per PostHog's Cloudflare recipe, minus its leading slash — `path`
  // is rebuilt from segments, so `/static/` would never match.
  const isAsset = path.startsWith('static/') || path.startsWith('array/')
  const search = new URL(request.url).search

  return fetch(`${isAsset ? ASSETS_HOST : INGEST_HOST}/${path}${search}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow', // resolve redirects server-side so the browser never sees PostHog's domain
  })
}
