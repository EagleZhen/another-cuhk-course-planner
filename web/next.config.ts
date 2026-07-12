import type { NextConfig } from 'next'

const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  // Static export: assets served by Cloudflare's static layer, not a Function.
  // See docs/decisions.md. The PostHog rewrite moved to functions/x8m2k/[[path]].ts
  // (rewrites() aren't supported here); next/image needs unoptimized without a server.
  output: 'export',
  images: { unoptimized: true },

  turbopack: {
    root: process.cwd(),
  },

  ...(process.env.NODE_ENV === 'development' && allowedDevOrigins?.length
    ? { allowedDevOrigins }
    : {}),
}

export default nextConfig
