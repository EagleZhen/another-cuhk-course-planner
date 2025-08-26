import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/x8m2k/:path*',
        destination: `${process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'}/:path*`
      }
    ]
  }
};

export default nextConfig;
