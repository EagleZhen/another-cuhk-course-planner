import { execFileSync } from 'node:child_process'
import { withPostHogConfig } from '@posthog/nextjs-config'
import type { NextConfig } from 'next'

// Production-only, and the switch itself: no key, no maps — as on local builds and previews.
const posthogPersonalApiKey = process.env.POSTHOG_PERSONAL_API_KEY

const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Commit SHA of this build, surfaced to analytics (see instrumentation-client) so an
// error traces to the deployed code. 'unknown' if git is absent, never failing the build.
function resolveBuildId(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD']).toString().trim()
  } catch {
    return 'unknown'
  }
}

const nextConfig: NextConfig = {
  // Static export: assets served by Cloudflare's static layer, not a Function.
  // See docs/decisions.md. The PostHog rewrite moved to functions/x8m2k/[[path]].ts
  // (rewrites() aren't supported here); next/image needs unoptimized without a server.
  output: 'export',
  images: { unoptimized: true },

  env: { NEXT_PUBLIC_BUILD_ID: resolveBuildId() },

  turbopack: {
    root: process.cwd(),
  },

  ...(process.env.NODE_ENV === 'development' && allowedDevOrigins?.length
    ? { allowedDevOrigins }
    : {}),
}

// Uploads source maps so stack traces name real files, then deletes them before the export
// (finalize-source-maps.mts clears the rest). Must stay outermost: nested, it silently no-ops.
export default withPostHogConfig(nextConfig, {
  personalApiKey: posthogPersonalApiKey ?? '',
  projectId: process.env.POSTHOG_PROJECT_ID,
  sourcemaps: {
    enabled: Boolean(posthogPersonalApiKey),
    deleteAfterUpload: true,
  },
})
