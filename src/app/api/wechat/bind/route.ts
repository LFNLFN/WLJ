import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { code2Session, getWechatConfig } from '@/lib/wechat/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 教师绑定微信 OpenID：wx.login 的 code → openid */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || '');
    if (!code) return NextResponse.json({ error: '缺少 wx.login 的 code' }, { status: 400 });

    const config = getWechatConfig();
    if (!config.secret) {
      return NextResponse.json({ error: '服务端未配置 WECHAT_APPSECRET，暂时无法绑定微信通知' }, { status: 400 });
    }

    const sessionInfo = await code2Session(code);
    const now = new Date().toISOString();
    await db.query(
      `INSERT INTO wechat_bindings ("userId", openid, unionid, "templateId", remaining, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 0, $5, $5)
       ON CONFLICT ("userId") DO UPDATE
         SET openid = EXCLUDED.openid,
             unionid = EXCLUDED.unionid,
             "templateId" = EXCLUDED."templateId",
             "updatedAt" = EXCLUDED."updatedAt"`,
      [staff.value.id, sessionInfo.openid, sessionInfo.unionid, config.templateId, now]
    );

    return NextResponse.json({ bound: true });
  } catch (err: any) {
    console.error('[wechat/bind] 失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '绑定失败' }, { status: 500 });
  }
}
