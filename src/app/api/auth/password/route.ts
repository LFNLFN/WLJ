import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { changeOwnPassword } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 已登录用户修改自己的密码：{ oldPassword, newPassword, confirmPassword } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!String(body?.newPassword || '')) {
      return NextResponse.json({ error: '请输入新密码' }, { status: 400 });
    }

    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await changeOwnPassword(db, userId, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('修改密码失败:', err);
    return NextResponse.json({ error: err.message || '修改失败，请稍后重试' }, { status: 500 });
  }
}
