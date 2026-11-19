import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { enqueueGenerationJob, type GenerationType } from '@/lib/ai/generation-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: GenerationType[] = ['lesson-plan', 'training-plan'];

/** 小程序创建 AI 生成任务（立即返回 jobId，前端轮询结果） */
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const body = await req.json().catch(() => ({}));
    const type = String(body?.type || '') as GenerationType;
    if (!ALLOWED.includes(type)) {
      return NextResponse.json({ error: '不支持的任务类型' }, { status: 400 });
    }
    const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};

    if (type === 'lesson-plan' && !String(payload.topic || '').trim()) {
      return NextResponse.json({ error: '请先填写教案主题或训练目标' }, { status: 400 });
    }

    const id = await enqueueGenerationJob(type, payload, staff.value.id);
    return NextResponse.json({ id, status: 'pending' }, { status: 201 });
  } catch (err: any) {
    console.error('[api/ai-jobs] 创建任务失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '创建任务失败' }, { status: 500 });
  }
}
