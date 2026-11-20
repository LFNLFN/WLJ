import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { getWechatConfig } from '@/lib/wechat/client';
import { isNotifyTeacher } from '@/lib/wechat/recipients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 当前教师的微信通知状态 */
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const config = getWechatConfig();
    const res = await db.query(
      `SELECT openid, remaining, "templateId", "lastSubscribeAt"
         FROM wechat_bindings WHERE "userId" = $1`,
      [staff.value.id]
    );
    const row = res.rows[0];
    const bound = !!(row && row.openid);

    return NextResponse.json({
      bound,
      remaining: bound ? Number(row.remaining) || 0 : 0,
      longTerm: config.longTerm,
      templateId: config.templateId,
      lastSubscribeAt: row ? row.lastSubscribeAt || '' : '',
      configured: !!config.secret,
      inNotifyList: await isNotifyTeacher(db, staff.value.id),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 500 });
  }
}
