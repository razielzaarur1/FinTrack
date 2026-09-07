/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  swcMinify: true,
  
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.API_GATEWAY_INTERNAL_URL || 'http://api-gateway:3000/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
