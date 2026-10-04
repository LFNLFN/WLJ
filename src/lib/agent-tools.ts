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
import { callerLine } from './agent/context';

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
  /** 相关性分（火山知识库 / 向量检索会返回） */
  score?: number;
}

/**
 * 疑问 / 口语停用词：这些词几乎每句话都有，命中了也不代表资料相关。
 */
const QUERY_STOPWORDS = new Set([
  '怎么', '如何', '什么', '哪些', '哪个', '多少', '请问', '一下', '可以', '是否', '有没有',
  '我们', '咱们', '机构', '中心', '这个', '那个', '这些', '那些', '以及', '还有', '就是', '的话',
]);

/**
 * 中文功能字（虚词 / 代词 / 助词 / 量词）。
 *
 * 长句按标点切分后做 2-gram 会切出「构的」「的课」「有哪」「些课」这类跨词边界的噪声，
 * 命中它们纯属巧合；只要 2-gram 里含功能字就丢掉，留下的基本是
 * 「课程」「体系」「王小」「小明」这种有信息量的片段。
 */
const FUNCTION_CHARS = new Set('的了和与及或是为在就不都也还我你他她它们这那哪些吗呢吧啊么嘛之其着过被把怎谁啥');

interface QueryTokens {
  /** 英文 / 数字串（ABC、MCH、2026）：最具体，单独命中即可认为查到 */
  alnum: string[];
  /** 参与匹配的检索词：alnum + 中文 2-gram */
  matchable: string[];
  /** 只参与打分的整句 / 长词：命中说明「这句原话」在资料里出现过 */
  scoring: string[];
}

/**
 * 把自然语言问题切成检索词。
 *
 * 直接拿整句去 ILIKE 是查不到的（「孤独症 ABC 量表怎么计分」不是任何文档里的连续子串），
 * 所以：按标点/空白切分 → 抽出英文数字串与中文串 → 中文长串补 2-gram → 去掉功能字与疑问/口语停用词。
 *
 * ⚠️ 注意区分「匹配词」和「打分词」：整句只能用来打分，**绝不能当成必须命中的条件**
 * （踩过的坑：把整句当强检索词要求命中，导致「王小明最近训练得怎么样」这种正常提问一条都查不到，
 * 明明库里有王小明的资料 —— 见 npm run test:kb-search）。
 */
function queryTokens(query: string): QueryTokens {
  const text = String(query || '').toLowerCase();

  /** 收集 source 里所有匹配（不用 matchAll：tsconfig 的 target 较低） */
  const findAll = (source: string, re: RegExp): string[] => {
    const out: string[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      out.push(m[0]);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    return out;
  };

  const alnum = findAll(text, /[a-z0-9][a-z0-9._-]{1,}/g);
  const runs: string[] = [];
  const bigrams: string[] = [];

  const chunks = text.split(/[\s,，。！？、；：:;!?()（）【】\[\]"'“”‘’/\\|+*&=<>~`#@$%^\-]+/);
  for (const chunk of chunks) {
    for (const run of findAll(chunk, /[\u4e00-\u9fa5]{2,}/g)) {
      runs.push(run);
      for (let i = 0; i + 2 <= run.length; i++) bigrams.push(run.slice(i, i + 2));
    }
  }

  const dedupe = (arr: string[]) => Array.from(new Set(arr));
  const isContent = (t: string) => t.length >= 2 && !QUERY_STOPWORDS.has(t);
  const contentBigrams = dedupe(bigrams)
    .filter(isContent)
    .filter((t) => !Array.from(t).some((ch) => FUNCTION_CHARS.has(ch)));

  const alnumTokens = dedupe(alnum).filter(isContent);

  return {
    alnum: alnumTokens.slice(0, 6),
    matchable: dedupe([...alnumTokens, ...contentBigrams]).slice(0, 12),
    scoring: dedupe(runs).filter(isContent).filter((t) => t.length >= 3).slice(0, 6),
  };
}

/**
 * 用检索词拼匹配条件。
 *
 * 相关判定（gate）：
 * - 查询里有英文/数字串（ABC、MCH）时：命中该串即算相关；或命中至少 2 个不同的中文词。
 *   （注意不能因为「带了 xyzzy123」就放宽到「随便命中一个中文词」，否则「问题」这种词会把整库捞出来）
 * - 纯中文查询：要求命中至少 2 个不同的中文词；查询本身就只剩 1 个词时放宽到 1。
 *
 * 排序（score）：整句原话(4) > 英文/数字串(3) > 中文 2-gram(1)。
 */
function buildTokenFilter(tokens: QueryTokens, columns: string[]) {
  const params: unknown[] = [];

  const toPart = (token: string, weight: number) => {
    params.push(`%${token}%`);
    const idx = params.length;
    return {
      sql: `(${columns.map((c) => `${c} ILIKE $${idx}`).join(' OR ')})`,
      weight,
    };
  };

  const alnumParts = tokens.alnum.map((t) => toPart(t, t.length >= 3 ? 3 : 2));
  const cnParts = tokens.matchable.filter((t) => !tokens.alnum.includes(t)).map((t) => toPart(t, 1));
  const scoreParts = [...alnumParts, ...cnParts, ...tokens.scoring.map((t) => toPart(t, 4))];

  const countExpr = (parts: { sql: string }[]) =>
    parts.length ? parts.map((p) => `(CASE WHEN ${p.sql} THEN 1 ELSE 0 END)`).join(' + ') : '0';
  const scoreExpr = scoreParts.length
    ? scoreParts.map((p) => `(CASE WHEN ${p.sql} THEN ${p.weight} ELSE 0 END)`).join(' + ')
    : '0';

  const matchableCount = alnumParts.length + cnParts.length;
  const requiredCn = Math.min(2, cnParts.length);

  let gate = 'FALSE';
  if (alnumParts.length) {
    const alnCond = `(${countExpr(alnumParts)}) >= 1`;
    gate = cnParts.length ? `(${alnCond} OR (${countExpr(cnParts)}) >= ${requiredCn})` : `(${alnCond})`;
  } else if (cnParts.length) {
    gate = `(${countExpr(cnParts)}) >= ${requiredCn}`;
  }

  return { matchableCount, gate, score: scoreExpr, params };
}

/** 带命中分的检索结果（内部用，返回给模型前会去掉 __score） */
type ScoredKnowledgeItem = KnowledgeItem & { __score: number };

/** 库内知识检索：不依赖任何外部凭证，直接查业务库中的课程 / 量表 / 课堂记录 / 教案 / 知识库资料等 */
async function searchLocalKnowledge(keyword: string, limit: number): Promise<KnowledgeItem[]> {
  const tokens = queryTokens(keyword);
  if (tokens.matchable.length === 0) return [];

  const db = await getDb();
  const items: ScoredKnowledgeItem[] = [];

  const safeQuery = async (sql: string, params: unknown[]) => {
    try {
      return (await db.query(sql, params)).rows as any[];
    } catch {
      // 表不存在 / 列不匹配时静默跳过，不影响整体检索
      return [] as any[];
    }
  };

  const clip = (v: unknown, n = 500) => String(v ?? '').slice(0, n);

  /** 在单张表上做「多词 OR + 命中权重排序」检索 */
  const searchTable = async (table: string, columns: string[], map: (row: any) => KnowledgeItem) => {
    const filter = buildTokenFilter(tokens, columns);
    if (filter.matchableCount === 0) return;
    const sql =
      `SELECT *, (${filter.score}) AS __score FROM ${table}` +
      ` WHERE ${filter.gate} ORDER BY __score DESC LIMIT $${filter.params.length + 1}`;
    for (const row of await safeQuery(sql, [...filter.params, limit])) {
      items.push({ ...map(row), __score: Number(row.__score) || 0 });
    }
  };

  await searchTable('lesson_plans', ['title', 'content'], (r) => ({
    type: '教案',
    id: r.id,
    title: r.title,
    content: clip(r.content),
    source: 'lesson_plans',
  }));

  await searchTable('training_plans', ['title', 'content'], (r) => ({
    type: '训练计划',
    id: r.id,
    title: r.title,
    content: clip(r.content),
    source: 'training_plans',
  }));

  await searchTable('courses', ['name', 'subject'], (r) => ({
    type: '课程',
    id: r.id,
    title: r.name,
    content: clip(r.subject),
    source: 'courses',
  }));

  await searchTable('scale_templates', ['name', 'type'], (r) => ({
    type: '评估量表',
    id: r.id,
    title: r.name,
    content: clip(r.type),
    source: 'scale_templates',
  }));

  await searchTable('class_records', ['"courseName"', 'content'], (r) => ({
    type: '课堂记录',
    id: r.id,
    title: r.courseName,
    content: clip(r.content),
    source: 'class_records',
  }));

  // 平台上「📚 知识库」上传的资料（/api/knowledge → knowledge_documents）
  await searchTable('knowledge_documents', ['title', 'content', 'category'], (r) => ({
    type: '知识库资料',
    id: r.id,
    title: r.title,
    content: clip(r.content),
    source: 'knowledge_documents',
  }));

  // 按命中权重全局排序：否则「知识库资料」排在最后查，很容易被下面的 slice 截掉
  return items
    .sort((a, b) => b.__score - a.__score)
    .slice(0, limit * 2)
    .map(({ __score, ...rest }) => rest);
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
  /** 是否因为「限流」失败（429/5xx）：这种情况降级到托管智能体也没意义，直接快速失败） */
  rateLimited?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 从 `agent.tool_result` 文本里抽出知识库**原文切片**。
 *
 * 实测（session sesn-20261004055646-hqst3 的事件流）：托管智能体的知识库 Skill 返回的就是
 * search_knowledge 的响应体，被包在 `exit_code: 0 --- stdout --- {...}` 里：
 *   {"ok":true,"data":{"result_list":[{"id":"415467-_sys_auto_gen_doc_id-...","content":"档案编号：WLJ-2024-0001 … 儿童姓名：王小明"}]}}
 * 抽出来当 KnowledgeItem 用，模型就能引用**原文**，而不是只拿到一段生成好的回答。
 */
function extractKnowledgeChunks(text: string, limit: number): KnowledgeItem[] {
  if (!text || !/result_list/.test(text)) return [];

  const candidates: string[] = [text];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));

  for (const candidate of candidates) {
    try {
      const parsed: any = JSON.parse(candidate);
      const list = parsed?.data?.result_list ?? parsed?.result_list;
      if (!Array.isArray(list) || list.length === 0) continue;
      return list.slice(0, limit).map((p: any) => ({
        type: '火山知识库',
        id: String(p?.id ?? p?.point_id ?? p?.chunk_id ?? '') || undefined,
        title: String(p?.chunk_title ?? p?.doc_info?.doc_name ?? '').slice(0, 200) || undefined,
        content: String(p?.content ?? '').slice(0, 800),
        source: 'ark-kb',
        score: Number(p?.rerank_score ?? p?.score ?? 0) || undefined,
      }));
    } catch {
      /* 换下一个候选串继续试 */
    }
  }
  return [];
}

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

  // 会话来源优先级：显式配置的 ARK_SESSION_ID（用户指定固定会话，沿用它的上下文）> 自动新建临时会话。
  // ⚠️ 以前是「只要配了 environment+vault 就一定新建」，会把 ARK_SESSION_ID 悄悄忽略掉，
  //    导致「明明指定了 session、却不在那个 session 里跑」；显式配置现在优先。
  let tempSession = false;
  if (!sessionId && environmentId && vaultId) {
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
    return {
      ok: false,
      items: [],
      notice: `没有可用会话：ARK_SESSION_ID "${sessionId}" 格式不正确（应为 sesn-xxxx），且未配 ARK_ENVIRONMENT_ID + ARK_VAULT_ID 无法自动新建`,
    };
  }

  // ⚠️ 实测：GET /sessions/{id}/events **默认只返回前 50 条**（`?limit=` 可调，5000 也能用）。
  // 会话事件超过 50 条之后，新事件就落在窗口外 —— 轮询会一直"看不到"新内容，直到超时，
  // 表现就是「明明答完了，却报方舟智能体未返回结果」。所以轮询兜底路径也必须显式带上 limit。
  const eventsLimit = clampInt(process.env.ARK_EVENTS_LIMIT, 50, 5000, 500);
  const eventsPath = `${baseUrl}/sessions/${sessionId}/events`;
  const eventsUrl = `${eventsPath}?limit=${eventsLimit}`;
  const streamUrl = `${eventsPath}/stream`;

  const sendQuery = async (): Promise<{ ok: boolean; detail?: string }> => {
    // 把「谁在问」告诉智能体：它看不到我们的登录态，否则面对学生/评估这类数据
    // 会以「你当前没有访问学生及相关数据的权限」搪塞（实测问题）。
    const who = callerLine();
    const question = who ? `${who} ${query}` : query;
    const post = await fetchWithTimeout(eventsPath, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        events: [{ type: 'user.message', content: [{ type: 'text', text: question }] }],
      }),
    });
    if (post.ok) return { ok: true };
    return { ok: false, detail: `向方舟会话发送消息失败(${post.status})：${(await post.text()).slice(0, 200)}` };
  };

  try {
    const state = createSessionRunState(limit);

    // ---------- 首选：SSE 事件流（实时，不用轮询）----------
    // `curl -N {base}/sessions/{id}/events/stream`：content-type: text/event-stream，
    // 帧格式是 `data: {"type":"agent.message",...}` + 空行，`: ready` 是心跳注释。
    if (process.env.ARK_SESSION_STREAM !== '0') {
      const sse = openSessionEventStream(streamUrl, headers, timeoutMs, state);
      const ready = await sse.waitReady(4_000);
      if (ready) {
        const sent = await sendQuery();
        if (!sent.ok) {
          sse.abort();
          return { ok: false, items: [], notice: sent.detail || '发送失败' };
        }
        await sse.done;
        return finishSessionResult(state, query, timeoutMs);
      }
      // 流建不起来（网关不支持 / 404 等）：静默退回轮询
      sse.abort();
    }

    // ---------- 兜底：轮询 ----------
    const before = await fetchWithTimeout(eventsUrl, { method: 'GET', headers });
    if (!before.ok) {
      return { ok: false, items: [], notice: `读取方舟会话失败(${before.status})，请检查 ARK_SESSION_ID` };
    }
    const seen = new Set<string>((safeJson(await before.text()) as any)?.data?.map((e: any) => e.id) ?? []);

    const sent = await sendQuery();
    if (!sent.ok) return { ok: false, items: [], notice: sent.detail || '发送失败' };

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !state.idle) {
      await sleep(3_000);
      const res = await fetchWithTimeout(eventsUrl, { method: 'GET', headers });
      if (!res.ok) continue;
      for (const event of (safeJson(await res.text()) as any)?.data ?? []) {
        if (!event?.id || seen.has(event.id)) continue;
        seen.add(event.id);
        applySessionEvent(event, state);
      }
    }

    return finishSessionResult(state, query, timeoutMs);
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
/**
 * 火山知识库（Viking KnowledgeBase）**直连检索**。
 *
 * 接口来源：官方 SDK `volcengine/viking_knowledgebase/VikingKnowledgeBaseService.py`（v1.0.228）
 * 实测结论（2026-10-04）：
 *   - 宿主机 `ark.cn-beijing.volces.com/api/v3/knowledge/*` 全部 404：方舟那套接口**没有**知识库检索；
 *     知识库是**独立服务**：`https://api-knowledgebase.mlp.cn-beijing.volces.com`
 *   - `POST /api/knowledge/collection/search_knowledge` 存在，返回 `data.result_list[]`（原文切片，带 score），
 *     字段见 SDK 的 Point：point_id / chunk_id / chunk_title / content / score / rerank_score / doc_info
 *   - 鉴权两种：① `Authorization: Bearer <知识库 API Key>`（控制台「知识库 → API Key」，实测假 key 会明确报
 *     `invalid api key`）；② 官方 SDK 用的 AK/SK V4 签名（service = "air"）。
 *     本函数只用 ①，因为它在服务器上只需要一个环境变量。
 *
 * 与托管智能体那条路的区别：这条路**快**（百毫秒级）且返回**原文切片**，可以直接塞进对话上下文；
 * 托管智能体返回的是「生成好的回答」，要 10~56 秒。
 */
const KB_DEFAULT_HOST = 'https://api-knowledgebase.mlp.cn-beijing.volces.com';

function getKnowledgeApiKey(): string {
  return (process.env.KB_API_KEY || process.env.VIKING_KB_API_KEY || '').trim();
}

async function searchViaKnowledgeApi(query: string, limit: number): Promise<ArkSearchResult> {
  const apiKey = getKnowledgeApiKey();
  if (!apiKey) {
    return { ok: false, items: [], notice: '未配置 KB_API_KEY（火山知识库 API Key），跳过直连知识库检索' };
  }

  const host = (process.env.KB_API_HOST || KB_DEFAULT_HOST).replace(/\/+$/, '');
  const timeoutMs = clampInt(process.env.KB_API_TIMEOUT_MS, 1_000, 60_000, 10_000);
  const collectionName = (process.env.KB_COLLECTION_NAME || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();

  const body: Record<string, unknown> = {
    name: collectionName,
    query,
    project: process.env.KB_PROJECT || 'default',
    limit,
    dense_weight: Number(process.env.KB_DENSE_WEIGHT ?? 0.5),
  };
  // 方舟控制台里那个 kb-xxxx 就是 resource_id；给了它检索范围更准
  const resourceId = (process.env.KB_RESOURCE_ID || process.env.ARK_KNOWLEDGE_BASE_ID || '').trim();
  if (resourceId) body.resource_id = resourceId;

  const url = `${host}/api/knowledge/collection/search_knowledge`;
  const attempts = clampInt(process.env.KB_API_RETRY, 1, 3, 2);

  try {
    let res!: Response;
    let text = '';

    for (let i = 0; i < attempts; i++) {
      res = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        timeoutMs
      );
      text = await res.text();

      // 429 / 5xx 多为瞬时限流或服务抖动：退避一下重试；其它状态码直接返回
      const retryable = res.status === 429 || res.status >= 500;
      if (res.ok || !retryable || i === attempts - 1) break;
      const waitMs = 1200 * (i + 1);
      console.warn(`[kb] 知识库检索被限流(${res.status})，${waitMs}ms 后重试第 ${i + 2} 次`);
      await sleep(waitMs);
    }

    if (!res.ok) {
      const throttled = res.status === 429 || res.status >= 500;
      return {
        ok: false,
        items: [],
        rateLimited: throttled,
        notice: `知识库检索失败(${res.status})${throttled ? '：知识库限流/服务抖动' : ''}：${text.slice(0, 200)}`,
      };
    }

    const data = (safeJson(text) as any)?.data ?? {};
    const list: any[] = Array.isArray(data?.result_list) ? data.result_list : [];

    return {
      ok: true,
      items: list.slice(0, limit).map((p: any) => ({
        type: '火山知识库',
        id: String(p?.id ?? p?.point_id ?? p?.chunk_id ?? '') || undefined,
        title: String(p?.chunk_title ?? p?.doc_info?.doc_name ?? query).slice(0, 200),
        content: String(p?.content ?? '').slice(0, 800),
        source: 'ark-kb',
        score: Number(p?.rerank_score ?? p?.score ?? 0) || undefined,
      })),
    };
  } catch (err) {
    return { ok: false, items: [], notice: `知识库检索异常：${(err as Error).message}` };
  }
}

/** 一次会话问答的中间状态（SSE 与轮询两条路共用同一套解析逻辑） */
interface SessionRunState {
  answers: string[];
  kbChunks: KnowledgeItem[];
  toolError: string;
  rateLimited: boolean;
  /** 是否收到过非 idle 的事件（防止「连上流时先收到上一轮的 idle」被误判为本轮结束） */
  sawActivity: boolean;
  idle: boolean;
  /** 单次解析最多取几条知识库切片 */
  chunkLimit: number;
}

function createSessionRunState(chunkLimit: number): SessionRunState {
  return { answers: [], kbChunks: [], toolError: '', rateLimited: false, sawActivity: false, idle: false, chunkLimit };
}

/** 处理一条会话事件（SSE 与轮询共用） */
function applySessionEvent(event: any, state: SessionRunState): void {
  const type = event?.type;
  if (typeof type !== 'string') return;

  if (!/idle/.test(type)) state.sawActivity = true;

  if (type === 'agent.message') {
    const text = eventText(event);
    if (text) state.answers.push(text);
  } else if (type === 'agent.thinking') {
    if (/限流|rate.?limit|too many requests|429/i.test(eventText(event))) state.rateLimited = true;
  } else if (type === 'agent.tool_result') {
    const text = eventText(event);
    if (/authentication_error|invalid api key|鉴权/i.test(text)) state.toolError ||= text;
    if (/限流|rate.?limit|too many requests|429/i.test(text)) state.rateLimited = true;
    for (const chunk of extractKnowledgeChunks(text, state.chunkLimit)) {
      if (!state.kbChunks.some((c) => c.id && c.id === chunk.id)) state.kbChunks.push(chunk);
    }
  } else if (type === 'session.status_idle' || type === 'session.thread_status_idle') {
    // 只有本轮确实跑起来过，才把 idle 当成本轮结束
    if (state.sawActivity) state.idle = true;
  }
}

/** 把中间状态组装成工具返回值（超时但有切片也算成功） */
function finishSessionResult(state: SessionRunState, query: string, timeoutMs: number): ArkSearchResult {
  const finalText = state.answers.length ? state.answers[state.answers.length - 1] : '';
  const items: KnowledgeItem[] = [
    // 原文切片放前面：模型可以直接引用
    ...state.kbChunks,
    ...(finalText
      ? [{ type: '知识库回答', title: query, content: finalText.slice(0, 2000), source: 'ark-agent' }]
      : []),
  ];

  if (items.length === 0) {
    return {
      ok: false,
      items: [],
      notice: state.idle
        ? '方舟智能体未返回内容'
        : `方舟智能体在 ${timeoutMs}ms 内未返回结果（可调大 ARK_AGENT_TIMEOUT_MS，或该问题的推理耗时较长）`,
    };
  }

  const notices: string[] = [];
  if (state.toolError) {
    notices.push(
      '注意：方舟智能体调用知识库 Skill 时鉴权失败（invalid api key）。' +
        '请在会话(vault)上绑定有效的 Viking 知识库 API Key，否则回答不基于知识库'
    );
  }
  if (!state.idle) {
    notices.push(
      `注意：方舟智能体在 ${timeoutMs}ms 内未结束（返回的是阶段性回答，可能不完整）；` +
        `已尽量返回检索到的知识库原文${state.kbChunks.length ? `（${state.kbChunks.length} 条切片）` : ''}；` +
        '可在 .env.local 调大 ARK_AGENT_TIMEOUT_MS'
    );
  }
  if (state.rateLimited) {
    notices.push('注意：方舟知识库检索触发了限流，本次结果可能不全；可稍后重试，或改用直连知识库（KB_API_KEY）绕开该限制');
  }

  return { ok: true, items, ...(notices.length ? { notice: notices.join(' ') } : {}) };
}

/**
 * 打开会话的 SSE 事件流（`GET /sessions/{id}/events/stream`），实时消费到本轮结束或超时。
 *
 * 帧格式（实测）：`data: {"type":"agent.message",...}` + 空行分隔；`: ready` 之类的注释行是心跳。
 * 比轮询好在：不用每 3 秒问一次，也没有「默认只返回前 50 条」的窗口问题。
 */
function openSessionEventStream(url: string, headers: Record<string, string>, timeoutMs: number, state: SessionRunState) {
  const controller = new AbortController();
  let resolveReady: (v: boolean) => void = () => {};
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });

  const done = (async () => {
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        resolveReady(false);
        return;
      }
      resolveReady(true);

      const reader = (res.body as any).getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let dataLines: string[] = [];

      while (!state.idle) {
        const { done: streamEnded, value } = await reader.read();
        if (streamEnded) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);

          if (line === '') {
            // 一个帧结束：把累积的 data 行按 SSE 规范拼起来解析
            if (dataLines.length) {
              const payload = dataLines.join('\n');
              dataLines = [];
              const parsed: any = safeJson(payload);
              if (parsed && !parsed.raw) applySessionEvent(parsed, state);
            }
            continue;
          }
          if (line.startsWith(':')) continue; // 心跳/注释
          if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
        }
      }
    } catch (err) {
      // 超时 abort / 网络断开：交给 finishSessionResult 按「未结束」处理
      resolveReady(false);
    } finally {
      clearTimeout(timer);
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    }
  })();

  return {
    done,
    ready,
    /** 最多等 ms 毫秒判断流是否建起来了 */
    waitReady: (ms: number) => Promise.race([ready, sleep(ms).then(() => false)]),
    abort: () => {
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

async function tryArkAgentOrBotSearch(query: string, limit: number): Promise<ArkSearchResult> {
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
 * 外部知识库检索总入口（按优先级）：
 * ① `KB_API_KEY` + 知识库服务直连检索（`/api/knowledge/collection/search_knowledge`）——快、返回原文切片；
 * ② 火山方舟托管智能体 / 应用(Bot) / 自建 `ARK_KB_ENDPOINT`——返回生成好的回答，慢。
 * ① 配了但失败（key 或知识库名不对）时会自动降级到 ②，并把两条原因都写进 notice，便于排查。
 */
async function tryArkKnowledgeSearch(query: string, limit: number): Promise<ArkSearchResult> {
  if (!getKnowledgeApiKey()) {
    return tryArkAgentOrBotSearch(query, limit);
  }

  const direct = await searchViaKnowledgeApi(query, limit);
  if (direct.ok) return direct;

  // 限流：降级到托管智能体没意义（同样依赖知识库、还慢几十秒），直接如实返回
  if (direct.rateLimited) return direct;

  const fallback = await tryArkAgentOrBotSearch(query, limit);
  const notices = [direct.notice, fallback.notice].filter(Boolean).join('；');
  return { ...fallback, notice: notices || undefined };
}

/**
 * 当前 AI / 知识库接入状态（供页面显示，**不包含任何密钥**）。
 */
export function getAgentConfigStatus() {
  const agentId = (process.env.ARK_AGENT_ID || '').trim();
  const sessionId = (process.env.ARK_SESSION_ID || '').trim();
  const botId = (process.env.ARK_BOT_ID || '').trim();
  const knowledgeBaseMode = getKnowledgeApiKey()
    ? 'kb-api'
    : agentId && (sessionId || process.env.ARK_ENVIRONMENT_ID)
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
    /** 直连知识库服务时用的知识库名 / 资源 id（不包含密钥） */
    knowledgeCollection: process.env.KB_COLLECTION_NAME || process.env.ARK_KNOWLEDGE_BASE_ID || null,
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

  const total = countRes.rows[0]?.total ?? 0;

  /**
   * 业务库查不到人时，别让模型直接回「系统里没有这个学生」。
   *
   * 实测（2026-10-04）：问「王小明的康复档案里写了什么？」，模型只调了 query_database，
   * 三次都 0 条（学生表里确实没有王小明），于是回答"当前业务系统中没有名为王小明的学生档案"，
   * 建议用户补充信息 —— 而知识库里就躺着《康复训练档案_王小明》这份 PDF。
   * 儿童的个人档案（康复档案 / 评估报告等）常常只上传到知识库，业务库里并没有对应学生记录，
   * 所以这里在工具结果里明确给出下一步（模型读得到），要求它再去知识库查一遍。
   */
  const hint =
    total === 0 && search
      ? `业务库的 ${entity.table} 里没有匹配「${search}」的记录。` +
        '若问的是某个儿童的个人档案（康复训练档案 / 评估报告 / 学习能力评估表等），' +
        '这类资料常以 PDF 形式存在知识库里：请再用 search_knowledge_base 以该姓名检索一次，' +
        '并把检索到的内容如实转述；只有业务库与知识库都没有命中时，才可以说"没有查到"，' +
        '且要说明已经查过这两处。'
      : undefined;

  return JSON.stringify({
    ok: true,
    action: key,
    total,
    limit,
    offset,
    items: listRes.rows,
    ...(hint ? { hint } : {}),
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

export interface GenerateSlide {
  title?: string;
  /** 要点列表（每行一条） */
  bullets?: unknown[];
  /** 段落文字（不想要项目符号时用） */
  text?: string;
  /** 这一页的表格 */
  table?: { headers?: unknown[]; rows?: unknown[][] };
}

export interface GenerateFileContent {
  sheetName?: string;
  headers?: unknown[];
  rows?: unknown[][];
  sheets?: { name?: string; headers?: unknown[]; rows?: unknown[][] }[];
  title?: string;
  /** PPT 副标题 */
  subtitle?: string;
  paragraphs?: unknown[];
  text?: string;
  /** PPT：按页给内容；不给则用 text 里的 Markdown 标题自动分页 */
  slides?: GenerateSlide[];
}

/** PPT 单页上限与每页要点上限（防止模型一次塞几百页） */
const PPT_MAX_SLIDES = 30;
const PPT_MAX_BULLETS = 12;

/** 把 Markdown 风格文本切成页：`#` 标题页 / `##` 新页 / `- `、`1. ` 作要点 */
function markdownToSlides(text: string, fallbackTitle: string): GenerateSlide[] {
  const slides: GenerateSlide[] = [];
  let current: GenerateSlide | null = null;
  const push = () => {
    if (current) slides.push(current);
  };

  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      push();
      current = { title: heading[2].trim(), bullets: [] };
      continue;
    }
    if (!current) current = { title: fallbackTitle, bullets: [] };
    const bullet = line.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
    (current.bullets as unknown[]).push(bullet ? bullet[1] : line);
  }
  push();

  if (slides.length === 0) slides.push({ title: fallbackTitle, bullets: ['（无内容）'] });
  return slides;
}

/** 生成 .pptx（pptxgenjs，纯 JS） */
async function writePptx(filePath: string, content: GenerateFileContent): Promise<void> {
  const mod: any = require('pptxgenjs');
  const PptxGenJS = mod?.default || mod;
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';

  const title = String(content.title || '分析报告');
  const subtitle = content.subtitle ? String(content.subtitle) : '';

  // 封面
  const cover = pptx.addSlide();
  cover.addText(title, { x: 0.5, y: 1.6, w: 9, h: 1.4, fontSize: 32, bold: true, align: 'center' });
  if (subtitle) {
    cover.addText(subtitle, { x: 0.5, y: 3.1, w: 9, h: 0.8, fontSize: 16, color: '666666', align: 'center' });
  }
  cover.addText(new Date().toLocaleDateString('zh-CN'), { x: 0.5, y: 4.6, w: 9, h: 0.5, fontSize: 12, color: '999999', align: 'center' });

  // 内容页
  const slides: GenerateSlide[] =
    Array.isArray(content.slides) && content.slides.length > 0
      ? content.slides
      : markdownToSlides(String(content.text || ''), title);

  for (const s of slides.slice(0, PPT_MAX_SLIDES)) {
    const page = pptx.addSlide();
    page.addText(String(s?.title || title), { x: 0.5, y: 0.4, w: 9, h: 0.9, fontSize: 22, bold: true });

    let y = 1.5;
    const bullets = Array.isArray(s?.bullets) ? s.bullets.filter(Boolean).slice(0, PPT_MAX_BULLETS) : [];
    if (bullets.length > 0) {
      page.addText(
        bullets.map((b) => ({ text: String(b), options: { bullet: true, breakLine: true } })),
        { x: 0.7, y, w: 8.6, h: 3.6, fontSize: 15, lineSpacingMultiple: 1.2 }
      );
      y += 3.6;
    } else if (s?.text) {
      page.addText(String(s.text), { x: 0.7, y, w: 8.6, h: 3.6, fontSize: 15 });
      y += 3.6;
    }

    const table = s?.table;
    if (table && Array.isArray(table.rows) && table.rows.length > 0) {
      const header = Array.isArray(table.headers) ? table.headers.map((h) => String(h)) : null;
      const rows = table.rows.slice(0, 12).map((r) => (Array.isArray(r) ? r : [r]).map((c) => String(c ?? '')));
      const body = (header ? [header, ...rows] : rows).map((cells, i) =>
        cells.map((c) => ({
          text: c,
          options: i === 0 && header ? { bold: true, fill: 'F2F2F2' } : {},
        }))
      );
      page.addTable(body as any, { x: 0.7, y: Math.min(y, 5.1), w: 8.6, fontSize: 11, border: { pt: 0.5, color: 'DDDDDD' } });
    }
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
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
  if (t !== 'excel' && t !== 'word' && t !== 'ppt') {
    throw new Error("type 仅支持 'excel'、'word' 或 'ppt'");
  }
  if (!content || typeof content !== 'object') {
    throw new Error('content 必须是一个对象');
  }

  const ext = t === 'excel' ? '.xlsx' : t === 'ppt' ? '.pptx' : '.docx';
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
  } else if (t === 'word') {
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

  if (t === 'ppt') {
    await writePptx(filePath, content);
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
