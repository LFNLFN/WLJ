/**
 * 全局错误兜底（Next.js instrumentation hook，服务启动时执行一次）。
 *
 * 为什么需要它：线上曾经出现过「数据库连接被重置 → 进程直接退出 → pm2 重启 704 次」。
 * 根因（已修）是 pg 连接池漏了 'error' 监听；这里再加一层网：
 * 任何一处没接住的 socket 错误 / 未处理 Promise 都只记录日志，不让整个服务退出。
 *
 * 想恢复「一有未捕获异常就退出」的严格行为：设置环境变量 WLJ_STRICT_CRASH=1 即可。
 */
export async function register() {
  // 只在 Node 运行时安装（middleware 走 Edge Runtime，没有 process.on）
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const g = globalThis as unknown as { __wljGlobalErrorHandlers?: boolean };
  if (g.__wljGlobalErrorHandlers) return;
  g.__wljGlobalErrorHandlers = true;

  if (process.env.WLJ_STRICT_CRASH === '1') {
    console.warn('[wlj] WLJ_STRICT_CRASH=1：未捕获异常仍会让进程退出（已跳过全局兜底）');
    return;
  }

  process.on('uncaughtException', (err) => {
    console.error('[wlj] uncaughtException（已记录，服务继续运行，避免 pm2 反复重启）:', err);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[wlj] unhandledRejection（已记录，服务继续运行）:', reason);
  });

  console.log('[wlj] 全局错误兜底已安装：uncaughtException / unhandledRejection 只记录不退出');
}
