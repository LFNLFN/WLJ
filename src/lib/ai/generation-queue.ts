import { getDb, generateId } from '../api/db';
import { generateLessonPlanContent } from './lesson-plan-generator';
import { generateTrainingPlanContent } from './training-plan-generator';

/**
 * 小程序 AI 生成任务队列（教案 / 训练计划）
 *
 * 为什么需要队列：小程序 wx.request 默认 60 秒超时，而教案/训练计划生成
 * 可能需要 40–90 秒。因此小程序只负责“创建任务 + 轮询”，生成在服务端后台完成。
 */

export type GenerationType = 'lesson-plan' | 'training-plan';

const TABLE_KEY = '__wljAiGenerationTableReady';
const WORKER_KEY = '__wljGenerationWorkerStarted';
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id TEXT PRIMARY KEY,
  type TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  result TEXT DEFAULT '',
  error TEXT DEFAULT '',
  attempts INTEGER DEFAULT 0,
  "lockedAt" TEXT DEFAULT '',
  "createdBy" TEXT DEFAULT '',
  "createdAt" TEXT DEFAULT '',
  "updatedAt" TEXT DEFAULT ''
)`;

function nowIso() {
  return new Date().toISOString();
}

function intEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function ensureTable(db: any): Promise<void> {
  const g = globalThis as unknown as Record<string, Promise<void> | undefined>;
  if (!g[TABLE_KEY]) {
    g[TABLE_KEY] = (async () => {
      await db.query(CREATE_TABLE_SQL);
      await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status ON ai_generation_jobs (status, "createdAt")`);
    })().catch((err) => {
      g[TABLE_KEY] = undefined;
      throw err;
    });
  }
  await g[TABLE_KEY];
}

export async function enqueueGenerationJob(
  type: GenerationType,
  payload: any,
  createdBy: string
): Promise<string> {
  const db = await getDb();
  await ensureTable(db);
  const id = generateId();
  const now = nowIso();
  await db.query(
    `INSERT INTO ai_generation_jobs (id, type, payload, status, attempts, "createdAt", "updatedAt", "createdBy")
     VALUES ($1, $2, $3, 'pending', 0, $4, $4, $5)`,
    [id, type, JSON.stringify(payload || {}), now, createdBy || '']
  );
  startGenerationWorker();
  return id;
}

async function recoverStale(db: any) {
  const cutoff = new Date(Date.now() - LOCK_TIMEOUT_MS).toISOString();
  await db.query(
    `UPDATE ai_generation_jobs
        SET status = 'pending', "lockedAt" = '', "updatedAt" = $2
      WHERE status = 'running' AND "lockedAt" <> '' AND "lockedAt" < $1`,
    [cutoff, nowIso()]
  );
}

async function claimJob(db: any) {
  const now = nowIso();
  const result = await db.query(
    `UPDATE ai_generation_jobs
        SET status = 'running', "lockedAt" = $1, "updatedAt" = $1, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM ai_generation_jobs
         WHERE status = 'pending' AND "updatedAt" <= $1
         ORDER BY "createdAt" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
      )
      RETURNING *`,
    [now]
  );
  return result.rows[0] || null;
}

async function finish(
  db: any,
  id: string,
  status: 'done' | 'failed' | 'pending',
  result: string,
  error: string
) {
  await db.query(
    `UPDATE ai_generation_jobs
        SET status = $2, result = $3, error = $4, "lockedAt" = '', "updatedAt" = $5
      WHERE id = $1`,
    [id, status, result, error.slice(0, 800), nowIso()]
  );
}

async function processJob(db: any, job: any) {
  const startedAt = Date.now();
  try {
    let payload: any = {};
    try {
      payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : (job.payload || {});
    } catch {
      payload = {};
    }

    let result: any;
    if (job.type === 'lesson-plan') {
      result = await generateLessonPlanContent(payload);
    } else if (job.type === 'training-plan') {
      result = await generateTrainingPlanContent(db, payload);
    } else {
      throw new Error(`未知的任务类型: ${job.type}`);
    }

    await finish(db, job.id, 'done', JSON.stringify(result), '');
    console.log(`[ai-generation] ${job.type} job=${job.id} 完成，耗时=${Date.now() - startedAt}ms`);
  } catch (err: any) {
    const message = String(err?.message || err);
    const attempts = Number(job.attempts) || 1;
    const maxAttempts = intEnv('AI_GENERATION_MAX_ATTEMPTS', 2);
    if (attempts >= maxAttempts) {
      await finish(db, job.id, 'failed', '', message);
      console.error(`[ai-generation] ${job.type} job=${job.id} 失败（${attempts} 次）: ${message}`);
      return;
    }
    await finish(db, job.id, 'pending', '', message);
    // 回退 30 秒后重试
    await db.query(
      `UPDATE ai_generation_jobs SET "lockedAt" = '', "updatedAt" = $2 WHERE id = $1`,
      [job.id, new Date(Date.now() + 30_000).toISOString()]
    );
    console.warn(`[ai-generation] ${job.type} job=${job.id} 第 ${attempts} 次失败，30s 后重试: ${message}`);
  }
}

let processing = false;

export async function runGenerationWorkerOnce(): Promise<boolean> {
  if (processing) return false;
  processing = true;
  try {
    const db = await getDb();
    await ensureTable(db);
    await recoverStale(db);
    const job = await claimJob(db);
    if (!job) return false;
    await processJob(db, job);
    return true;
  } catch (err: any) {
    console.error('[ai-generation] 扫描失败:', err?.message || err);
    return false;
  } finally {
    processing = false;
  }
}

export function startGenerationWorker(): void {
  if (process.env.AI_GENERATION_WORKER === '0') return;
  if (typeof window !== 'undefined') return;

  const g = globalThis as unknown as Record<string, boolean | undefined>;
  if (g[WORKER_KEY]) return;
  g[WORKER_KEY] = true;

  const interval = intEnv('AI_GENERATION_INTERVAL_MS', 5000);
  const first = setTimeout(() => void runGenerationWorkerOnce(), 2_000);
  const timer = setInterval(() => void runGenerationWorkerOnce(), interval);
  if (typeof (first as any).unref === 'function') (first as any).unref();
  if (typeof (timer as any).unref === 'function') (timer as any).unref();
  console.log(`[ai-generation] worker 已启动，扫描间隔 ${interval}ms`);
}
