import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'course_lessons';
const FIELDS = ['date', 'startTime', 'endTime', 'duration', 'content', 'performance', 'homework'];

function calcDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const minutes = (eh * 60 + em) - (sh * 60 + sm);
  return minutes > 0 ? Math.round((minutes / 60) * 10) / 10 : 0;
}

/** 某门课程的逐节课课后记录 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureSchema();
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId') || searchParams.get('courseid') || '';
    if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });

    const res = await db.query(
      `SELECT * FROM ${TABLE} WHERE "courseId" = $1 ORDER BY "lessonNo" ASC, date ASC`,
      [courseId]
    );
    return NextResponse.json(res.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** 新增一节课的课后记录；lessonNo 自动取该课程下一节 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: '未登录' }, { status: 401 });

    await ensureSchema();
    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const courseId = String(body.courseId || '');
    if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });

    const lessonRes = await db.query(
      `SELECT COALESCE(MAX("lessonNo"), 0) + 1 AS next FROM ${TABLE} WHERE "courseId" = $1`,
      [courseId]
    );
    const lessonNo = Number(body.lessonNo) || Number(lessonRes.rows[0]?.next) || 1;

    const startTime = String(body.startTime || '');
    const endTime = String(body.endTime || '');
    const duration = Number(body.duration) || calcDuration(startTime, endTime) || 1;
    const now = new Date().toISOString();

    const result = await db.query(
      `INSERT INTO ${TABLE}
        (id, "courseId", "lessonNo", date, "startTime", "endTime", duration, content, performance, homework, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        generateId(),
        courseId,
        lessonNo,
        String(body.date || new Date().toISOString().slice(0, 10)),
        startTime,
        endTime,
        duration,
        String(body.content || ''),
        String(body.performance || ''),
        String(body.homework || ''),
        now,
        now,
      ]
    );
    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
