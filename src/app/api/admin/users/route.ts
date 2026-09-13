import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { adminListUsers } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理员：用户列表（?keyword= 支持姓名/手机号模糊搜索） */
export async function GET(req: NextRequest) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const keyword = new URL(req.url).searchParams.get('keyword') || '';
    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await adminListUsers(db, userId, keyword);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (err: any) {
    console.error('获取用户列表失败:', err);
    return NextResponse.json({ error: err.message || '获取失败' }, { status: 500 });
  }
}
