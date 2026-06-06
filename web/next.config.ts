import type { NextConfig } from 'next'

const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  ...(process.env.NODE_ENV === 'development' && allowedDevOrigins?.length
    ? { allowedDevOrigins }
    : {}),

  async rewrites() {
    return [
      {
        source: '/x8m2k/:path*',
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'}/:path*`,
      },
    ]
  },
}

export default nextConfig
