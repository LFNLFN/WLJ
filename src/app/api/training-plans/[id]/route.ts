import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';

function parsePlanRow(row: any) {
  let planData: any = {};
  try {
    planData = JSON.parse(row.planData || '{}');
  } catch (e) {
    planData = {};
  }
  return {
    _id: row.id,
    id: row.id,
    title: row.title || '',
    childName: row.childName || '',
    studentId: row.studentId || '',
    planData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const res = await db.query('SELECT * FROM training_plans WHERE id = $1', [params.id]);
    const row = res.rows[0];
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parsePlanRow(row));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const body = await req.json();
    const title = body.title || '';
    const childName = body.childName || (body.planData && body.planData.child && body.planData.child.name) || '';
    const studentId = body.studentId || '';
    const planData = JSON.stringify(body.planData || body);
    const now = new Date().toISOString();

    const res = await db.query(
      `UPDATE training_plans
          SET title = $1, "childName" = $2, "studentId" = $3, "planData" = $4, "updatedAt" = $5
        WHERE id = $6
        RETURNING *`,
      [title, childName, studentId, planData, now, params.id]
    );
    if (!res.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });

    return NextResponse.json(parsePlanRow(res.rows[0]));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const res = await db.query('DELETE FROM training_plans WHERE id = $1', [params.id]);
    if (res.rowCount === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
