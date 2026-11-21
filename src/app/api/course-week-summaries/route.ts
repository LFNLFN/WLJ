import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { getSessionFromRequest } from '@/lib/auth/current';
import { requireStaff } from '@/lib/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TABLE = 'course_week_summaries';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nowText() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/** 某门课程的周总结列表（教师端 PC / 小程序共用） */
export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const { searchParams } = new URL(req.url);
    const courseId = String(searchParams.get('courseId') || '').trim();
    if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });

    const result = await db.query(
      `SELECT w.*, c.name AS "courseName", c."teacherName"
         FROM ${TABLE} w
         LEFT JOIN courses c ON c.id = w."courseId"
        WHERE w."courseId" = $1
        ORDER BY w."weekStart" DESC, w."studentName" ASC`,
      [courseId]
    );
    return NextResponse.json(result.rows);
  } catch (err: any) {
    console.error('[course-week-summaries] 查询失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '查询失败' }, { status: 500 });
  }
}

/**
 * 保存周总结（按 courseId + studentId + weekStart 幂等 upsert）
 * body: { courseId, studentId, weekStart, weekEnd, summary, homework?, status: 'draft'|'submitted', lessonIds? }
 * - draft：仅教师可见
 * - submitted：家长端可见
 * - 集体课每个学生各保存一份
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const db = await getDb();
    const session = await getSessionFromRequest(req);
    const staff = await requireStaff(db, session?.id);
    if (!staff.ok) return NextResponse.json({ error: staff.error }, { status: staff.status });

    const body = await req.json().catch(() => ({}));
    const courseId = String(body?.courseId || '').trim();
    const studentId = String(body?.studentId || '').trim();
    const weekStart = String(body?.weekStart || '').trim();
    const weekEnd = String(body?.weekEnd || '').trim();
    const summary = String(body?.summary || '').trim();
    const homework = String(body?.homework || '').trim().slice(0, 1000);
    const status = String(body?.status || 'draft') === 'submitted' ? 'submitted' : 'draft';
    const lessonIds = Array.isArray(body?.lessonIds)
      ? body.lessonIds.map((x: any) => String(x)).filter(Boolean).slice(0, 30)
      : [];

    if (!courseId) return NextResponse.json({ error: '缺少 courseId' }, { status: 400 });
    if (!studentId) return NextResponse.json({ error: '缺少 studentId' }, { status: 400 });
    if (!DATE_RE.test(weekStart) || !DATE_RE.test(weekEnd)) {
      return NextResponse.json({ error: '周起止日期格式不正确' }, { status: 400 });
    }
    if (status === 'submitted' && !summary) {
      return NextResponse.json({ error: '提交前请先填写周总结内容' }, { status: 400 });
    }

    const course = await db.query('SELECT id, name, "teacherName", "studentIds" FROM courses WHERE id = $1', [courseId]);
    if (!course.rows[0]) return NextResponse.json({ error: '未找到该课程' }, { status: 404 });

    // 确认学生确实在这门课里，避免把周总结写到别的孩子名下
    let courseStudentIds: string[] = [];
    try {
      const parsed = typeof course.rows[0].studentIds === 'string'
        ? JSON.parse(course.rows[0].studentIds)
        : course.rows[0].studentIds;
      if (Array.isArray(parsed)) courseStudentIds = parsed.map((x: any) => String(x));
    } catch {
      courseStudentIds = [];
    }
    if (!courseStudentIds.includes(studentId)) {
      return NextResponse.json({ error: '该学生不在当前课程中' }, { status: 400 });
    }

    const student = await db.query('SELECT id, name FROM students WHERE id = $1', [studentId]);
    if (!student.rows[0]) return NextResponse.json({ error: '未找到该学生' }, { status: 404 });
    const studentName = student.rows[0].name || '';

    const now = nowText();
    const submitted = status === 'submitted';
    const result = await db.query(
      `INSERT INTO ${TABLE}
        (id, "courseId", "studentId", "studentName", "weekStart", "weekEnd",
         "lessonIds", "lessonCount", summary, homework, status,
         "createdBy", "createdByName", "submittedBy", "submittedByName", "submittedAt",
         "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
       ON CONFLICT ("courseId", "studentId", "weekStart") DO UPDATE SET
         "studentName" = EXCLUDED."studentName",
         "weekEnd" = EXCLUDED."weekEnd",
         "lessonIds" = EXCLUDED."lessonIds",
         "lessonCount" = EXCLUDED."lessonCount",
         summary = EXCLUDED.summary,
         homework = EXCLUDED.homework,
         status = EXCLUDED.status,
         "submittedBy" = EXCLUDED."submittedBy",
         "submittedByName" = EXCLUDED."submittedByName",
         "submittedAt" = EXCLUDED."submittedAt",
         "updatedAt" = EXCLUDED."updatedAt"
       RETURNING *`,
      [
        generateId(),
        courseId,
        studentId,
        studentName,
        weekStart,
        weekEnd,
        JSON.stringify(lessonIds),
        lessonIds.length,
        summary,
        homework,
        status,
        staff.value.id,
        staff.value.name || '',
        submitted ? staff.value.id : '',
        submitted ? staff.value.name || '' : '',
        submitted ? now : '',
        now,
      ]
    );

    console.log(
      `[course-week-summaries] ${submitted ? '提交' : '保存草稿'} course=${courseId} student=${studentName || studentId} week=${weekStart} by=${staff.value.name || staff.value.id}`
    );
    return NextResponse.json(result.rows[0]);
  } catch (err: any) {
    console.error('[course-week-summaries] 保存失败:', err?.message || err);
    return NextResponse.json({ error: err?.message || '保存失败' }, { status: 500 });
  }
}
