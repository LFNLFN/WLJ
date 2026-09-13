import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getSessionUserId } from '@/lib/auth/current';
import { adminIssueRecoveryCode } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 管理员：为用户重发恢复码（用户丢失恢复码时使用） */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await adminIssueRecoveryCode(db, userId, params.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ recoveryCode: result.value.recoveryCode, user: result.value.user });
  } catch (err: any) {
    console.error('重发恢复码失败:', err);
    return NextResponse.json({ error: err.message || '重发失败' }, { status: 500 });
  }
}
