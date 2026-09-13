import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { ensureAuthSchema } from '@/lib/auth/store';
import { listTeacherAccounts } from '@/lib/auth/teacher-account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理员：教师账号一览（教师管理页显示「登录账号」列用） */
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await listTeacherAccounts(db, userId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (err: any) {
    console.error('获取教师账号一览失败:', err);
    return NextResponse.json({ error: err.message || '获取失败' }, { status: 500 });
  }
}
