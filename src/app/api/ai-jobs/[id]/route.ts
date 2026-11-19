import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 查询 AI 生成任务状态 / 结果（小程序轮询） */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const res = await db.query('SELECT * FROM ai_generation_jobs WHERE id = $1', [params.id]);
    const job = res.rows[0];
    if (!job) return NextResponse.json({ error: '任务不存在' }, { status: 404 });

    if (job.createdBy && job.createdBy !== staff.value.id && staff.value.role !== 'admin') {
      return NextResponse.json({ error: '无权查看该任务' }, { status: 403 });
    }

    let result: any = null;
    if (job.result) {
      try {
        result = JSON.parse(job.result);
      } catch {
        result = null;
      }
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      result,
      error: job.error || '',
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 500 });
  }
}
