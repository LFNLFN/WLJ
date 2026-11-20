import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'consult_appointments';

function nowText() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * 家长提交咨询预约（免登录）
 * body: { userId?, parentName, phone, childName?, preferredDate, preferredTime?, topic?, notes? }
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const body = await req.json().catch(() => ({}));

    const parentName = String(body?.parentName || '').trim();
    const phone = String(body?.phone || '').trim();
    const preferredDate = String(body?.preferredDate || '').trim();
    if (!parentName) return NextResponse.json({ error: '请填写家长姓名' }, { status: 400 });
    if (!phone || phone.replace(/\D/g, '').length < 6) {
      return NextResponse.json({ error: '请填写正确的联系电话' }, { status: 400 });
    }
    if (!preferredDate) return NextResponse.json({ error: '请选择期望日期' }, { status: 400 });

    const id = generateId();
    const now = nowText();
    const result = await db.query(
      `INSERT INTO ${TABLE}
        (id, "userId", "parentName", phone, "childName", "preferredDate", "preferredTime", topic, notes, status, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$10)
       RETURNING *`,
      [
        id,
        String(body?.userId || ''),
        parentName,
        phone,
        String(body?.childName || '').trim(),
        preferredDate,
        String(body?.preferredTime || '').trim(),
        String(body?.topic || '').trim(),
        String(body?.notes || '').slice(0, 1000),
        now,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err: any) {
    console.error('[consult-appointments] 提交失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '提交失败，请稍后重试' }, { status: 500 });
  }
}

/** 教师查看预约列表；?status=pending|confirmed|done|cancelled|all */
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) {
      return NextResponse.json({ error: staff.error }, { status: staff.status });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') || '').trim();
    const params: any[] = [];
    let sql = `SELECT * FROM ${TABLE}`;
    if (status && status !== 'all') {
      params.push(status);
      sql += ` WHERE status = $1`;
    }
    sql += ` ORDER BY "createdAt" DESC`;

    const result = await db.query(sql, params);
    return NextResponse.json(result.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 500 });
  }
}
