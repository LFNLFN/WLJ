import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/config';
import { registerUser, validateRegisterInput } from '@/lib/auth/service';
import { createSessionToken } from '@/lib/auth/session';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 注册：校验参数 → 查重 → scrypt 哈希 → 写入 users 表 → 直接登录（下发会话 Cookie）
 * 不使用短信验证码，手机号仅作为登录账号。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // 先校验参数：参数不对时不必连数据库，也能给出明确的 400
    const validated = validateRegisterInput(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: validated.status });
    }

    const db = await getDb();
    await ensureAuthSchema(db);

    const result = await registerUser(db, validated.value);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const { user, recoveryCode, isFirstAdmin } = result.value;
    const token = await createSessionToken({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    });

    // recoveryCode 只在这里返回一次（库里只存哈希），前端必须提示用户保存
    const res = NextResponse.json({ user, recoveryCode, isFirstAdmin }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err: any) {
    console.error('注册失败:', err);
    return NextResponse.json({ error: err.message || '注册失败，请稍后重试' }, { status: 500 });
  }
}
