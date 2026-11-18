#!/usr/bin/env node
/**
 * 查看 / 重试 AI 评估草稿队列（只操作 ai_draft_jobs 表）
 *
 * 用法：
 *   npm run ai:queue                 # 状态统计 + 最近 20 条任务
 *   npm run ai:queue -- --retry-failed   # 把所有失败任务重新排队
 *   npm run ai:queue -- --limit=50
 *
 * 说明：后台扫描由 Next 服务进程内的 worker 执行（每 15s），
 * 本脚本只做查看/重置，不需要独立进程。
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function loadEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(process.cwd(), name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      if (process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

loadEnv();

const args = process.argv.slice(2);
const retryFailed = args.includes('--retry-failed');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 20) : 20;

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('未配置 DATABASE_URL');
  process.exit(1);
}

(async () => {
  const pool = new Pool({
    connectionString,
    ssl: (process.env.PGSSLMODE || '').toLowerCase() === 'disable' ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  try {
    const exists = await pool.query("select to_regclass('public.ai_draft_jobs') as t");
    if (!exists.rows[0].t) {
      console.log('队列表 ai_draft_jobs 尚未创建（说明还没有评估提交触发过入队）。');
      return;
    }

    if (retryFailed) {
      const now = new Date().toISOString();
      const res = await pool.query(
        `UPDATE ai_draft_jobs
            SET status = 'pending', attempts = 0, "nextRunAt" = $1, "lockedAt" = '', "updatedAt" = $1
          WHERE status = 'failed'`,
        [now]
      );
      console.log(`已重新排队 ${res.rowCount} 条失败任务`);
    }

    const stats = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM ai_draft_jobs GROUP BY status ORDER BY status`
    );
    console.log('\n== 队列状态 ==');
    if (stats.rows.length === 0) console.log('  （空）');
    stats.rows.forEach((r) => console.log(`  ${r.status}: ${r.count}`));

    const jobs = await pool.query(
      `SELECT id, "recordId", status, attempts, "nextRunAt", "lockedAt", "lastError", "createdAt", "updatedAt"
         FROM ai_draft_jobs ORDER BY "createdAt" DESC LIMIT $1`,
      [limit]
    );
    console.log(`\n== 最近 ${jobs.rows.length} 条任务 ==`);
    jobs.rows.forEach((r) => {
      const err = r.lastError ? ` | error=${String(r.lastError).slice(0, 80)}` : '';
      console.log(
        `  [${r.status}] record=${r.recordId} attempts=${r.attempts} ` +
          `next=${r.nextRunAt || '-'} created=${r.createdAt}${err}`
      );
    });
  } finally {
    await pool.end();
  }
})().catch((err) => {
  console.error('队列查询失败:', err.message);
  process.exit(1);
});
