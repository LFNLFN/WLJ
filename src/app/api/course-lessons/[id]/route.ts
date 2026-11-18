import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'course_lessons';
const FIELDS = ['lessonNo', 'date', 'startTime', 'endTime', 'duration', 'content', 'performance', 'homework'];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureSchema();
    const db = await getDb();
    const res = await db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [params.id]);
    if (!res.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureSchema();
    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const updates: Record<string, any> = {};
    for (const key of FIELDS) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (Object.keys(updates).length === 0) {
      const res = await db.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [params.id]);
      if (!res.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
      return NextResponse.json(res.rows[0]);
    }

    const columns = Object.keys(updates);
    const setClause = columns.map((c, i) => `"${c}" = $${i + 1}`).join(',');
    const res = await db.query(
      `UPDATE ${TABLE} SET ${setClause}, "updatedAt" = $${columns.length + 1} WHERE id = $${columns.length + 2} RETURNING *`,
      [...columns.map((c) => updates[c]), new Date().toISOString(), params.id]
    );
    if (!res.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(res.rows[0]);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureSchema();
    const db = await getDb();
    const res = await db.query(`DELETE FROM ${TABLE} WHERE id = $1`, [params.id]);
    if (res.rowCount === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
