/** @type {import('next').NextConfig} */
const nextConfig = {
  // API 路由代理到 server 目录
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
