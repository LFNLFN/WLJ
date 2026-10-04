import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { getDb, withDbRetry } from '@/lib/api/db';

export const runtime = 'nodejs';

/**
 * ⚠️ 必须强制动态，否则 Next 会把 GET 路由处理函数「静态缓存」掉：
 * 实测线上响应头是 x-nextjs-cache: HIT —— 数据库已经连不上了，健康检查还在返回 ok，
 * 运维（包括 scripts/setup-pg.sh）就被它骗了。这里每次都真的去数据库跑一次 SELECT 1。
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * 当前进程实际在跑的构建指纹（Next 构建时写进 .next/BUILD_ID）。
 *
 * 为什么需要它：本项目是**人工部署**（服务器上 git pull → build → 重启），反复出现
 * "代码修好了、线上还是旧版本"，以前只能拿某个新字段/新行为去猜是不是部署了。
 * 有了这个字段，`curl /api/health | grep build` 和本地 `cat .next/BUILD_ID` 一对就知道。
 * （不是敏感信息：页面 HTML 里的 /_next/static/<BUILD_ID>/ 本来就带着它。）
 */
function readBuildId(): string {
  if (process.env.NODE_ENV !== 'production') return 'dev';
  try {
    return fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

const BUILD_ID = readBuildId();

/** 日志/返回里打码，避免把内网 IP、连接串暴露给外部 */
function sanitize(msg: unknown): string {
  return String(msg ?? '')
    .replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://***')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '***');
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

/** 健康检查：真实探活数据库 + 暴露进程信息（pid / 运行时长用来判断服务是否在反复重启） */
export async function GET() {
  const startedAt = Date.now();
  const base = {
    db: 'postgresql',
    build: BUILD_ID,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
  };

  try {
    const db = await getDb();
    // 探活只跑一次，不要重试，避免把「现在到底通不通」掩盖掉
    await withDbRetry(() => db.query('SELECT 1'), 1);

    return NextResponse.json(
      {
        status: 'ok',
        ...base,
        dbLatencyMs: Date.now() - startedAt,
        pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount },
      },
      { headers: NO_STORE }
    );
  } catch (err: any) {
    console.error('[health] 数据库探活失败:', err);

    return NextResponse.json(
      {
        status: 'error',
        ...base,
        dbLatencyMs: Date.now() - startedAt,
        error: { code: err?.code || 'UNKNOWN', message: sanitize(err?.message) },
      },
      { status: 503, headers: NO_STORE }
    );
  }
}
