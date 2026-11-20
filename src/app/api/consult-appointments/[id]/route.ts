import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'consult_appointments';
const ALLOWED_STATUS = ['pending', 'confirmed', 'done', 'cancelled'];

/** 教师处理预约：确认 / 完成 / 取消 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const body = await req.json().catch(() => ({}));
    const status = String(body?.status || '').trim();
    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json({ error: '不支持的状态' }, { status: 400 });
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const result = await db.query(
      `UPDATE ${TABLE}
          SET status = $2, "handledBy" = $3, "handledAt" = $4, "updatedAt" = $4
        WHERE id = $1
        RETURNING *`,
      [params.id, status, staff.value.name || staff.value.id, now]
    );
    if (!result.rows[0]) return NextResponse.json({ error: '未找到该预约' }, { status: 404 });
    return NextResponse.json(result.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '处理失败' }, { status: 500 });
  }
}
