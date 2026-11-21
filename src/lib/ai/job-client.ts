'use client';

/**
 * Web 端 AI 生成任务客户端。
 *
 * 为什么不用同步接口：
 *   教案/训练计划生成通常需要 40–90 秒，而站点前面的反向代理（nginx）默认
 *   60 秒左右就会返回一张 HTML 错误页（502/504）。前端直接 res.json() 会报
 *   `Unexpected token '<', "<html> <h"... is not valid JSON`。
 *
 * 这里复用小程序已经在用的 ai_generation_jobs 队列：
 *   1. POST /api/ai-jobs 创建任务（立即返回）
 *   2. 每 2.5 秒 GET /api/ai-jobs/[id] 查询
 *   3. done 拿结果 / failed 显示错误
 */

export type AiJobType = 'lesson-plan' | 'training-plan' | 'course-week-summary';

export interface AiJob {
  id: string;
  type?: string;
  status: 'pending' | 'running' | 'done' | 'failed' | string;
  result?: any;
  error?: string;
}

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 240_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 读取响应：兼容反向代理/网关返回的 HTML 错误页 */
async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    if (res.status === 401) throw new Error('登录已过期，请刷新页面后重新登录');
    if (res.status === 403) throw new Error('当前账号没有生成权限');
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      throw new Error(`服务器繁忙或请求超时（${res.status}），请稍后重试`);
    }
    const brief = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    throw new Error(`服务器返回异常（${res.status}）${brief ? '：' + brief : ''}`);
  }
}

export async function createAiJob(type: AiJobType, payload: Record<string, any>): Promise<string> {
  const res = await fetch('/api/ai-jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, payload }),
  });
  const data = await readJson(res);
  if (!res.ok || !data?.id) {
    throw new Error(data?.error || '创建 AI 生成任务失败，请稍后重试');
  }
  return String(data.id);
}

export async function getAiJob(id: string): Promise<AiJob> {
  const res = await fetch(`/api/ai-jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || '查询 AI 生成任务失败');
  return data as AiJob;
}

/**
 * 创建任务并轮询到完成。
 * @returns 任务 result（教案为 {title, content, meta}，训练计划为 {plan, meta}）
 */
export async function runAiJob(
  type: AiJobType,
  payload: Record<string, any>,
  options?: { timeoutMs?: number; onProgress?: (job: AiJob) => void }
): Promise<any> {
  const id = await createAiJob(type, payload);
  const timeoutMs = options?.timeoutMs || POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let consecutiveErrors = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let job: AiJob;
    try {
      job = await getAiJob(id);
      consecutiveErrors = 0;
    } catch (err: any) {
      const message = String(err?.message || '');
      // 登录过期/权限问题直接失败；网关偶发 502/504 连续 3 次才放弃
      if (/登录已过期|没有生成权限/.test(message)) throw err;
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) throw err;
      continue;
    }

    options?.onProgress?.(job);

    if (job.status === 'done') {
      if (!job.result) throw new Error('生成结果为空，请稍后重试');
      return job.result;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'AI 生成失败，请稍后重试');
    }
  }

  throw new Error('AI 生成超时（超过 4 分钟），请稍后重试');
}
