import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 教师端：解绑学生的小程序设备号
 *
 * 场景：家长换了微信/手机，或孩子被错误绑定到其他设备。
 * 解绑后 `students.userid` 置空，家长可在小程序用「姓名 + 家长手机号后 4 位」重新绑定。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const res = await db.query(
      `UPDATE students SET userid = '' WHERE id = $1 RETURNING id, name`,
      [params.id]
    );
    if (!res.rows[0]) return NextResponse.json({ error: '未找到该学生' }, { status: 404 });

    console.log(
      `[students/unbind-device] ${staff.value.name || staff.value.id} 解绑学生 ${res.rows[0].name || params.id}`
    );
    return NextResponse.json({ unbound: true, student: res.rows[0] });
  } catch (err: any) {
    console.error('[students/unbind-device] 失败:', err?.message || err);
    return NextResponse.json({ error: '解绑失败，请稍后重试' }, { status: 500 });
  }
}
