import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { SESSION_COOKIE } from '@/lib/auth/config';
import { verifySessionToken } from '@/lib/auth/session';
import { findUserById, toPublicUser } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 当前登录用户（供界面初始化使用） */
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = await verifySessionToken(token);
    if (!session) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const db = await getDb();
    const row = await findUserById(db, session.id);
    if (!row || (row.status || 'active') !== 'active') {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    return NextResponse.json({ user: toPublicUser(row) });
  } catch (err: any) {
    console.error('获取当前用户失败:', err);
    return NextResponse.json({ error: err.message || '获取用户信息失败' }, { status: 500 });
  }
}
