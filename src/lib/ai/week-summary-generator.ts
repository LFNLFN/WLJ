import OpenAI from 'openai';
import { parseLooseJson } from './parse-json';

/**
 * AI 课程周总结生成
 *
 * 输入一周内每节课的课后记录（教学内容/课堂表现/课堂总结/课后作业），
 * 输出一份给家长看的「每周课堂总结」和「家庭练习建议」。
 * 教师确认/修改后再提交，草稿不会展示给家长。
 */

export const WEEK_SUMMARY_PROMPT_VERSION = 'course-week-summary-v1';

const SYSTEM_PROMPT = [
  '你是「未来家儿童能力发展中心」的康复/特教老师，负责把一周内每节课的课后记录整理成给家长看的周总结。',
  '硬性规则：',
  '1. 只依据提供的课节记录，不虚构孩子表现、不假设诊断。',
  '2. 如果提供了学生姓名，请围绕这个孩子来写；不要编造记录中没有的表现。',
  '3. 只写目标学生，不要提及其他孩子的姓名；课节记录中如果出现其他孩子，请忽略。',
  '4. 合并重复内容，突出本周训练重点、孩子的进步/亮点、需要继续关注的点、家庭练习建议。',
  '5. 语言简洁、具体、家长能看懂；不做医学诊断，不推荐药物。',
  '6. 只输出 JSON：{"summary":"周总结正文","homework":"家庭练习建议"}，不要 markdown 代码块。',
  '7. summary 建议 200-500 字，可用「本周重点 / 孩子表现 / 需要关注 / 下一步」等小标题分段；homework 控制在 100 字以内。',
].join('\n');

export interface WeekSummaryResult {
  summary: string;
  homework: string;
  meta: {
    model: string;
    promptVersion: string;
    latencyMs: number;
    usage: unknown;
  };
}

function lessonLine(lesson: any, index: number) {
  const parts = [
    `第 ${lesson.lessonNo || index + 1} 节`,
    lesson.date ? `日期：${lesson.date}` : '',
    lesson.content ? `教学内容：${String(lesson.content).slice(0, 500)}` : '',
    lesson.performance ? `课堂表现：${String(lesson.performance).slice(0, 400)}` : '',
    lesson.summary ? `课堂总结：${String(lesson.summary).slice(0, 500)}` : '',
    lesson.homework ? `课后练习：${String(lesson.homework).slice(0, 300)}` : '',
  ].filter(Boolean);
  return parts.join('\n');
}

export async function generateWeekSummaryContent(body: any): Promise<WeekSummaryResult> {
  const apiKey = process.env.ARK_API_KEY;
  const model =
    process.env.ARK_LESSON_MODEL_ENDPOINT ||
    process.env.ARK_TRAINING_MODEL_ENDPOINT ||
    process.env.ARK_DRAFT_MODEL_ENDPOINT ||
    process.env.ARK_MODEL_ENDPOINT ||
    '';
  if (!apiKey) throw new Error('未配置 ARK_API_KEY');
  if (!model) throw new Error('未配置 ARK_MODEL_ENDPOINT');

  const lessons: any[] = Array.isArray(body?.lessons) ? body.lessons.slice(0, 10) : [];
  if (lessons.length === 0) throw new Error('本周还没有课节记录，无法生成周总结');

  const weekStart = String(body?.weekStart || '');
  const weekEnd = String(body?.weekEnd || '');
  const courseName = String(body?.courseName || '课程');
  const studentName = String(body?.studentName || '').trim();
  const teacherName = String(body?.teacherName || '');

  const userContent = [
    `课程：${courseName}`,
    `学生：${studentName || '未填写姓名'}`,
    teacherName ? `授课教师：${teacherName}` : '',
    `周期：${weekStart || '未填写'} 至 ${weekEnd || '未填写'}`,
    '',
    '本周课节记录：',
    lessons.map((lesson, index) => lessonLine(lesson, index)).join('\n\n'),
    '',
    `请为${studentName ? `学生「${studentName}」` : '该学生'}输出周总结 JSON。`,
  ]
    .filter((line) => line !== '')
    .join('\n');

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
      temperature: 0.4,
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

  let response = await callModel(undefined, 2200);
  if (response.choices?.[0]?.finish_reason === 'length') {
    response = await callModel('上一次输出被截断，请压缩内容但保留完整 JSON。', 2800);
  }

  let content = response.choices?.[0]?.message?.content || '';
  let parsed: any;
  try {
    parsed = parseLooseJson(content);
  } catch {
    response = await callModel(
      '上一次输出不是合法 JSON。请重新输出完整 JSON：字符串使用双引号并转义内部引号，不要 markdown 代码块。',
      2600
    );
    content = response.choices?.[0]?.message?.content || '';
    parsed = parseLooseJson(content);
  }

  const summary = String(parsed?.summary || '').trim();
  const homework = String(parsed?.homework || '').trim();
  if (!summary) throw new Error('模型没有生成周总结内容，请重试');

  return {
    summary,
    homework,
    meta: {
      model,
      promptVersion: WEEK_SUMMARY_PROMPT_VERSION,
      latencyMs: Date.now() - startedAt,
      usage: response.usage || null,
    },
  };
}
