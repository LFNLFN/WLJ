import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { adminUpdateUser } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理员：调整用户角色 / 启停账号：{ role?, status? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await adminUpdateUser(db, userId, params.id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ user: result.value });
  } catch (err: any) {
    console.error('更新用户失败:', err);
    return NextResponse.json({ error: err.message || '更新失败' }, { status: 500 });
  }
}
