import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/vonalkodolvaso',
        destination: 'https://vonalkodolvaso.vercel.app/vonalkodolvaso',
      },
      {
        source: '/vonalkodolvaso/:path*',
        destination: 'https://vonalkodolvaso.vercel.app/vonalkodolvaso/:path*',
      },
    ];
  },
};

export default nextConfig;