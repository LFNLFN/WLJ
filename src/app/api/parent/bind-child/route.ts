import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { ensureStudentLinkSchema } from '@/lib/api/scale-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 家长端：用「孩子姓名 + 家长手机号后 4 位」绑定孩子档案（免登录）
 *
 * 为什么需要：
 *   老师可能在 PC 端手工建了学生档案，家长从没提交过评估，`students.userid` 为空，
 *   家长端就看不到这个孩子的课堂总结。这里允许家长自助把档案绑定到当前设备号。
 *
 * 安全措施：
 *   - 必须同时匹配姓名（忽略大小写/首尾空格）和家长手机号后 4 位；
 *   - 已经绑定到其他设备的孩子不允许抢占，需联系老师；
 *   - 同一设备/IP 10 分钟内最多 10 次尝试，防止穷举手机号后 4 位；
 *   - 不返回手机号、不记录手机号后 4 位到日志。
 *
 * POST /api/parent/bind-child
 * body: { userid, name, phoneLast4 }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userid = String(body?.userid || '').trim();
    const name = String(body?.name || '').trim().slice(0, 50);
    const phoneLast4 = String(body?.phoneLast4 || '').replace(/\D/g, '');

    if (!userid) return NextResponse.json({ error: '缺少设备标识' }, { status: 400 });
    if (userid.length > 200) return NextResponse.json({ error: '设备标识不合法' }, { status: 400 });
    if (!name) return NextResponse.json({ error: '请输入孩子姓名' }, { status: 400 });
    if (!/^\d{4}$/.test(phoneLast4)) {
      return NextResponse.json({ error: '请输入家长手机号后 4 位' }, { status: 400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    if (tooManyAttempts(`${userid}|${ip}`)) {
      return NextResponse.json(
        { error: '尝试次数过多，请 10 分钟后再试，或联系老师绑定' },
        { status: 429 }
      );
    }

    await ensureSchema();
    const db = await getDb();
    await ensureStudentLinkSchema(db);

    const result = await db.query(
      `SELECT id, name, COALESCE(userid, '') AS userid
         FROM students
        WHERE lower(btrim(name)) = lower($1)
          AND right(regexp_replace(coalesce("parentPhone", ''), '[^0-9]', '', 'g'), 4) = $2
        ORDER BY "createdAt" ASC`,
      [name, phoneLast4]
    );
    const candidates: any[] = result.rows;

    if (candidates.length === 0) {
      return NextResponse.json(
        { error: '未找到匹配的孩子，请核对姓名和家长手机号后 4 位，或联系老师' },
        { status: 404 }
      );
    }

    // 已被其他设备绑定：不允许抢占，避免把别人孩子的数据绑过来
    if (candidates.some((s) => s.userid && s.userid !== userid)) {
      return NextResponse.json(
        { error: '该孩子已绑定其他微信设备，请联系老师处理' },
        { status: 409 }
      );
    }

    // 绑定所有同名同手机号的未绑定档案（历史重复档案一起合并到当前设备）
    const ids = candidates.map((s) => s.id);
    await db.query('UPDATE students SET userid = $1 WHERE id = ANY($2::text[])', [userid, ids]);

    const students = candidates.map((s) => ({ id: s.id, name: s.name || '' }));
    const alreadyBound = candidates.every((s) => s.userid === userid);
    console.log(
      `[parent/bind-child] ${alreadyBound ? '已绑定' : '绑定成功'}：${students.length} 个档案`
    );

    return NextResponse.json({ bound: true, alreadyBound, students });
  } catch (err: any) {
    console.error('[parent/bind-child] 失败:', err?.message || err);
    return NextResponse.json({ error: '绑定失败，请稍后重试' }, { status: 500 });
  }
}

/** 简易内存限流：同一设备/IP 10 分钟最多 10 次 */
function tooManyAttempts(key: string): boolean {
  const WINDOW = 10 * 60 * 1000;
  const LIMIT = 10;
  const g = globalThis as unknown as { __wljParentBindRate?: Map<string, { count: number; resetAt: number }> };
  const store = g.__wljParentBindRate || (g.__wljParentBindRate = new Map());
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}
