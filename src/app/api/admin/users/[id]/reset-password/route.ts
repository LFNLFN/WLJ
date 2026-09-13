import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { adminResetPassword } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 管理员：重置某用户密码
 * 返回一次性临时密码（库里只存哈希），并要求该用户下次登录后修改密码
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await adminResetPassword(db, userId, params.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ tempPassword: result.value.tempPassword, user: result.value.user });
  } catch (err: any) {
    console.error('重置用户密码失败:', err);
    return NextResponse.json({ error: err.message || '重置失败' }, { status: 500 });
  }
}
