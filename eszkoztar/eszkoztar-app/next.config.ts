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
      {
        source: '/tablazatkezelo',
        destination: 'https://tablazatkezelo.vercel.app/tablazatkezelo',
      },
      {
        source: '/tablazatkezelo/:path*',
        destination: 'https://tablazatkezelo.vercel.app/tablazatkezelo/:path*',
      },
       {
        source: '/kollazskeszito',
        destination: 'https://kollazskeszito.vercel.app/kollazskeszito',
      },
      {
        source: '/kollazskeszito/:path*',
        destination: 'https://kollazskeszito.vercel.app/kollazskeszito/:path*',
      },
    ];
  },
};

export default nextConfig;