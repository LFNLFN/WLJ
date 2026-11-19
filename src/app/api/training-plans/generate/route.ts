import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { generateTrainingPlanContent } from '@/lib/ai/training-plan-generator';

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
    const result = await generateTrainingPlanContent(db, body);

    console.log(
      `[training-plan-ai] 学生=${body?.studentName || body?.studentId || '-'} ` +
        `问题=${(Array.isArray(body?.problems) ? body.problems : ['unknown']).join('/')} ` +
        `参考教案=${Array.isArray(body?.lessonPlanIds) ? body.lessonPlanIds.length : 0} ` +
        `生成人=${staff.value.name || staff.value.id} ` +
        `耗时=${result.meta.latencyMs}ms 模块=${result.plan.trainingModules.length}`
    );

    return NextResponse.json(result);
  } catch (err: any) {
    const message = String(err?.message || err);
    const status = /未配置/.test(message) ? 400 : 502;
    console.error('[training-plan-ai] 生成失败:', message);
    return NextResponse.json(
      { error: message || '训练计划生成失败，请稍后重试' },
      { status }
    );
  }
}
