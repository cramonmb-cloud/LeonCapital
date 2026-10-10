import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard',
        destination: '/inicio',
        permanent: false,
      },
      {
        source: '/dashboard/:path*',
        destination: '/inicio/:path*',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
