import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';

interface StudentRef {
  id: string;
  name: string;
}

function normalizeStudentIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((x) => String(x || '')).filter(Boolean)));
}

function validateStudents(type: string, ids: string[]): string | null {
  if (type === 'personal' && ids.length !== 1) return '个人教案必须关联 1 名学生';
  if (type === 'group' && ids.length < 2) return '集体教案必须关联至少 2 名学生';
  return null;
}

async function getStudentRefs(db: any, ids: string[]): Promise<StudentRef[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const res = await db.query('SELECT id, name FROM students WHERE id = ANY($1::text[])', [unique]);
  return res.rows as StudentRef[];
}

async function attachStudents(db: any, plans: any[]) {
  if (!plans || plans.length === 0) return [];
  const ids = plans.map((p) => p.id);
  const res = await db.query(
    `SELECT lps."planId", lps."studentId", s.name
       FROM lesson_plan_students lps
       LEFT JOIN students s ON s.id = lps."studentId"
      WHERE lps."planId" = ANY($1::text[])
      ORDER BY s.name`,
    [ids]
  );
  const map = new Map<string, StudentRef[]>();
  for (const row of res.rows) {
    const list = map.get(row.planId) || [];
    list.push({ id: row.studentId, name: row.name || '' });
    map.set(row.planId, list);
  }
  return plans.map((plan) => {
    const students = map.get(plan.id) || [];
    return {
      ...plan,
      _id: plan.id,
      studentIds: students.map((s) => s.id),
      studentNames: students.map((s) => s.name),
    };
  });
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

/** 教案列表；支持 keyword / type / studentId 过滤 */
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword');
    const type = searchParams.get('type');
    const studentId = searchParams.get('studentId') || searchParams.get('studentid') || '';

    const conditions: string[] = [];
    const params: any[] = [];
    let sql = 'SELECT lp.* FROM lesson_plans lp';

    if (studentId) {
      sql += ' JOIN lesson_plan_students lps ON lps."planId" = lp.id';
      params.push(studentId);
      conditions.push(`lps."studentId" = $${params.length}`);
    }
    if (keyword) {
      params.push(`%${keyword}%`);
      conditions.push(`lp.title ILIKE $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`lp."type" = $${params.length}`);
    }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY lp."updatedAt" DESC, lp."createdAt" DESC';

    const result = await db.query(sql, params);
    return NextResponse.json(await attachStudents(db, result.rows));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const body = await req.json().catch(() => ({}));

    const type = body.type === 'group' ? 'group' : 'personal';
    const studentIds = normalizeStudentIds(body.studentIds);
    const validation = validateStudents(type, studentIds);
    if (validation) return NextResponse.json({ error: validation }, { status: 400 });

    const refs = await getStudentRefs(db, studentIds);
    if (refs.length !== studentIds.length) {
      return NextResponse.json({ error: '部分学生不存在，请刷新后重试' }, { status: 400 });
    }

    const id = body.id || generateId();
    const title = String(body.title || '');
    const content = String(body.content || '');
    const now = new Date().toISOString();
    // 兼容旧字段：存第一个学生 + 全部姓名
    const legacyStudentId = studentIds[0] || '';
    const legacyStudentName = refs.map((s) => s.name).join('、');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO lesson_plans (id, title, type, content, "studentId", "studentName", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, title, type, content, legacyStudentId, legacyStudentName, now, now]
      );
      await replaceAssociations(client, id, studentIds, now);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json(
      {
        _id: id,
        id,
        title,
        type,
        content,
        studentId: legacyStudentId,
        studentName: legacyStudentName,
        studentIds,
        studentNames: refs.map((s) => s.name),
        createdAt: now,
        updatedAt: now,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
