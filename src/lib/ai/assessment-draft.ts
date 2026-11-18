import OpenAI from 'openai';
import { buildReviewRows, formatAnswer, formatOption } from '@/lib/scale-question-bank';

/**
 * 评估结果草稿生成（文书辅助）
 *
 * 设计原则：
 * - 分数/等级由规则计算，模型只负责写“结论/建议”草稿；
 * - 只把记录中真实存在的结构化证据给模型，要求 JSON 输出；
 * - 生成结果必须由评估员确认/修改后才写入正式结论；
 * - 出现记录中不存在的分数时，重试一次并标注待核对。
 */

export const DRAFT_PROMPT_VERSION = 'assessment-draft-v1';

export interface DraftRecommendation {
  domain: string;
  advice: string;
  evidence: string[];
}

export interface DraftPayload {
  summary: string;
  strengths: string[];
  difficulties: string[];
  recommendations: DraftRecommendation[];
  redFlags: { item: string; text: string }[];
  uncertainties: string[];
}

export interface DraftMeta {
  model: string;
  promptVersion: string;
  generatedAt: string;
  latencyMs: number;
  evidenceRows: number;
  numericCheck: 'passed' | 'warn';
  usage?: unknown;
}

export interface DraftResult extends DraftPayload {
  meta: DraftMeta;
}

/** 把结构化建议转成可编辑的纯文本（每条一行） */
export function formatDraftRecommendations(draft: Pick<DraftPayload, 'recommendations'>): string {
  return draft.recommendations
    .map((r, idx) => `${idx + 1}. ${r.domain ? '【' + r.domain + '】' : ''}${r.advice}`)
    .join('\n');
}

export class DraftGenerationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'DraftGenerationError';
    this.statusCode = statusCode;
  }
}

const MAX_ROWS = 100;

function clip(value: unknown, max = 300): string {
  const text = value === undefined || value === null ? '' : String(value);
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

/** 只挑出存在的分数/结论字段，避免把整份 rawdata 塞给模型 */
function pickScores(raw: any) {
  const keys = [
    'totalScore', 'maxScore', 'overallScore', 'percentage', 'level', 'levelText',
    'overallLevel', 'severity', 'conclusion', 'rawScore', 'standardScore', 'scoreDesc',
    'sectionScores',
  ];
  const out: Record<string, unknown> = {};
  keys.forEach((k) => {
    const v = raw ? raw[k] : undefined;
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  });
  return out;
}

function buildEvidence(raw: any) {
  const { rows, dimensionResults } = buildReviewRows(raw || {});
  const form = (raw && raw.formData) || {};

  const items = rows.slice(0, MAX_ROWS).map((row) => {
    const selected = row.options.find((o) => String(o.value) === String(row.value));
    return {
      id: row.key,
      no: row.no,
      section: row.section || '',
      question: clip(row.question, 240),
      answer: selected ? formatOption(selected) : formatAnswer(row.value, row.label),
      options: row.options.map((o) => clip(formatOption(o), 160)),
      note: clip(row.note, 200),
      ...(row.score !== undefined && row.score !== null ? { score: row.score } : {}),
    };
  });

  const dimensions = dimensionResults.map((d: any) => ({
    name: d.factorName || d.name || '',
    avgScore: d.avgScore,
    totalScore: d.totalScore,
    maxScore: d.maxScore,
    level: d.levelText || d.level || '',
    description: clip(d.description, 200),
  }));

  const summaryData = (raw && raw.summaryData) || {};
  const freeText = {
    texts: raw && raw.texts ? raw.texts : {},
    notes: raw && raw.notes ? raw.notes : {},
    feeding: raw && raw.feeding ? raw.feeding : {},
    textures: asArray(raw && raw.textures ? raw.textures : raw && raw.textureRows).slice(0, 8),
    overall: summaryData.overall || '',
    functionImpact: summaryData.impact || [],
    advice: summaryData.advice || [],
    safety: {
      texture: summaryData.texture || '',
      liquid: summaryData.liquid || '',
      tools: summaryData.tools || '',
      supervision: summaryData.supervision || '',
      strategies: summaryData.strategies || '',
      goals: summaryData.goals || '',
    },
    analysis: clip(raw && raw.analysis, 400),
    suggestions: clip(raw && raw.suggestions, 400),
  };

  const scaleHints: Record<string, string> = {
    'oral-motor': '口腔运动任务的 0/1/2/3 是记录分，N/O 表示未观察，不能计为异常，也不能据此下吞咽障碍诊断。',
    'mch-fs': 'rawScore/standardScore/conclusion 是规则计算结果，直接引用，不要重算。',
    'sensory': '该记录只有维度汇总，没有逐题答案，不要编造题目级表现。',
    'autism': 'PEP-3 结果只做描述性总结，不做诊断。',
  };

  return {
    scale: {
      id: (raw && raw.scaleId) || '',
      name: (raw && (raw.scaleName || raw.scalename)) || '',
      hint: scaleHints[(raw && raw.scaleId) || ''] || '',
    },
    profile: {
      age: form.age || (raw && raw.age) || '',
      gender: form.gender || (raw && raw.gender) || '',
      grade: form.grade || '',
      evaluationDate: form.eval_date || form.date || (raw && (raw.evaluationdate || raw.evaluationDate)) || '',
    },
    scores: pickScores(raw),
    dimensions,
    items,
    counts: { items: items.length },
    freeText,
    dataNote: items.length === 0
      ? '没有逐题答案，只有维度汇总；不要编造题目级结论。'
      : '',
  };
}

const SYSTEM_PROMPT = [
  '你是「未来家儿童能力发展中心」的评估文书助手。',
  '任务：根据给定的结构化评估记录，起草一份供治疗师/评估员修改的评估结果草稿。',
  '硬性规则：',
  '1. 只能使用输入中出现的事实、分数、等级、答案。不得编造分数、常模、诊断或未记录的表现。',
  '2. 分值是规则计算的结果，直接引用；不要重新计算、换算或改变。',
  '3. 不做医学诊断，不建议药物或具体治疗方案。涉及吞咽/进食安全时，只复述记录中的红旗，并建议按机构流程进一步评估。',
  '4. 资料不足时写入 uncertainties，不要猜测。',
  '5. 建议要具体、可执行，并与评估维度对应；recommendations[].evidence 填题目 id（没有逐题数据时可为空数组）。',
  '6. 语言：简体中文，专业但家长可读；避免绝对化结论，不使用“确诊”“治愈”等表述。',
  '输出严格 JSON（不要 markdown 代码块、不要额外说明）：',
  '{"summary":"2-4句综合结论","strengths":["..."],"difficulties":["..."],'
  + '"recommendations":[{"domain":"维度","advice":"建议","evidence":["题目id"]}],'
  + '"redFlags":[{"item":"题目id或名称","text":"记录中的原话"}],"uncertainties":["..."]}',
].join('\n');

function parseModelJson(text: string): any {
  let body = String(text || '').trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new DraftGenerationError('模型没有返回有效 JSON，请重试', 502);
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new DraftGenerationError('模型返回的 JSON 无法解析，请重试', 502);
  }
}

function normalizeDraft(obj: any): DraftPayload {
  const summary = clip(obj && obj.summary, 1500);
  const strengths = asArray(obj && obj.strengths).map((x) => clip(x, 200)).filter(Boolean).slice(0, 8);
  const difficulties = asArray(obj && obj.difficulties).map((x) => clip(x, 200)).filter(Boolean).slice(0, 8);
  const recommendations: DraftRecommendation[] = asArray(obj && obj.recommendations)
    .map((r: any) => ({
      domain: clip(r && r.domain, 60),
      advice: clip(r && r.advice, 500),
      evidence: asArray(r && r.evidence).map((x) => clip(x, 60)).filter(Boolean).slice(0, 12),
    }))
    .filter((r) => r.advice)
    .slice(0, 10);
  const redFlags = asArray(obj && obj.redFlags)
    .map((r: any) => ({ item: clip(r && r.item, 80), text: clip(r && r.text, 200) }))
    .filter((r) => r.text)
    .slice(0, 8);
  const uncertainties = asArray(obj && obj.uncertainties).map((x) => clip(x, 200)).filter(Boolean).slice(0, 8);

  if (!summary && recommendations.length === 0) {
    throw new DraftGenerationError('模型生成内容为空，请重试', 502);
  }
  return { summary, strengths, difficulties, recommendations, redFlags, uncertainties };
}

/** 收集证据里出现过的数字，用于检查模型是否编造分数 */
function collectNumbers(value: unknown, out: Set<string>, depth = 0) {
  if (depth > 6 || value === undefined || value === null) return;
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.add(String(value));
    return;
  }
  if (typeof value === 'string') {
    const matches = value.match(/\d+(?:\.\d+)?/g) || [];
    matches.forEach((m) => out.add(m));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectNumbers(v, out, depth + 1));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((v) => collectNumbers(v, out, depth + 1));
  }
}

/** 找出草稿里“X 分”但证据中不存在的分数（返回可疑片段，不直接修改内容） */
function findSuspiciousScores(draft: DraftPayload, evidence: any): string[] {
  const allowed = new Set<string>();
  collectNumbers(evidence.scores, allowed);
  collectNumbers(evidence.dimensions, allowed);
  collectNumbers(evidence.items.map((i: any) => i.score), allowed);
  collectNumbers(evidence.profile.age, allowed);
  collectNumbers(evidence.counts, allowed);
  // 常见量表分值范围（0-3、1-5、1-7）不视为编造
  ['0', '1', '2', '3', '4', '5', '6', '7', '10', '100'].forEach((n) => allowed.add(n));

  const texts = [draft.summary, ...draft.recommendations.map((r) => r.advice)].join('\n');
  const regex = /(?<![-–—\d])(\d+(?:\.\d+)?)\s*分/g;
  const suspicious: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texts))) {
    if (!allowed.has(m[1])) suspicious.push(m[0]);
  }
  return Array.from(new Set(suspicious)).slice(0, 5);
}

async function callModel(messages: any[], model: string, thinking: any, maxTokens: number) {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) throw new DraftGenerationError('未配置 ARK_API_KEY，无法生成 AI 草稿', 400);
  if (!model) throw new DraftGenerationError('未配置 ARK_MODEL_ENDPOINT（或 ARK_DRAFT_MODEL_ENDPOINT），无法生成 AI 草稿', 400);

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    timeout: 75_000,
    maxRetries: 0,
  });

  const payload: any = { model, messages, temperature: 0.2, max_tokens: maxTokens };
  if (thinking) payload.thinking = thinking;

  try {
    return await client.chat.completions.create(payload);
  } catch (err: any) {
    const raw = String(err?.message || err);
    // 接入点不支持 thinking/temperature 等参数时去掉后重试一次
    if (payload.thinking || /temperature|max_tokens|thinking/i.test(raw)) {
      delete payload.thinking;
      delete payload.temperature;
      return await client.chat.completions.create(payload);
    }
    throw err;
  }
}

export async function generateAssessmentDraft(raw: any): Promise<DraftResult> {
  const evidence = buildEvidence(raw);
  const hasEvidence =
    evidence.items.length > 0 ||
    evidence.dimensions.length > 0 ||
    Object.keys(evidence.scores).length > 0;
  if (!hasEvidence) {
    throw new DraftGenerationError('该记录没有足够的评估数据（答案/分数为空），无法生成草稿', 400);
  }

  const model = process.env.ARK_DRAFT_MODEL_ENDPOINT || process.env.ARK_MODEL_ENDPOINT || '';
  const thinkingMode = (process.env.ARK_DRAFT_THINKING || '').trim().toLowerCase();
  // 默认关闭 thinking：与聊天一致，保证 10 秒级返回；
  // 想要更高质量可设 ARK_DRAFT_THINKING=default（会慢很多，注意请求超时）。
  const thinking = ['default', 'on', 'enabled'].includes(thinkingMode)
    ? undefined
    : { type: 'disabled' };

  const userContent = [
    '以下是本次评估记录（已去除姓名等不必要的身份信息）：',
    JSON.stringify(evidence),
    '',
    '请按系统要求输出 JSON 草稿。',
  ].join('\n');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];

  const startedAt = Date.now();
  let response = await callModel(messages, model, thinking, 2200);
  let content = response.choices?.[0]?.message?.content || '';
  let draft = normalizeDraft(parseModelJson(content));

  let numericCheck: 'passed' | 'warn' = 'passed';
  let suspicious = findSuspiciousScores(draft, evidence);
  if (suspicious.length > 0) {
    // 发现记录中不存在的分数：带上纠正提示重试一次
    numericCheck = 'warn';
    const retryMessages = [
      ...messages,
      { role: 'assistant', content },
      {
        role: 'user',
        content: `你上一版草稿提到了记录中不存在的分数：${suspicious.join('、')}。请只引用输入中真实出现的分数，重新输出完整 JSON。`,
      },
    ];
    response = await callModel(retryMessages, model, thinking, 2200);
    content = response.choices?.[0]?.message?.content || '';
    draft = normalizeDraft(parseModelJson(content));
    suspicious = findSuspiciousScores(draft, evidence);
    if (suspicious.length > 0) {
      draft.uncertainties.push(`系统校验：草稿中提到“${suspicious.join('、')}”，但记录中未找到对应分数，请人工核对。`);
    }
  }

  return {
    ...draft,
    meta: {
      model,
      promptVersion: DRAFT_PROMPT_VERSION,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      evidenceRows: evidence.items.length,
      numericCheck,
      usage: response.usage || undefined,
    },
  };
}
