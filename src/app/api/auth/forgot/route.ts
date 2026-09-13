import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { getForgotInfo, resetPassword } from '@/lib/auth/service';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 第一步：根据手机号返回可用的找回方式（密保问题 / 是否有恢复码） */
export async function GET(req: NextRequest) {
  try {
    const phone = new URL(req.url).searchParams.get('phone') || '';
    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await getForgotInfo(db, phone);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.value);
  } catch (err: any) {
    console.error('查询找回方式失败:', err);
    return NextResponse.json({ error: err.message || '查询失败，请稍后重试' }, { status: 500 });
  }
}

/**
 * 第二步：凭密保答案或恢复码设置新密码
 * body: { phone, method: 'security' | 'recovery', answer?, recoveryCode?, newPassword, confirmPassword }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const method = body?.method === 'recovery' ? 'recovery' : 'security';

    if (!String(body?.newPassword || '')) {
      return NextResponse.json({ error: '请输入新密码' }, { status: 400 });
    }

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await resetPassword(db, { ...body, method });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ success: true, name: result.value.name });
  } catch (err: any) {
    console.error('重置密码失败:', err);
    return NextResponse.json({ error: err.message || '重置失败，请稍后重试' }, { status: 500 });
  }
}
