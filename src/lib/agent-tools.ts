/**
 * 智能体（Agent）工具集
 *
 * 这些函数是"工具"的底层实现，会被服务端工具执行器
 * (src/lib/agent/execute.ts) 统一调度，也可以被 API 路由
 * /api/ai/tools 直接调用。
 *
 * 约定：
 * - 所有函数都对入参做校验，参数非法时抛出带中文说明的 Error
 * - 成功时返回 JSON 字符串（便于直接作为 LLM 的 tool 消息内容）
 * - 不做进程内缓存，保持无状态，方便在 Serverless 环境运行
 */

import path from 'path';
import fs from 'fs/promises';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { getDb } from './api/db';

const DEFAULT_ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const FETCH_TIMEOUT_MS = 30_000;

/** 带超时的 fetch，避免工具长时间挂起 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

// ---------------------------------------------------------------------------
// 1. 知识库检索
// ---------------------------------------------------------------------------

export interface KnowledgeItem {
  type: string;
  id?: string;
  title?: string;
  content?: string;
  source: string;
}

/** 库内知识检索：不依赖任何外部凭证，直接查业务库中的课程 / 量表 / 课堂记录 / 教案 / 知识库资料等 */
async function searchLocalKnowledge(keyword: string, limit: number): Promise<KnowledgeItem[]> {
  const db = await getDb();
  const like = `%${keyword}%`;
  const items: KnowledgeItem[] = [];

  const safeQuery = async (sql: string, params: unknown[]) => {
    try {
      return (await db.query(sql, params)).rows as any[];
    } catch {
      // 表不存在 / 列不匹配时静默跳过，不影响整体检索
      return [] as any[];
    }
  };

  const clip = (v: unknown, n = 500) => String(v ?? '').slice(0, n);

  for (const r of await safeQuery(
    `SELECT id, title, content FROM lesson_plans WHERE title ILIKE $1 OR content ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({ type: '教案', id: r.id, title: r.title, content: clip(r.content), source: 'lesson_plans' });
  }

  for (const r of await safeQuery(
    `SELECT id, title, content FROM training_plans WHERE title ILIKE $1 OR content ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({ type: '训练计划', id: r.id, title: r.title, content: clip(r.content), source: 'training_plans' });
  }

  for (const r of await safeQuery(
    `SELECT id, name, subject FROM courses WHERE name ILIKE $1 OR subject ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({ type: '课程', id: r.id, title: r.name, content: clip(r.subject), source: 'courses' });
  }

  for (const r of await safeQuery(
    `SELECT id, name, type FROM scale_templates WHERE name ILIKE $1 OR type ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({ type: '评估量表', id: r.id, title: r.name, content: clip(r.type), source: 'scale_templates' });
  }

  for (const r of await safeQuery(
    `SELECT id, courseName, content FROM class_records WHERE courseName ILIKE $1 OR content ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({ type: '课堂记录', id: r.id, title: r.courseName, content: clip(r.content), source: 'class_records' });
  }

  // 平台上「📚 知识库」上传的资料（/api/knowledge → knowledge_documents）
  for (const r of await safeQuery(
    `SELECT id, title, category, content FROM knowledge_documents WHERE title ILIKE $1 OR content ILIKE $1 OR category ILIKE $1 LIMIT $2`,
    [like, limit]
  )) {
    items.push({
      type: '知识库资料',
      id: r.id,
      title: r.title,
      content: clip(r.content),
      source: 'knowledge_documents',
    });
  }

  return items.slice(0, limit * 2);
}

/**
 * 火山方舟 API Key 的合法格式。
 * - 新版控制台：`ark-<uuid>-<5位后缀>`（此处不写具体示例，避免被密钥扫描误判为真实密钥）
 * - 早期控制台：纯 UUID
 * 这里只做粗校验，避免把明显写错的占位符当成真凭证；key 是否真的有效由接口返回 401 决定。
 */
const ARK_KEY_FORMAT =
  /^(?:ark-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}-[0-9a-zA-Z]{1,16}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;

/** 从（自建 / 兼容）知识库检索接口响应中尽力提取条目 */
function normalizeArkItems(data: any, limit: number): KnowledgeItem[] {
  const list = data?.data ?? data?.results ?? data?.result ?? [];
  const arr = Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : [];
  return arr.slice(0, limit).map((it: any) => ({
    type: '知识库',
    id: it?.id ?? it?.doc_id ?? undefined,
    title: it?.title ?? it?.doc_name ?? undefined,
    content: String(it?.content ?? it?.text ?? it?.chunk ?? it ?? '').slice(0, 500),
    source: 'ark',
  }));
}

/**
 * 从方舟「应用(Bot)」对话响应中提取知识库答案与引用片段。
 * 方舟 /bots/chat/completions 返回的是**生成后的回答**（非 chunk 检索），
 * 命中知识库时会在 message.references 里带上引用文档。
 */
function normalizeArkBotAnswer(data: any, query: string, limit: number): KnowledgeItem[] {
  const message = data?.choices?.[0]?.message ?? {};
  const items: KnowledgeItem[] = [];

  const rawRefs = message?.references ?? data?.references ?? [];
  const refs: any[] = Array.isArray(rawRefs)
    ? rawRefs
    : Array.isArray(rawRefs?.items)
      ? rawRefs.items
      : Array.isArray(rawRefs?.docs)
        ? rawRefs.docs
        : [];

  for (const ref of refs.slice(0, limit)) {
    const doc = ref?.doc ?? ref?.document ?? ref;
    items.push({
      type: '知识库引用',
      id: doc?.doc_id ?? doc?.id ?? undefined,
      title: doc?.title ?? doc?.doc_name ?? undefined,
      content: String(doc?.content ?? doc?.chunk ?? doc?.text ?? '').slice(0, 500),
      source: 'ark',
    });
  }

  const answer = String(message?.content ?? '').trim();
  if (answer) {
    items.unshift({ type: '知识库回答', title: query, content: answer.slice(0, 1000), source: 'ark' });
  }
  return items;
}

/**
 * 方舟「应用」标识格式：
 * - 早期控制台：`bot-<时间戳>-<随机串>`
 * - 新版控制台（智能体/Agent）：`agent-<时间戳>-<随机串>`
 */
const ARK_BOT_ID_FORMAT = /^(?:bot|agent)-[0-9a-zA-Z-]{6,}$/;

/** 托管智能体 / 会话 ID 格式 */
const ARK_AGENT_ID_FORMAT = /^agent-[0-9a-zA-Z-]{6,}$/;
const ARK_SESSION_ID_FORMAT = /^sesn-[0-9a-zA-Z-]{6,}$/;

interface ArkSearchResult {
  ok: boolean;
  items: KnowledgeItem[];
  notice?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 从 GET /sessions/{id}/events 的事件流里提取文本（agent.message / agent.thinking 等） */
function eventText(event: any): string {
  const content = event?.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((c: any) => (typeof c?.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * 方式一：火山方舟「托管智能体 (Managed Agents)」。这是方舟**唯一**能真正检索知识库的路径，
 * 知识库以 Skill（如 viking-knowledge-search）挂在智能体上。
 *
 * 协议（2026-06 预览版）：
 *   POST /sessions/{session_id}/events   { events:[{ type:'user.message', content:[{type:'text',text}] }] }
 *   GET  /sessions/{session_id}/events   轮询事件流，agent.message 即回答
 *
 * 注意：会话必须在创建时绑定凭证库(vault)，否则 Skill 检索会返回
 * "authentication_error / invalid api key"。
 */
async function searchViaManagedAgent(
  query: string,
  limit: number,
  apiKey: string,
  baseUrl: string
): Promise<ArkSearchResult> {
  const agentId = (process.env.ARK_AGENT_ID || '').trim();
  const environmentId = (process.env.ARK_ENVIRONMENT_ID || '').trim();
  const vaultId = (process.env.ARK_VAULT_ID || '').trim();
  let sessionId = (process.env.ARK_SESSION_ID || '').trim();

  if (!ARK_AGENT_ID_FORMAT.test(agentId)) {
    return { ok: false, items: [], notice: `ARK_AGENT_ID "${agentId}" 格式不正确（应为 agent-xxxx）` };
  }

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  const timeoutMs = clampInt(process.env.ARK_AGENT_TIMEOUT_MS, 5_000, 180_000, 110_000);

  // 配了 environment + vault 就为每次检索新建一个干净会话（避免与人工对话互相污染上下文），用完即删
  let tempSession = false;
  if (environmentId && vaultId) {
    try {
      const created = await fetchWithTimeout(`${baseUrl}/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ environment_id: environmentId, agent: agentId, vault_ids: [vaultId] }),
      });
      if (!created.ok) {
        const detail = (await created.text()).slice(0, 200);
        return { ok: false, items: [], notice: `创建方舟会话失败(${created.status})：${detail}` };
      }
      sessionId = String((safeJson(await created.text()) as any)?.id ?? '');
      tempSession = true;
    } catch (err) {
      return { ok: false, items: [], notice: `创建方舟会话异常：${(err as Error).message}` };
    }
  }

  if (!ARK_SESSION_ID_FORMAT.test(sessionId)) {
    return { ok: false, items: [], notice: `ARK_SESSION_ID "${sessionId}" 格式不正确（应为 sesn-xxxx）` };
  }

  const eventsUrl = `${baseUrl}/sessions/${sessionId}/events`;

  try {
    // 先记录已有事件，避免把历史回答当成本次结果
    const before = await fetchWithTimeout(eventsUrl, { method: 'GET', headers });
    if (!before.ok) {
      return { ok: false, items: [], notice: `读取方舟会话失败(${before.status})，请检查 ARK_SESSION_ID` };
    }
    const seen = new Set<string>(
      (safeJson(await before.text()) as any)?.data?.map((e: any) => e.id) ?? []
    );

    const post = await fetchWithTimeout(eventsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        events: [{ type: 'user.message', content: [{ type: 'text', text: query }] }],
      }),
    });
    if (!post.ok) {
      const detail = (await post.text()).slice(0, 200);
      return { ok: false, items: [], notice: `向方舟会话发送消息失败(${post.status})：${detail}` };
    }

    // 轮询事件流，直到会话回到 idle
    const deadline = Date.now() + timeoutMs;
    const answers: string[] = [];
    let toolError = '';
    let idle = false;

    while (Date.now() < deadline) {
      await sleep(3_000);
      const res = await fetchWithTimeout(eventsUrl, { method: 'GET', headers });
      if (!res.ok) continue;
      const events: any[] = (safeJson(await res.text()) as any)?.data ?? [];

      for (const event of events) {
        if (!event?.id || seen.has(event.id)) continue;
        seen.add(event.id);

        if (event.type === 'agent.message') {
          const text = eventText(event);
          if (text) answers.push(text);
        } else if (event.type === 'agent.tool_result') {
          const text = eventText(event);
          if (/authentication_error|invalid api key|鉴权/i.test(text)) toolError ||= text;
        } else if (event.type === 'session.status_idle' || event.type === 'session.thread_status_idle') {
          idle = true;
        }
      }
      if (idle) break;
    }

    if (answers.length === 0) {
      return {
        ok: false,
        items: [],
        notice: idle
          ? '方舟智能体未返回内容'
          : `方舟智能体在 ${timeoutMs}ms 内未返回结果（可调大 ARK_AGENT_TIMEOUT_MS，或该问题的推理耗时较长）`,
      };
    }

    // 多轮检索时中途也会有 agent.message，最终答复取最后一条
    const finalText = answers[answers.length - 1];
    const items: KnowledgeItem[] = [
      { type: '知识库回答', title: query, content: finalText.slice(0, 2000), source: 'ark-agent' },
    ];

    const notices: string[] = [];
    if (toolError) {
      notices.push(
        '注意：方舟智能体调用知识库 Skill 时鉴权失败（invalid api key）。' +
          '请在会话(vault)上绑定有效的 Viking 知识库 API Key，否则回答不基于知识库'
      );
    }
    if (!idle) {
      notices.push(
        `注意：方舟智能体在 ${timeoutMs}ms 内未结束（返回的是阶段性回答，可能不完整）；` +
          '可在 .env.local 调大 ARK_AGENT_TIMEOUT_MS'
      );
    }

    return { ok: true, items, ...(notices.length ? { notice: notices.join(' ') } : {}) };
  } catch (err) {
    return { ok: false, items: [], notice: `方舟托管智能体不可用：${(err as Error).message}` };
  } finally {
    if (tempSession && sessionId) {
      // 临时会话用完即删，失败不影响主流程
      try {
        await fetchWithTimeout(`${baseUrl}/sessions/${sessionId}`, { method: 'DELETE', headers }, 10_000);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * 火山方舟知识库为「可选增强」：未配置、格式不合法或调用失败时都不抛错，
 * 只是跳过（返回 notice），保证知识库工具始终可用。
 *
 * 三种接入方式（优先级从高到低）：
 * 1. `ARK_AGENT_ID` + `ARK_SESSION_ID`：**推荐**，方舟「托管智能体」，走会话事件流，
 *    知识库以 Skill（viking-knowledge-search）挂在智能体上
 * 2. `ARK_BOT_ID`：方舟「应用(Bot)」，走 `/bots/chat/completions`
 * 3. `ARK_KB_ENDPOINT`：自建 / 其它可用的检索接口，请求体 `{ knowledge_base_id, query, top_k }`
 *
 * ⚠️ 方舟开放接口**没有**独立的「知识库 chunk 检索」路径，`POST /knowledge/search` 返回 404。
 */
async function tryArkKnowledgeSearch(query: string, limit: number): Promise<ArkSearchResult> {
  const apiKey = process.env.ARK_API_KEY;
  const knowledgeBaseId = process.env.ARK_KNOWLEDGE_BASE_ID;
  const baseUrl = (process.env.ARK_BASE_URL || DEFAULT_ARK_BASE_URL).replace(/\/+$/, '');
  const botId = (process.env.ARK_BOT_ID || '').trim();
  const agentId = (process.env.ARK_AGENT_ID || '').trim();
  const sessionId = (process.env.ARK_SESSION_ID || '').trim();
  const environmentId = (process.env.ARK_ENVIRONMENT_ID || '').trim();
  const vaultId = (process.env.ARK_VAULT_ID || '').trim();
  const explicitEndpoint = (process.env.ARK_KB_ENDPOINT || '').trim();

  if (!apiKey) {
    return { ok: false, items: [], notice: '未配置 ARK_API_KEY，仅返回库内检索结果' };
  }
  if (!ARK_KEY_FORMAT.test(apiKey)) {
    return {
      ok: false,
      items: [],
      notice:
        'ARK_API_KEY 不是火山方舟的合法密钥格式（应为 ark-<uuid>-<后缀> 或纯 UUID），已跳过外部知识库，仅返回库内结果',
    };
  }

  // 方式一：托管智能体（唯一能真正检索知识库的路径）
  // 会话来源二选一：现建的 environment+vault，或复用的 ARK_SESSION_ID
  if (agentId && ((environmentId && vaultId) || sessionId)) {
    return searchViaManagedAgent(query, limit, apiKey, baseUrl);
  }

  if (!botId && !explicitEndpoint) {
    return {
      ok: false,
      items: [],
      notice: knowledgeBaseId
        ? `已配置知识库 ${knowledgeBaseId}，但方舟开放接口没有独立的检索路径（/knowledge/search 返回 404）。` +
          '请在方舟控制台创建「托管智能体」（绑定知识库 Skill 与凭证），把 ARK_AGENT_ID / ARK_SESSION_ID 配好；' +
          '或把可用的检索地址配到 ARK_KB_ENDPOINT。当前仅返回库内结果'
        : '未配置火山方舟知识库接入方式（ARK_AGENT_ID+ARK_SESSION_ID / ARK_BOT_ID / ARK_KB_ENDPOINT），仅返回库内检索结果',
    };
  }

  // 方式一：方舟应用(Bot)
  if (botId) {
    if (!ARK_BOT_ID_FORMAT.test(botId)) {
      return {
        ok: false,
        items: [],
        notice: `ARK_BOT_ID "${botId}" 格式不正确（应为 bot-xxxx 或 agent-xxxx），已跳过方舟应用，仅返回库内结果`,
      };
    }
    const endpoint = `${baseUrl}/bots/chat/completions`;
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: botId, messages: [{ role: 'user', content: query }] }),
      });
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 200);
        const hint =
          response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404
            ? '（常见原因：应用未「发布/上线」、API Key 无该应用权限、或应用 ID 不对）'
            : '';
        return {
          ok: false,
          items: [],
          notice: `火山方舟应用(${botId})调用失败(${response.status})${hint}：${detail}，仅返回库内结果`,
        };
      }
      const data = safeJson(await response.text());
      return { ok: true, items: normalizeArkBotAnswer(data, query, limit) };
    } catch (err) {
      return { ok: false, items: [], notice: `火山方舟应用不可用：${(err as Error).message}` };
    }
  }

  // 方式二：显式检索接口
  try {
    const response = await fetchWithTimeout(explicitEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ knowledge_base_id: knowledgeBaseId, query, top_k: limit }),
    });
    if (!response.ok) {
      return { ok: false, items: [], notice: `知识库检索接口调用失败(${response.status})，仅返回库内结果` };
    }
    const data = safeJson(await response.text());
    return { ok: true, items: normalizeArkItems(data, limit) };
  } catch (err) {
    return { ok: false, items: [], notice: `知识库检索接口不可用：${(err as Error).message}` };
  }
}

/**
 * 当前 AI / 知识库接入状态（供页面显示，**不包含任何密钥**）。
 */
export function getAgentConfigStatus() {
  const agentId = (process.env.ARK_AGENT_ID || '').trim();
  const sessionId = (process.env.ARK_SESSION_ID || '').trim();
  const botId = (process.env.ARK_BOT_ID || '').trim();
  const knowledgeBaseMode = agentId && (sessionId || process.env.ARK_ENVIRONMENT_ID)
    ? 'agent'
    : botId
      ? 'bot'
      : process.env.ARK_KB_ENDPOINT
        ? 'endpoint'
        : 'none';

  return {
    apiKeyConfigured: Boolean(process.env.ARK_API_KEY),
    model: process.env.ARK_MODEL_ENDPOINT || null,
    knowledgeBaseId: process.env.ARK_KNOWLEDGE_BASE_ID || null,
    knowledgeBaseMode,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    externalLlm: false,
  };
}

/**
 * 检索内部知识库。
 *
 * 默认使用业务库中的本地知识（课程 / 量表 / 课堂记录 / 教案 / 训练计划 /
 * 平台上「📚 知识库」上传的 knowledge_documents），不依赖外部凭证；
 * 若 .env.local 配置了合法的火山方舟凭证，则额外合并其检索结果。
 *
 * @param query 检索关键词或自然语言问题
 */
export async function searchKnowledgeBase(query: string): Promise<string> {
  const q = String(query ?? '').trim();
  if (!q) throw new Error('检索关键词 query 不能为空');

  const limit = 5;
  const local = await searchLocalKnowledge(q, limit);
  const ark = await tryArkKnowledgeSearch(q, limit);

  return JSON.stringify({
    query: q,
    source: ark.ok ? 'local+ark' : 'local',
    total: local.length + ark.items.length,
    items: [...local, ...ark.items],
    ...(ark.notice ? { notice: ark.notice } : {}),
  });
}

// ---------------------------------------------------------------------------
// 2. 业务数据库查询
// ---------------------------------------------------------------------------

/** 允许被查询的表白名单（防止 SQL 注入 / 越权访问敏感表） */
const DB_ENTITIES = {
  students: { table: 'students', searchFields: ['name', 'parentName', 'parentPhone'] },
  teachers: { table: 'teachers', searchFields: ['name', 'phone'] },
  courses: { table: 'courses', searchFields: ['name', 'subject', 'teacherName'] },
  class_records: { table: 'class_records', searchFields: ['studentNames', 'courseName', 'teacherName', 'content'] },
  scale_templates: { table: 'scale_templates', searchFields: ['name', 'type'] },
  student_scale_records: { table: 'student_scale_records', searchFields: ['studentName', 'scaleName'] },
  lesson_plans: { table: 'lesson_plans', searchFields: ['title', 'studentName'] },
  training_plans: { table: 'training_plans', searchFields: ['title', 'childName'] },
} as const;

/**
 * 读取某张表实际存在的列，用于兼容历史库中列名大小写不一致的情况
 * （例如 student_scale_records 既有 camelCase 也有小写列）。
 */
async function getTableColumns(db: { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> }, table: string): Promise<Set<string>> {
  const res = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
    [table]
  );
  return new Set(res.rows.map((r: any) => r.column_name as string));
}

type EntityKey = keyof typeof DB_ENTITIES;

const ENTITY_ALIASES: Record<string, EntityKey> = {
  student: 'students',
  teacher: 'teachers',
  course: 'courses',
  class_record: 'class_records',
  scale_template: 'scale_templates',
  student_scale_record: 'student_scale_records',
  lesson_plan: 'lesson_plans',
  training_plan: 'training_plans',
};

const STATS_ACTIONS = new Set(['stats', 'statistics', 'overview', 'count']);

export interface QueryDatabaseParams {
  id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * 查询业务数据库。
 * @param action stats（各表统计）或表名
 * @param params 可选参数：id / search / limit / offset
 */
export async function queryDatabase(
  action: string,
  params: QueryDatabaseParams = {}
): Promise<string> {
  const act = String(action ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!act) throw new Error('查询动作 action 不能为空');

  const safeParams = params && typeof params === 'object' ? params : {};

  if (STATS_ACTIONS.has(act)) {
    const db = await getDb();
    const counts: Record<string, number> = {};
    const missing: string[] = [];
    for (const key of Object.keys(DB_ENTITIES) as EntityKey[]) {
      try {
        const res = await db.query(`SELECT COUNT(*)::int AS c FROM ${DB_ENTITIES[key].table}`);
        counts[key] = res.rows[0]?.c ?? 0;
      } catch {
        // 某些业务表可能尚未创建，跳过而不影响整体统计
        missing.push(DB_ENTITIES[key].table);
      }
    }
    return JSON.stringify({ ok: true, action: 'stats', counts, ...(missing.length ? { missing } : {}) });
  }

  const key = (ENTITY_ALIASES[act] || act) as EntityKey;
  const entity = DB_ENTITIES[key];
  if (!entity) {
    throw new Error(
      `未知查询动作 "${action}"，可用值：stats、${Object.keys(DB_ENTITIES).join('、')}`
    );
  }

  const db = await getDb();
  const columns = await getTableColumns(db, entity.table);
  if (columns.size === 0) {
    throw new Error(`数据表 ${entity.table} 不存在或尚未初始化`);
  }

  // 按 id 查单条
  if (safeParams.id !== undefined && safeParams.id !== null && String(safeParams.id) !== '') {
    const res = await db.query(`SELECT * FROM ${entity.table} WHERE id = $1 LIMIT 1`, [
      String(safeParams.id),
    ]);
    return JSON.stringify({ ok: true, action: key, item: res.rows[0] ?? null });
  }

  const limit = clampInt(safeParams.limit, 1, 200, 20);
  const offset = clampInt(safeParams.offset, 0, 1_000_000, 0);
  const search = typeof safeParams.search === 'string' ? safeParams.search.trim() : '';

  // 只使用库中真实存在的列做搜索 / 排序，避免历史库列名大小写差异导致 SQL 报错
  const searchFields = entity.searchFields.filter((f) => columns.has(f));
  const orderColumn =
    ['createdAt', 'createdat', 'updatedAt', 'updatedat', 'id'].find((c) => columns.has(c)) || 'id';

  let where = '';
  const values: unknown[] = [];
  if (search && searchFields.length > 0) {
    const clauses = searchFields.map((f) => `"${f}" ILIKE $1`);
    where = ` WHERE (${clauses.join(' OR ')})`;
    values.push(`%${search}%`);
  }

  const countRes = await db.query(
    `SELECT COUNT(*)::int AS total FROM ${entity.table}${where}`,
    values
  );
  const listRes = await db.query(
    `SELECT * FROM ${entity.table}${where} ORDER BY "${orderColumn}" DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`,
    values
  );

  return JSON.stringify({
    ok: true,
    action: key,
    total: countRes.rows[0]?.total ?? 0,
    limit,
    offset,
    items: listRes.rows,
  });
}

// ---------------------------------------------------------------------------
// 3. 文件生成
// ---------------------------------------------------------------------------

function sanitizeFilename(name: unknown, defaultExt: string): string {
  let base = path.basename(String(name ?? '').trim()) || `export${defaultExt}`;
  // 只保留常见安全字符（含中文），其余替换为下划线，防止路径穿越
  base = base.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').replace(/^\.+/, '');
  if (!base) base = `export${defaultExt}`;
  if (!base.toLowerCase().endsWith(defaultExt)) base += defaultExt;
  return base;
}

export interface GenerateFileContent {
  sheetName?: string;
  headers?: unknown[];
  rows?: unknown[][];
  sheets?: { name?: string; headers?: unknown[]; rows?: unknown[][] }[];
  title?: string;
  paragraphs?: unknown[];
  text?: string;
}

/**
 * 生成 Excel(.xlsx) 或 Word(.docx) 文件，写入 public/generated 并返回下载地址。
 * @param type excel | word
 * @param filename 期望的文件名（会自动做安全清洗并补全扩展名）
 * @param content 内容定义
 */
export async function generateFile(
  type: string,
  filename: string,
  content: GenerateFileContent = {}
): Promise<string> {
  const t = String(type ?? '').trim().toLowerCase();
  if (t !== 'excel' && t !== 'word') {
    throw new Error("type 仅支持 'excel' 或 'word'");
  }
  if (!content || typeof content !== 'object') {
    throw new Error('content 必须是一个对象');
  }

  const ext = t === 'excel' ? '.xlsx' : '.docx';
  const safeName = sanitizeFilename(filename, ext);
  const dir = path.join(process.cwd(), 'public', 'generated');
  await fs.mkdir(dir, { recursive: true });

  const storedName = `${Date.now()}_${safeName}`;
  const filePath = path.join(dir, storedName);

  if (t === 'excel') {
    const wb = new ExcelJS.Workbook();
    const sheets =
      Array.isArray(content.sheets) && content.sheets.length > 0
        ? content.sheets
        : [{ name: content.sheetName, headers: content.headers, rows: content.rows }];

    let added = 0;
    for (const sheet of sheets) {
      const name = String(sheet?.name || `Sheet${added + 1}`).slice(0, 31);
      const ws = wb.addWorksheet(name);
      if (Array.isArray(sheet?.headers) && sheet.headers.length > 0) {
        const headerRow = ws.addRow(sheet.headers);
        headerRow.font = { bold: true };
      }
      if (Array.isArray(sheet?.rows)) {
        for (const row of sheet.rows) {
          ws.addRow(Array.isArray(row) ? row : [row]);
        }
      }
      added++;
    }
    if (added === 0) wb.addWorksheet('Sheet1');
    await wb.xlsx.writeFile(filePath);
  } else {
    const children: (Paragraph | Table)[] = [];
    if (content.title) {
      children.push(new Paragraph({ text: String(content.title), heading: HeadingLevel.HEADING_1 }));
    }
    if (Array.isArray(content.paragraphs)) {
      for (const p of content.paragraphs) children.push(new Paragraph(String(p)));
    }
    if (Array.isArray(content.rows) && content.rows.length > 0) {
      const rows: TableRow[] = [];
      if (Array.isArray(content.headers) && content.headers.length > 0) {
        rows.push(
          new TableRow({
            children: content.headers.map(
              (h) => new TableCell({ children: [new Paragraph(String(h))] })
            ),
          })
        );
      }
      for (const row of content.rows) {
        const cells = (Array.isArray(row) ? row : [row]).map(
          (c) => new TableCell({ children: [new Paragraph(c == null ? '' : String(c))] })
        );
        rows.push(new TableRow({ children: cells }));
      }
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
    }
    if (children.length === 0) {
      children.push(new Paragraph(String(content.text || '（无内容）')));
    }
    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);
  }

  const stat = await fs.stat(filePath);
  return JSON.stringify({
    ok: true,
    type: t,
    filename: storedName,
    downloadUrl: `/generated/${storedName}`,
    size: stat.size,
  });
}
