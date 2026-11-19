import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { generateLessonPlanContent } from '@/lib/ai/lesson-plan-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const body = await req.json().catch(() => ({}));
    if (!String(body?.topic || '').trim()) {
      return NextResponse.json({ error: '请先填写教案主题或训练目标' }, { status: 400 });
    }

    const result = await generateLessonPlanContent(body);
    console.log(
      `[lesson-plan-ai] 类型=${body?.type === 'group' ? 'group' : 'personal'} ` +
        `主题=${String(body.topic).slice(0, 40)} 生成人=${staff.value.name || staff.value.id} ` +
        `耗时=${result.meta.latencyMs}ms 字数=${result.content.length}`
    );
    return NextResponse.json(result);
  } catch (err: any) {
    const message = String(err?.message || err);
    const status = /未配置/.test(message) ? 400 : 502;
    console.error('[lesson-plan-ai] 生成失败:', message);
    return NextResponse.json(
      { error: message || '教案生成失败，请稍后重试' },
      { status }
    );
  }
}
