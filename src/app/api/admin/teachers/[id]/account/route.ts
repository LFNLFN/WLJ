import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { ensureAuthSchema } from '@/lib/auth/store';
import { createTeacherAccount, resetTeacherAccountPassword } from '@/lib/auth/teacher-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 管理员：开通教师账号 / 重置教师密码
 * body: { action: 'create' | 'reset' }（默认 reset）
 * 两种情况都返回一次性密码，且要求该教师登录后立即修改密码
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'create' ? 'create' : 'reset';

    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result =
      action === 'create'
        ? await createTeacherAccount(db, userId, params.id)
        : await resetTeacherAccountPassword(db, userId, params.id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      tempPassword: result.value.tempPassword,
      user: result.value.user,
      action,
    });
  } catch (err: any) {
    console.error('教师账号操作失败:', err);
    return NextResponse.json({ error: err.message || '操作失败' }, { status: 500 });
  }
}
