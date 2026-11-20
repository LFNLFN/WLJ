import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { ensureStudentLinkSchema } from '@/lib/api/scale-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 家长端：查看自家孩子的课堂总结（免登录）
 *
 * 小程序家长没有账号体系，沿用「设备号」识别：
 *   小程序本地 deviceUserId → students.userid → courses.studentIds → course_lessons.summary
 *
 * 安全边界：
 *   - 必须带 userid，且只返回该设备号绑定的学生；
 *   - 只返回「课堂总结 / 课后作业」等内容，不返回教师内部批注；
 *   - 不接收学生姓名/手机号查询，避免枚举其他孩子的数据。
 *
 * GET /api/parent/course-summaries?userid=<deviceUserId>
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userid = String(searchParams.get('userid') || '').trim();
    if (!userid) {
      return NextResponse.json({ error: '缺少 userid' }, { status: 400 });
    }
    if (userid.length > 200) {
      return NextResponse.json({ error: 'userid 不合法' }, { status: 400 });
    }

    await ensureSchema();
    const db = await getDb();
    await ensureStudentLinkSchema(db);

    // 该设备号下的孩子（同一部手机可能有多个孩子）
    const studentRes = await db.query(
      `SELECT id, name
         FROM students
        WHERE userid = $1
        ORDER BY "createdAt" ASC`,
      [userid]
    );
    const allStudents = studentRes.rows.map((row: any) => ({
      id: String(row.id),
      name: row.name || '未命名',
    }));

    // 同名历史档案（同一孩子可能有多条）在家长端合并为一个孩子
    const students: Array<{ id: string; name: string }> = [];
    const seenNames = new Set<string>();
    for (const student of allStudents) {
      if (seenNames.has(student.name)) continue;
      seenNames.add(student.name);
      students.push(student);
    }
    if (allStudents.length === 0) {
      return NextResponse.json({ students: [], summaries: [] });
    }

    // 课程可能是一对一或集体课：studentIds 是 JSON 数组字符串
    const lessonRes = await db.query(
      `SELECT l.id,
              l."courseId",
              l."lessonNo",
              l.date,
              l."startTime",
              l."endTime",
              l.duration,
              l.summary,
              l.homework,
              c.name AS "courseName",
              c."teacherName",
              c.type AS "courseType",
              c."studentIds" AS "courseStudentIds"
         FROM course_lessons l
         JOIN courses c ON c.id = l."courseId"
        WHERE (btrim(coalesce(l.summary, '')) <> '' OR btrim(coalesce(l.homework, '')) <> '')
          AND EXISTS (
                SELECT 1
                  FROM students s
                 WHERE s.userid = $1
                   AND s.id IN (
                         SELECT jsonb_array_elements_text(
                                  CASE
                                    WHEN btrim(coalesce(c."studentIds", '')) ~ '^\\['
                                      THEN c."studentIds"::jsonb
                                    ELSE '[]'::jsonb
                                  END
                                )
                       )
              )
        ORDER BY l.date DESC NULLS LAST, l."lessonNo" DESC
        LIMIT 300`,
      [userid]
    );

    const studentById = new Map(allStudents.map((s: any) => [s.id, s]));
    const summaries: any[] = [];
    const seenSummaries = new Set<string>();

    for (const row of lessonRes.rows) {
      let courseStudentIds: string[] = [];
      try {
        const parsed = typeof row.courseStudentIds === 'string'
          ? JSON.parse(row.courseStudentIds)
          : row.courseStudentIds;
        if (Array.isArray(parsed)) courseStudentIds = parsed.map((x) => String(x));
      } catch {
        courseStudentIds = [];
      }

      // 一节课可能属于多个孩子（集体课），按孩子各生成一条，便于家长端按孩子筛选
      const matched = courseStudentIds
        .map((id) => studentById.get(id))
        .filter(Boolean);

      for (const student of matched) {
        // 同名重复档案只展示一次
        const uniqueKey = `${row.id}|${student!.name}`;
        if (seenSummaries.has(uniqueKey)) continue;
        seenSummaries.add(uniqueKey);

        summaries.push({
          id: `${row.id}-${student!.id}`,
          lessonId: row.id,
          studentId: student!.id,
          studentName: student!.name,
          courseId: row.courseId || '',
          courseName: row.courseName || '课程',
          courseType: row.courseType || 'personal',
          teacherName: row.teacherName || '',
          lessonNo: Number(row.lessonNo) || 0,
          date: row.date || '',
          startTime: row.startTime || '',
          endTime: row.endTime || '',
          duration: Number(row.duration) || 0,
          summary: row.summary || '',
          homework: row.homework || '',
        });
      }
    }

    return NextResponse.json({ students, summaries });
  } catch (err: any) {
    console.error('[parent/course-summaries] 查询失败:', err?.message || err);
    return NextResponse.json({ error: '加载课堂总结失败' }, { status: 500 });
  }
}
