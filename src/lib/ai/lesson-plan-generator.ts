import OpenAI from 'openai';
import { parseLooseJson } from './parse-json';

/**
 * AI 教案生成（可被同步接口和小程序后台任务复用）
 */

export const LESSON_PROMPT_VERSION = 'lesson-plan-v1';

const FOCUS_LABELS: Record<string, string> = {
  language: '语言沟通',
  social: '社交互动',
  cognitive: '认知',
  motor: '动作/精细',
  sensory: '感觉统合',
  attention: '注意力',
  selfcare: '生活自理',
  emotion: '情绪行为',
};

const SYSTEM_PROMPT = [
  '你是「未来家儿童能力发展中心」的特殊教育/康复教案设计专家。',
  '根据用户给出的主题、对象、时长和训练重点，生成一份可以直接使用的教案。',
  '硬性规则：',
  '1. 只输出 JSON：{"title":"教案标题","content":"Markdown 正文"}，不要 markdown 代码块。',
  '2. content 必须包含以下小节：活动目标（3 条，可观察）、适用对象与形式、时长与准备材料、活动流程（导入/主要活动/结束与总结，标注分钟）、家庭延伸/注意事项。',
  '3. 个人教案按 1 对 1 个别化设计；集体教案要写清分组、轮流、规则与差异化支持。',
  '4. 训练内容具体、可操作；不做医学诊断，不建议药物；涉及喂养/吞咽安全时提示按机构流程评估。',
  '5. 语言：简体中文，教师和家长都能看懂；避免绝对化表述。',
].join('\n');

export interface LessonGenerationResult {
  title: string;
  content: string;
  meta: {
    model: string;
    promptVersion: string;
    latencyMs: number;
    usage: unknown;
  };
}

export async function generateLessonPlanContent(body: any): Promise<LessonGenerationResult> {
  const apiKey = process.env.ARK_API_KEY;
  const model =
    process.env.ARK_LESSON_MODEL_ENDPOINT ||
    process.env.ARK_TRAINING_MODEL_ENDPOINT ||
    process.env.ARK_DRAFT_MODEL_ENDPOINT ||
    process.env.ARK_MODEL_ENDPOINT ||
    '';
  if (!apiKey) throw new Error('未配置 ARK_API_KEY');
  if (!model) throw new Error('未配置 ARK_MODEL_ENDPOINT');

  const type = body?.type === 'group' ? 'group' : 'personal';
  const topic = String(body?.topic || '').trim();
  if (!topic) throw new Error('请先填写教案主题或训练目标');

  const focusLabels = Array.isArray(body?.focus)
    ? body.focus.map((id: any) => FOCUS_LABELS[String(id)] || String(id))
    : [];

  const userContent = [
    `教案类型：${type === 'group' ? '集体教案（小组/班级）' : '个人教案（1对1/个别化）'}`,
    `主题/训练目标：${topic}`,
    `适用年龄/能力：${body?.ageGroup || '未提供'}`,
    `时长：${body?.duration || '未提供'}`,
    `人数/形式：${body?.groupSize || (type === 'group' ? '小组' : '1对1')}`,
    `训练重点：${focusLabels.length ? focusLabels.join('、') : '未指定'}`,
    body?.notes ? `补充说明：\n${String(body.notes).slice(0, 2000)}` : '补充说明：无',
    '',
    '请输出教案 JSON。',
  ].join('\n');

  const thinkingMode = (process.env.ARK_LESSON_THINKING || '').trim().toLowerCase();
  const thinking = ['default', 'on', 'enabled'].includes(thinkingMode)
    ? undefined
    : { type: 'disabled' };

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    timeout: 120_000,
    maxRetries: 0,
  });

  const startedAt = Date.now();
  const callModel = async (extraInstruction: string | undefined, maxTokens: number) => {
    const payload: any = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent + (extraInstruction ? `\n\n${extraInstruction}` : '') },
      ],
      temperature: 0.5,
      max_tokens: maxTokens,
    };
    if (thinking) payload.thinking = thinking;
    try {
      return await client.chat.completions.create(payload);
    } catch (err: any) {
      const raw = String(err?.message || err);
      if (payload.thinking || /temperature|max_tokens|thinking/i.test(raw)) {
        delete payload.thinking;
        delete payload.temperature;
        return await client.chat.completions.create(payload);
      }
      throw err;
    }
  };

  let response = await callModel(undefined, 2800);
  if (response.choices?.[0]?.finish_reason === 'length') {
    response = await callModel('上一次输出被截断，请压缩内容但保留完整 JSON。', 3500);
  }
  let content = response.choices?.[0]?.message?.content || '';
  let parsed: any;
  try {
    parsed = parseLooseJson(content);
  } catch (err) {
    response = await callModel(
      '上一次输出不是合法 JSON。请重新输出完整 JSON：字符串使用双引号并转义内部引号，不要 markdown 代码块。',
      3200
    );
    content = response.choices?.[0]?.message?.content || '';
    parsed = parseLooseJson(content);
  }

  const title = String(parsed?.title || topic).slice(0, 120);
  const markdown = String(parsed?.content || '').trim();
  if (!markdown) throw new Error('模型没有生成教案正文，请重试');

  return {
    title,
    content: markdown,
    meta: {
      model,
      promptVersion: LESSON_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
      usage: response.usage || null,
    },
  };
}
