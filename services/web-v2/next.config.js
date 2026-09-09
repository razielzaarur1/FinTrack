const apiGatewayUrl = process.env.INTERNAL_API_URL || process.env.API_GATEWAY_URL || 'http://api-gateway:3000';

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
        destination: `${apiGatewayUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
