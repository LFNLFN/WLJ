import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { parseLooseJson } from '@/lib/ai/parse-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROBLEM_LABELS: Record<string, string> = {
  language: '语言发育迟缓',
  social: '社交发育迟缓',
  motor: '动作发育迟缓',
  cognitive: '认知发育迟缓',
  attention: '注意力/多动',
  sensory: '感觉统合失调',
  asd: '自闭症谱系',
  feeding: '喂养/吞咽困难',
  speech: '构音/语音障碍',
  unknown: '不确定/综合发展',
};

const SYSTEM_PROMPT = [
  '你是「未来家儿童能力发展中心」的儿童康复训练计划制定专家。',
  '根据学生信息、主要问题和补充说明，生成一份可执行的训练阶段计划。',
  '硬性规则：',
  '1. 只输出 JSON，不要 markdown 代码块、不要解释。',
  '2. 不做医学诊断，不写药物/治疗方案；训练建议仅用于康复训练参考，需治疗师审核。',
  '3. 训练内容要具体、可操作，写明活动/次数或时长/辅助方式/观察指标。',
  '4. 学生问题不明确（unknown）时：第一阶段以观察、建立配合、基线评估为主，并在 notes 注明“需进一步评估后调整”。',
  '5. 至少 2 个训练模块；每个模块 2-3 个阶段；每个阶段 3-6 条具体训练内容。',
  '6. 语言：简体中文，家长和教师都能看懂。',
  '输出结构：',
  '{"organization":"未来家儿童能力发展中心","planTitle":"XX的训练阶段计划",'
  + '"child":{"name":"","birthDate":"","age":"","diagnosis":"","cooperationLevel":"","languageEnvironment":"","assessmentDate":"","recordNumber":""},'
  + '"trainingModules":[{"moduleTitle":"一、模块名称","initialAssessment":["初评条目"],'
  + '"stages":[{"title":"第一阶段（初、中阶）计划","period":"1-3个月","items":["训练内容"]}]}],'
  + '"notes":"","signatures":{"mainTeacher":"","reviewer":""}}',
].join('\n');

function parseJson(text: string): any {
  return parseLooseJson(text);
}

function asStringArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  return [String(value)];
}

function normalizePlan(parsed: any, fallback: { name: string; birthDate: string; age: string; diagnosis: string }) {
  const modules = Array.isArray(parsed?.trainingModules) ? parsed.trainingModules : [];
  const trainingModules = modules.map((mod: any, idx: number) => {
    const stages = Array.isArray(mod?.stages) ? mod.stages : [];
    return {
      moduleTitle: String(mod?.moduleTitle || `模块${idx + 1}`),
      initialAssessment: asStringArray(mod?.initialAssessment),
      stages: stages.map((stage: any, sIdx: number) => ({
        title: String(stage?.title || `第${sIdx + 1}阶段`),
        period: String(stage?.period || ''),
        items: asStringArray(stage?.items),
      })).filter((s: any) => s.items.length > 0),
    };
  }).filter((m: any) => m.stages.length > 0);

  if (trainingModules.length === 0) throw new Error('模型没有生成有效的训练模块');

  return {
    schemaVersion: '1.0.0',
    documentType: 'children_training_stage_plan',
    sourceFile: '',
    organization: String(parsed?.organization || '未来家儿童能力发展中心'),
    planTitle: String(parsed?.planTitle || `${fallback.name || '学生'}的训练阶段计划`),
    child: {
      name: fallback.name,
      birthDate: fallback.birthDate,
      age: fallback.age,
      diagnosis: fallback.diagnosis,
      cooperationLevel: String(parsed?.child?.cooperationLevel || ''),
      languageEnvironment: String(parsed?.child?.languageEnvironment || ''),
      assessmentDate: String(parsed?.child?.assessmentDate || new Date().toISOString().slice(0, 10).replace(/-/g, '.')),
      recordNumber: String(parsed?.child?.recordNumber || ''),
    },
    trainingModules,
    notes: String(parsed?.notes || ''),
    signatures: {
      mainTeacher: String(parsed?.signatures?.mainTeacher || ''),
      reviewer: String(parsed?.signatures?.reviewer || ''),
    },
  };
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
      process.env.ARK_TRAINING_MODEL_ENDPOINT ||
      process.env.ARK_DRAFT_MODEL_ENDPOINT ||
      process.env.ARK_MODEL_ENDPOINT ||
      '';
    if (!apiKey) return NextResponse.json({ error: '未配置 ARK_API_KEY' }, { status: 400 });
    if (!model) return NextResponse.json({ error: '未配置 ARK_MODEL_ENDPOINT' }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const studentId = String(body?.studentId || '');
    let studentName = String(body?.studentName || '');
    let studentAge = String(body?.studentAge || '');
    let birthDate = '';

    if (studentId) {
      const found = await db.query('SELECT name, "birthDate", age FROM students WHERE id = $1', [studentId]);
      const s = found.rows[0];
      if (s) {
        studentName = s.name || studentName;
        studentAge = s.age ? String(s.age) : studentAge;
        birthDate = s.birthDate || '';
      }
    }

    const problemIds: string[] = Array.isArray(body?.problems) && body.problems.length > 0
      ? body.problems.map((p: any) => String(p))
      : ['unknown'];
    const problemLabels = problemIds.map((id) => PROBLEM_LABELS[id] || id);
    const notes = String(body?.notes || '').slice(0, 2000);

    // 参考教案（最多 5 份，只取标题/类型/正文摘要）
    const lessonPlanIds: string[] = Array.isArray(body?.lessonPlanIds)
      ? body.lessonPlanIds.map((x: any) => String(x)).slice(0, 5)
      : [];
    let lessonRefs = '';
    if (lessonPlanIds.length > 0) {
      const found = await db.query(
        'SELECT id, title, type, content FROM lesson_plans WHERE id = ANY($1::text[])',
        [lessonPlanIds]
      );
      lessonRefs = found.rows
        .map((r: any, idx: number) => {
          const typeLabel = r.type === 'group' ? '集体' : '个人';
          return `${idx + 1}. [${typeLabel}] ${r.title}\n${String(r.content || '').slice(0, 800)}`;
        })
        .join('\n\n');
    }

    const userContent = [
      `学生：${studentName || '未提供姓名'}`,
      `年龄：${studentAge || (body?.studentAge || '未提供')}`,
      `性别：${body?.studentGender || '未提供'}`,
      `主要问题：${problemLabels.join('、')}`,
      notes ? `补充说明/提示词：\n${notes}` : '补充说明：无',
      lessonRefs
        ? `参考教案（仅参考活动设计与训练内容，不要照搬，不适用可忽略）：\n${lessonRefs}`
        : '参考教案：未选择',
      '',
      '请输出训练阶段计划 JSON。',
    ].join('\n');

    const thinkingMode = (process.env.ARK_TRAINING_THINKING || '').trim().toLowerCase();
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
      temperature: 0.4,
      max_tokens: 3500,
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
    const plan = normalizePlan(parsed, {
      name: studentName,
      birthDate,
      age: studentAge,
      diagnosis: problemLabels.join('、'),
    });

    console.log(
      `[training-plan-ai] 学生=${studentName || studentId || '-'} 问题=${problemLabels.join('/')} ` +
        `参考教案=${lessonPlanIds.length} 生成人=${staff.value.name || staff.value.id} ` +
        `耗时=${Date.now() - startedAt}ms 模块=${plan.trainingModules.length}`
    );

    return NextResponse.json({
      plan,
      meta: {
        model,
        latencyMs: Date.now() - startedAt,
        usage: response.usage || null,
      },
    });
  } catch (err: any) {
    console.error('[training-plan-ai] 生成失败:', err?.message || err);
    return NextResponse.json(
      { error: err?.message || '训练计划生成失败，请稍后重试' },
      { status: 502 }
    );
  }
}
