import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';

function normalizeStudentIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((x) => String(x || '')).filter(Boolean)));
}

function validateStudents(type: string, ids: string[]): string | null {
  if (type === 'personal' && ids.length !== 1) return '个人教案必须关联 1 名学生';
  if (type === 'group' && ids.length < 2) return '集体教案必须关联至少 2 名学生';
  return null;
}

async function getPlan(db: any, id: string) {
  const res = await db.query('SELECT * FROM lesson_plans WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function getPlanStudents(db: any, id: string) {
  const res = await db.query(
    `SELECT lps."studentId" AS id, s.name
       FROM lesson_plan_students lps
       LEFT JOIN students s ON s.id = lps."studentId"
      WHERE lps."planId" = $1
      ORDER BY s.name`,
    [id]
  );
  return res.rows.map((r: any) => ({ id: r.id, name: r.name || '' }));
}

async function replaceAssociations(client: any, planId: string, studentIds: string[], now: string) {
  await client.query('DELETE FROM lesson_plan_students WHERE "planId" = $1', [planId]);
  for (const studentId of studentIds) {
    await client.query(
      'INSERT INTO lesson_plan_students ("planId", "studentId", "createdAt") VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [planId, studentId, now]
    );
  }
}

function shape(plan: any, students: { id: string; name: string }[]) {
  return {
    ...plan,
    _id: plan.id,
    studentIds: students.map((s) => s.id),
    studentNames: students.map((s) => s.name),
  };
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const plan = await getPlan(db, params.id);
    if (!plan) return NextResponse.json({ error: '未找到' }, { status: 404 });
    const students = await getPlanStudents(db, params.id);
    return NextResponse.json(shape(plan, students));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const existing = await getPlan(db, params.id);
    if (!existing) return NextResponse.json({ error: '未找到' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const type = (body.type || existing.type) === 'group' ? 'group' : 'personal';
    const currentStudents = await getPlanStudents(db, params.id);
    const studentIds = body.studentIds === undefined
      ? currentStudents.map((s: any) => s.id)
      : normalizeStudentIds(body.studentIds);

    const validation = validateStudents(type, studentIds);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const refs = studentIds.length > 0
      ? (await db.query('SELECT id, name FROM students WHERE id = ANY($1::text[])', [studentIds])).rows
      : [];
    if (refs.length !== studentIds.length) {
      return NextResponse.json({ error: '部分学生不存在，请刷新后重试' }, { status: 400 });
    }

    const title = body.title !== undefined ? String(body.title) : existing.title;
    const content = body.content !== undefined ? String(body.content) : existing.content;
    const now = new Date().toISOString();

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE lesson_plans
            SET title = $1, type = $2, content = $3, "studentId" = $4, "studentName" = $5, "updatedAt" = $6
          WHERE id = $7`,
        [title, type, content, studentIds[0] || '', refs.map((s: any) => s.name).join('、'), now, params.id]
      );
      await replaceAssociations(client, params.id, studentIds, now);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const updated = await getPlan(db, params.id);
    const students = await getPlanStudents(db, params.id);
    return NextResponse.json(shape(updated, students));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const db = await getDb();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM lesson_plan_students WHERE "planId" = $1', [params.id]);
      const res = await client.query('DELETE FROM lesson_plans WHERE id = $1', [params.id]);
      if (res.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: '未找到' }, { status: 404 });
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
