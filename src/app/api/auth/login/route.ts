import { NextRequest, NextResponse } from 'next/server';
import { getDb, isTransientDbError, withDbRetry } from '@/lib/api/db';
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionCookieOptions } from '@/lib/auth/config';
import { authenticateUser } from '@/lib/auth/service';
import { createSessionToken } from '@/lib/auth/session';
import { ensureAuthSchema } from '@/lib/auth/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 登录：手机号 + 密码 → 下发会话 Cookie */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // 先做基础校验，避免无谓的数据库往返
    const phone = String(body?.phone == null ? '' : body.phone).replace(/[\s-]/g, '').replace(/^\+?86/, '');
    const password = String(body?.password == null ? '' : body.password);
    if (!phone) return NextResponse.json({ error: '请输入手机号' }, { status: 400 });
    if (!password) return NextResponse.json({ error: '请输入密码' }, { status: 400 });

    // 建表 + 校验账号密码：遇到「连接被重置 / 数据库重启」这类瞬时错误自动重试一次，
    // 不要把 ECONNRESET 直接甩给正在登录的用户
    const result = await withDbRetry(async () => {
      const db = await getDb();
      await ensureAuthSchema(db);
      return authenticateUser(db, body);
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const user = result.value;
    const token = await createSessionToken({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    });

    // 小程序（wx.request）不方便稳靠地保存 Cookie：带 client=weapp 时把同一个 token 返回给客户端保存
    const isWeapp = String(body?.client || req.headers.get('x-client') || '').toLowerCase() === 'weapp';
    const res = NextResponse.json(isWeapp ? { user, token, expiresIn: SESSION_MAX_AGE } : { user });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (err: any) {
    console.error('登录失败:', err);

    // 连接被重置 / 数据库正在重启：给用户一句人话，错误码留给管理员排查
    if (isTransientDbError(err)) {
      return NextResponse.json(
        {
          error: '数据库连接被重置，请稍后重试（若持续出现，请联系管理员查看 /api/health）',
          code: err?.code || 'DB_CONNECTION_RESET',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: err.message || '登录失败，请稍后重试' }, { status: 500 });
  }
}
