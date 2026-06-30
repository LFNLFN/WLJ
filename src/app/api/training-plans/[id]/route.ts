import { NextRequest, NextResponse } from 'next/server';
import { getDb, isPg } from '@/lib/api/crud';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    let row: any;
    if (isPg(db)) {
      const res = await db.query('SELECT * FROM training_plans WHERE id = $1', [params.id]);
      row = res.rows[0];
    } else {
      row = db.prepare('SELECT * FROM training_plans WHERE id = ?').get(params.id);
    }
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });

    let planData = {};
    try { planData = JSON.parse(row.planData || '{}'); } catch (e) {}

    return NextResponse.json({
      _id: row.id, id: row.id,
      title: row.title || '',
      childName: row.childName || '',
      planData,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    const body = await req.json();
    const title = body.title || '';
    const childName = body.childName || '';
    const planData = JSON.stringify(body.planData || body);
    const now = new Date().toISOString();

    if (isPg(db)) {
      const res = await db.query(
        `UPDATE training_plans SET title = $1, "childName" = $2, "planData" = $3, "updatedAt" = $4 WHERE id = $5 RETURNING *`,
        [title, childName, planData, now, params.id]
      );
      if (!res.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
    } else {
      const result = db.prepare(
        `UPDATE training_plans SET title = ?, childName = ?, planData = ?, updatedAt = ? WHERE id = ?`
      ).run(title, childName, planData, now, params.id);
      if (result.changes === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    }

    return NextResponse.json({ _id: params.id, id: params.id, title, childName, updatedAt: now });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = await getDb();
    if (isPg(db)) {
      const res = await db.query('DELETE FROM training_plans WHERE id = $1', [params.id]);
      if (res.rowCount === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    } else {
      const result = db.prepare('DELETE FROM training_plans WHERE id = ?').run(params.id);
      if (result.changes === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    }
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
