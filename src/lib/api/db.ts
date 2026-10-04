import { Pool, PoolClient } from 'pg';

type DbConfig = {
  type: 'postgres';
  pg: Pool;
};

/**
 * ⚠️ 连接池必须是「整个进程唯一」的：
 * Next.js 打包会把本文件内联进多个路由 bundle（实测 .next/server 里有 4 份），
 * 如果只在模块作用域缓存，一个进程就会创建 4 个连接池、各自 10 条连接，
 * 既浪费又让「谁持有连接」变得不可控。挂到 globalThis 上可以保证只有一份。
 */
const POOL_KEY = '__wljPgPool';

/** 连接池参数（可用环境变量覆盖，避免线上只能改代码） */
function intEnv(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/**
 * 「连接被重置 / 服务端重启 / 正在启动关闭」这类错误：不是业务错误，重试一次通常就好了。
 * 详见 README「排障：登录报 read ECONNRESET / 服务反复重启」。
 */
const TRANSIENT_CODES = new Set([
  'ECONNRESET', // 连接被重置（最常见：数据库重启 / 中间设备掐断空闲连接）
  'EPIPE',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '57P01', // admin_shutdown：数据库被重启 / pg_terminate_backend
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now：数据库正在启动
]);

export function isTransientDbError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  if (TRANSIENT_CODES.has(code)) return true;
  const message = String(err.message || '');
  return /ECONNRESET|EPIPE|Connection terminated|terminating connection|the database system is (starting up|shutting down)|Connection terminated unexpectedly/i.test(
    message
  );
}

/** PostgreSQL 连接配置（只允许连「线上数据库」，绝不回退到 localhost） */
function getPoolOptions() {
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connStr) {
    throw new Error(
      '未配置 DATABASE_URL：本项目只使用线上 PostgreSQL，不支持本地数据库。' +
        '请在 .env.local（本地开发）或阿里云服务器的环境变量中配置线上数据库连接串。'
    );
  }

  const sslMode = (process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: false };

  const statementTimeout = intEnv('PG_STATEMENT_TIMEOUT_MS', 0);

  return {
    connectionString: connStr,
    ssl,
    // 池大小：多个 Next 进程/实例时注意别超过数据库 max_connections
    max: intEnv('PG_POOL_MAX', 10),
    // 建立连接的超时：不设的话数据库不可达时请求会一直挂着（实测出现过挂 20s 的请求）
    connectionTimeoutMillis: intEnv('PG_CONNECT_TIMEOUT_MS', 10_000),
    // 空闲超过 10s 就断开重连，避免捡到一条已经被数据库/云防火墙掐断的死连接
    idleTimeoutMillis: intEnv('PG_IDLE_TIMEOUT_MS', 10_000),
    // 单条 SQL 最长执行时间（0 = 不限制，默认不限制，避免影响 AI 侧的大查询）
    ...(statementTimeout > 0 ? { statement_timeout: statementTimeout } : {}),
    // TCP keepalive：让中间设备知道这条连接还活着
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // 在数据库 pg_stat_activity 里一眼看出这是应用连的（排障用）
    application_name: process.env.PG_APP_NAME || `wlj-next-${process.pid}`,
  };
}

function createPool(): Pool {
  const pool = new Pool(getPoolOptions());

  // ⚠️ 必须监听 pool 的 'error'：pg-pool 遇到「空闲连接被服务端/中间设备重置」时会
  // emit('error')，EventEmitter 在没有监听器时会把异常直接抛出去 → 进程退出 → pm2 反复重启。
  pool.on('error', (err: any) => {
    console.error(
      `[db] 空闲连接出错（已忽略，服务继续运行）: ${err?.code ? `[${err.code}] ` : ''}${err?.message}`
    );
  });

  // ⚠️ 更关键的一层：pg-pool 在把 client 交给查询前会 removeListener('error', idleListener)
  // （node_modules/pg-pool/index.js 的 _acquireClient），也就是说「查询进行中」的 client 是
  // 没有任何 error 监听的——此时连接被重置，client.emit('error') 同样会抛未捕获异常让进程退出。
  // 这里在新建连接时给每个 client 永久挂一个监听，堵住这个洞。
  // （pool 的 'connect' 事件在 removeListener 之前触发，所以监听一定能挂上。）
  pool.on('connect', (client: PoolClient) => {
    client.on('error', (err: any) => {
      console.error(
        `[db] 查询期间连接出错（已忽略，交给上层重试）: ${err?.code ? `[${err.code}] ` : ''}${err?.message}`
      );
    });
  });

  return pool;
}

export async function getDb(): Promise<Pool> {
  const g = globalThis as unknown as Record<string, DbConfig | undefined>;

  if (!g[POOL_KEY]) {
    const pool = createPool();
    g[POOL_KEY] = { type: 'postgres', pg: pool };
    console.log(`✅ PostgreSQL 数据库连接池已创建（application_name=${pool.options.application_name}）`);
  }

  return (g[POOL_KEY] as DbConfig).pg;
}

/**
 * 跑一段数据库操作，遇到「连接被重置」这类瞬时错误自动重试一次。
 * 用途：数据库重启 / 网络抖动时，不要把 ECONNRESET 直接变成用户看到的 500。
 */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastErr: any;

  for (let i = 0; i < Math.max(1, attempts); i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!isTransientDbError(err) || i === attempts - 1) throw err;
      console.warn(
        `[db] 瞬时连接错误，重试第 ${i + 2} 次: ${err?.code ? `[${err.code}] ` : ''}${err?.message}`
      );
      await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
    }
  }

  throw lastErr;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function parseRow(row: any): any {
  if (!row) return null;
  const result = { ...row };
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages', 'rawdata'].forEach((field) => {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch (e) { result[field] = []; }
    }
  });
  result._id = row.id;
  // 兼容全小写数据库列名 → 驼峰命名（student_scale_records 表使用全小写列名）
  const camelCaseMap: Record<string, string> = {
    studentname: 'studentName',
    scalename: 'scaleName',
    evaluationdate: 'evaluationDate',
    rawreportid: 'rawReportId',
    rawdata: 'rawData',
    createdat: 'createdAt',
    updatedat: 'updatedAt',
  };
  for (const [lower, camel] of Object.entries(camelCaseMap)) {
    if (result[lower] !== undefined && result[camel] === undefined) {
      result[camel] = result[lower];
    }
  }
  return result;
}

export function parseRows(rows: any[]): any[] {
  return rows.map(parseRow);
}

export function prepareSaveData(body: any): any {
  const data = { ...body };
  if (data._id) { data.id = data._id; delete data._id; }
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages', 'rawdata'].forEach((field) => {
    if (data[field] && Array.isArray(data[field])) data[field] = JSON.stringify(data[field]);
  });
  return data;
}
