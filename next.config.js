/** @type {import('next').NextConfig} */
const nextConfig = {
  // API 路由由 Next.js API Routes 处理
  // 开发模式下 next dev 会自动处理 /api/* 路由

  // src/instrumentation.ts：安装全局错误兜底（uncaughtException / unhandledRejection 只记录不退出）。
  // Next 14 需要用这个开关显式启用（Next 15 起默认开启）。
  experimental: {
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
