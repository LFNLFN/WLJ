import { getDb, generateId } from '../api/db';
import { ensureSchema } from '../api/schema';
import { generateAssessmentDraft, formatDraftRecommendations } from './assessment-draft';

/**
 * AI 评估草稿的轻量后台队列（PostgreSQL 表 + 进程内定时扫描）
 *
 * 为什么不用 Redis / BullMQ：
 *   - 现网只有一台应用服务器、一个 PostgreSQL；多引入一个中间件不划算。
 *   - 用 `ai_draft_jobs` 表 + `FOR UPDATE SKIP LOCKED` 领取任务，天然支持
 *     多进程/重启恢复，不丢任务。
 *
 * 流程：
 *   小程序提交评估 → enqueueAiDraftJob(recordId)
 *   → 定时器每 15s 领一条 pending
 *   → 调方舟生成草稿 → 写入 aiDraft* 字段
 *
 * 开关：
 *   AI_DRAFT_AUTO=0                 关闭自动入队（手动按钮仍可用）
 *   AI_DRAFT_WORKER=0               关闭后台扫描
 *   AI_DRAFT_WORKER_INTERVAL_MS     扫描间隔，默认 15000
 *   AI_DRAFT_MAX_ATTEMPTS           最大尝试次数，默认 3
 */

const QUEUE_TABLE_KEY = '__wljAiDraftQueueTableReady';
const WORKER_KEY = '__wljAiDraftWorkerStarted';
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_draft_jobs (
  id TEXT PRIMARY KEY,
  "recordId" TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  "lastError" TEXT DEFAULT '',
  "nextRunAt" TEXT DEFAULT '',
  "lockedAt" TEXT DEFAULT '',
  "createdAt" TEXT DEFAULT '',
  "updatedAt" TEXT DEFAULT ''
)`;

const CREATE_INDEX_SQL = `CREATE INDEX IF NOT EXISTS idx_ai_draft_jobs_status
  ON ai_draft_jobs (status, "nextRunAt")`;

function nowIso() {
  return new Date().toISOString();
}

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function ensureQueueTable(db: any): Promise<void> {
  const g = globalThis as unknown as Record<string, Promise<void> | undefined>;
  if (!g[QUEUE_TABLE_KEY]) {
    g[QUEUE_TABLE_KEY] = (async () => {
      await db.query(CREATE_TABLE_SQL);
      await db.query(CREATE_INDEX_SQL);
    })().catch((err) => {
      g[QUEUE_TABLE_KEY] = undefined;
      throw err;
    });
  }
  await g[QUEUE_TABLE_KEY];
}

function draftConfigured(): boolean {
  return !!(
    process.env.ARK_API_KEY &&
    (process.env.ARK_DRAFT_MODEL_ENDPOINT || process.env.ARK_MODEL_ENDPOINT)
  );
}

/**
 * 提交评估后入队（幂等：同一条记录只排一次）。
 * 失败只打日志，绝不影响评估保存。
 */
export async function enqueueAiDraftJob(recordId: string): Promise<void> {
  try {
    if (!recordId) return;
    if (process.env.AI_DRAFT_AUTO === '0') return;
    if (!draftConfigured()) return;

    const db = await getDb();
    await ensureQueueTable(db);
    const now = nowIso();
    await db.query(
      `INSERT INTO ai_draft_jobs
         (id, "recordId", status, attempts, "lastError", "nextRunAt", "lockedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 'pending', 0, '', $3, '', $3, $3)
       ON CONFLICT ("recordId") DO UPDATE
         SET status = CASE WHEN ai_draft_jobs.status = 'failed' THEN 'pending' ELSE ai_draft_jobs.status END,
             attempts = CASE WHEN ai_draft_jobs.status = 'failed' THEN 0 ELSE ai_draft_jobs.attempts END,
             "nextRunAt" = CASE WHEN ai_draft_jobs.status = 'failed' THEN EXCLUDED."nextRunAt" ELSE ai_draft_jobs."nextRunAt" END,
             "lastError" = CASE WHEN ai_draft_jobs.status = 'failed' THEN '' ELSE ai_draft_jobs."lastError" END,
             "updatedAt" = EXCLUDED."updatedAt"`,
      [generateId(), recordId, now]
    );
    startDraftWorker();
  } catch (err: any) {
    console.warn('[ai-draft] 入队失败（忽略，不影响提交）:', err?.message || err);
  }
}

async function recoverStaleJobs(db: any): Promise<void> {
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  await db.query(
    `UPDATE ai_draft_jobs
        SET status = 'pending', "lockedAt" = '', "updatedAt" = $2
      WHERE status = 'running' AND "lockedAt" <> '' AND "lockedAt" < $1`,
    [cutoff, nowIso()]
  );
}

async function claimJob(db: any): Promise<any | null> {
  const now = nowIso();
  const result = await db.query(
    `UPDATE ai_draft_jobs
        SET status = 'running', "lockedAt" = $1, "updatedAt" = $1, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM ai_draft_jobs
         WHERE status = 'pending' AND ("nextRunAt" = '' OR "nextRunAt" <= $1)
         ORDER BY "createdAt" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [now]
  );
  return result.rows[0] || null;
}

async function finishJob(db: any, jobId: string, status: string, error: string, nextRunAt = '') {
  await db.query(
    `UPDATE ai_draft_jobs
        SET status = $2, "lastError" = $3, "nextRunAt" = $4, "lockedAt" = '', "updatedAt" = $5
      WHERE id = $1`,
    [jobId, status, error, nextRunAt, nowIso()]
  );
}

async function processJob(db: any, job: any): Promise<void> {
  const startedAt = Date.now();
  try {
    // 确保 aiDraft* 列存在（首次部署 / 新库）
    await ensureSchema();

    const found = await db.query(
      'SELECT id, "aiDraftSummary", rawdata FROM student_scale_records WHERE id = $1',
      [job.recordId]
    );
    const row = found.rows[0];
    if (!row) {
      await finishJob(db, job.id, 'done', '记录不存在（已跳过）');
      return;
    }
    if (row.aiDraftSummary) {
      await finishJob(db, job.id, 'done', '记录已有草稿（跳过）');
      return;
    }

    let raw: any = {};
    if (row.rawdata) {
      try {
        raw = typeof row.rawdata === 'string' ? JSON.parse(row.rawdata) : row.rawdata;
      } catch {
        raw = {};
      }
    }

    const draft = await generateAssessmentDraft(raw);
    const recommendationsText = formatDraftRecommendations(draft);
    const detail = {
      strengths: draft.strengths,
      difficulties: draft.difficulties,
      recommendations: draft.recommendations,
      redFlags: draft.redFlags,
      uncertainties: draft.uncertainties,
    };

    await db.query(
      `UPDATE student_scale_records
          SET "aiDraftSummary" = $2,
              "aiDraftRecommendations" = $3,
              "aiDraftDetail" = $4,
              "aiDraftStatus" = 'generated',
              "aiDraftMeta" = $5,
              "aiDraftAt" = $6,
              "aiDraftAcceptedAt" = '',
              "aiDraftAcceptedBy" = ''
        WHERE id = $1`,
      [
        job.recordId,
        draft.summary,
        recommendationsText,
        JSON.stringify(detail),
        JSON.stringify(draft.meta),
        new Date().toISOString().replace('T', ' ').slice(0, 19),
      ]
    );

    await finishJob(db, job.id, 'done', '');
    console.log(
      `[ai-draft-worker] 记录=${job.recordId} 完成 耗时=${Date.now() - startedAt}ms ` +
        `模型=${draft.meta.model} 校验=${draft.meta.numericCheck}`
    );
  } catch (err: any) {
    const message = String(err?.message || err).slice(0, 500);
    const attempts = Number(job.attempts) || 1;
    const maxAttempts = intEnv('AI_DRAFT_MAX_ATTEMPTS', 3);

    if (attempts >= maxAttempts) {
      await finishJob(db, job.id, 'failed', message);
      console.error(`[ai-draft-worker] 记录=${job.recordId} 失败（已达 ${attempts} 次）: ${message}`);
      return;
    }

    const backoff = [60_000, 5 * 60_000, 15 * 60_000][Math.min(attempts - 1, 2)];
    const nextRunAt = new Date(Date.now() + backoff).toISOString();
    await finishJob(db, job.id, 'pending', message, nextRunAt);
    console.warn(
      `[ai-draft-worker] 记录=${job.recordId} 第 ${attempts} 次失败，${Math.round(backoff / 1000)}s 后重试: ${message}`
    );
  }
}

let processing = false;

/** 执行一轮扫描：领取并处理 1 条任务。返回是否处理了任务。 */
export async function runDraftWorkerOnce(): Promise<boolean> {
  if (processing) return false;
  if (!draftConfigured()) return false;
  processing = true;
  try {
    const db = await getDb();
    await ensureQueueTable(db);
    await recoverStaleJobs(db);
    const job = await claimJob(db);
    if (!job) return false;
    await processJob(db, job);
    return true;
  } catch (err: any) {
    console.error('[ai-draft-worker] 扫描失败:', err?.message || err);
    return false;
  } finally {
    processing = false;
  }
}

/** 启动进程内定时扫描（幂等；多进程并发由数据库 SKIP LOCKED 兜底） */
export function startDraftWorker(): void {
  if (process.env.AI_DRAFT_WORKER === '0') return;
  if (typeof window !== 'undefined') return;

  const g = globalThis as unknown as Record<string, boolean | undefined>;
  if (g[WORKER_KEY]) return;
  g[WORKER_KEY] = true;

  const interval = intEnv('AI_DRAFT_WORKER_INTERVAL_MS', 15_000);
  const first = setTimeout(() => {
    void runDraftWorkerOnce();
  }, 3_000);
  const timer = setInterval(() => {
    void runDraftWorkerOnce();
  }, interval);

  if (typeof (first as any).unref === 'function') (first as any).unref();
  if (typeof (timer as any).unref === 'function') (timer as any).unref();

  console.log(`[ai-draft-worker] 已启动，扫描间隔 ${interval}ms`);
}
