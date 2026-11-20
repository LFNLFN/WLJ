import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';
import { getWechatConfig } from '@/lib/wechat/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 记录教师已同意订阅消息（客户端 wx.requestSubscribeMessage 成功后才调用）。
 * 一次性订阅：剩余次数 +1（最多 10）；长期订阅：标记为长期。
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const config = getWechatConfig();
    const body = await req.json().catch(() => ({}));
    const templateId = String(body?.templateId || config.templateId);
    if (templateId !== config.templateId) {
      return NextResponse.json({ error: '模板 ID 与后台配置不一致' }, { status: 400 });
    }

    const existing = await db.query('SELECT openid FROM wechat_bindings WHERE "userId" = $1', [staff.value.id]);
    if (!existing.rows[0] || !existing.rows[0].openid) {
      return NextResponse.json({ error: '请先绑定微信通知' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const remainingSql = config.longTerm
      ? 'remaining = 999'
      : 'remaining = LEAST(remaining + 1, 10)';

    await db.query(
      `UPDATE wechat_bindings
          SET ${remainingSql}, "templateId" = $2, "lastSubscribeAt" = $3, "updatedAt" = $3
        WHERE "userId" = $1`,
      [staff.value.id, config.templateId, now]
    );

    const status = await db.query(
      'SELECT remaining FROM wechat_bindings WHERE "userId" = $1',
      [staff.value.id]
    );

    return NextResponse.json({
      remaining: Number(status.rows[0]?.remaining) || 0,
      longTerm: config.longTerm,
    });
  } catch (err: any) {
    console.error('[wechat/subscribe] 失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '记录订阅失败' }, { status: 500 });
  }
}
