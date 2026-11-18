import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { parseLooseJson } from '@/lib/ai/parse-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function parseJson(text: string): any {
  return parseLooseJson(text);
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const apiKey = process.env.ARK_API_KEY;
    const model =
      process.env.ARK_LESSON_MODEL_ENDPOINT ||
      process.env.ARK_TRAINING_MODEL_ENDPOINT ||
      process.env.ARK_DRAFT_MODEL_ENDPOINT ||
      process.env.ARK_MODEL_ENDPOINT ||
      '';
    if (!apiKey) return NextResponse.json({ error: '未配置 ARK_API_KEY' }, { status: 400 });
    if (!model) return NextResponse.json({ error: '未配置 ARK_MODEL_ENDPOINT' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const type = body?.type === 'group' ? 'group' : 'personal';
    const topic = String(body?.topic || '').trim();
    if (!topic) return NextResponse.json({ error: '请先填写教案主题或训练目标' }, { status: 400 });

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
    const payload: any = {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.5,
      max_tokens: 2800,
    };
    if (thinking) payload.thinking = thinking;

    let response;
    try {
      response = await client.chat.completions.create(payload);
    } catch (err: any) {
      const raw = String(err?.message || err);
      if (payload.thinking || /temperature|max_tokens|thinking/i.test(raw)) {
        delete payload.thinking;
        delete payload.temperature;
        response = await client.chat.completions.create(payload);
      } else {
        throw err;
      }
    }

    const content = response.choices?.[0]?.message?.content || '';
    const parsed = parseJson(content);
    const title = String(parsed?.title || topic).slice(0, 120);
    const markdown = String(parsed?.content || '').trim();
    if (!markdown) throw new Error('模型没有生成教案正文，请重试');

    console.log(
      `[lesson-plan-ai] 类型=${type} 主题=${topic.slice(0, 40)} 生成人=${staff.value.name || staff.value.id} ` +
        `耗时=${Date.now() - startedAt}ms 字数=${markdown.length}`
    );

    return NextResponse.json({
      title,
      content: markdown,
      meta: { model, latencyMs: Date.now() - startedAt, usage: response.usage || null },
    });
  } catch (err: any) {
    console.error('[lesson-plan-ai] 生成失败:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || '教案生成失败，请稍后重试' },
      { status: 502 }
    );
  }
}
