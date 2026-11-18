import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';
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

/** 训练计划列表；带 ?studentId= 时只返回该学生的计划 */
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('studentId') || searchParams.get('studentid') || '';

    const sql = studentId
      ? 'SELECT * FROM training_plans WHERE "studentId" = $1 ORDER BY "updatedAt" DESC'
      : 'SELECT * FROM training_plans ORDER BY "updatedAt" DESC';

    const res = await db.query(sql, studentId ? [studentId] : []);
    return NextResponse.json(res.rows.map(parsePlanRow));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const body = await req.json();
    const id = generateId();
    const title = body.title || '';
    const childName = body.childName || (body.planData && body.planData.child && body.planData.child.name) || '';
    const studentId = body.studentId || '';
    const planData = JSON.stringify(body.planData || body);
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO training_plans (id, title, "childName", "studentId", "planData", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, title, childName, studentId, planData, now, now]
    );

    return NextResponse.json(
      { _id: id, id, title, childName, studentId, createdAt: now, updatedAt: now },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
