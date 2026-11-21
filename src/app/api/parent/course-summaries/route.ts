import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/crud';
import { ensureSchema } from '@/lib/api/schema';
import { ensureStudentLinkSchema } from '@/lib/api/scale-records';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 家长端：查看自家孩子的「每周课堂总结」（免登录）
 *
 * 小程序家长没有账号体系，沿用「设备号」识别：
 *   小程序本地 deviceUserId → students.userid → courses.studentIds → course_week_summaries
 *
 * 只返回教师已确认提交（status=submitted）的周总结；草稿不展示。
 *
 * 安全边界：
 *   - 必须带 userid，且只返回该设备号绑定的学生；
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
      return NextResponse.json({ students: [], weeks: [], summaries: [] });
    }

    // 只取教师已提交的周总结；course_week_summaries 按 courseId + studentId + weekStart 唯一
    const studentIds = allStudents.map((s) => s.id);
    const weekRes = await db.query(
      `SELECT w.id,
              w."courseId",
              w."studentId",
              w."studentName",
              w."weekStart",
              w."weekEnd",
              w."lessonCount",
              w.summary,
              w.homework,
              w."submittedAt",
              c.name AS "courseName",
              c."teacherName",
              c.type AS "courseType"
         FROM course_week_summaries w
         JOIN courses c ON c.id = w."courseId"
        WHERE w.status = 'submitted'
          AND btrim(coalesce(w.summary, '')) <> ''
          AND w."studentId" = ANY($1::text[])
        ORDER BY w."weekStart" DESC, w."updatedAt" DESC
        LIMIT 300`,
      [studentIds]
    );

    const studentById = new Map(allStudents.map((s: any) => [s.id, s]));
    const weeks: any[] = [];
    const seenWeeks = new Set<string>();

    for (const row of weekRes.rows) {
      const student = studentById.get(String(row.studentId));
      if (!student) continue;
      const studentName = student.name || row.studentName;

      // 同名重复档案只展示一次
      const uniqueKey = `${row.weekStart}|${row.courseId}|${studentName}`;
      if (seenWeeks.has(uniqueKey)) continue;
      seenWeeks.add(uniqueKey);

      weeks.push({
        id: row.id,
        weekId: row.id,
        studentId: student.id,
        studentName,
        courseId: row.courseId || '',
        courseName: row.courseName || '课程',
        courseType: row.courseType || 'personal',
        teacherName: row.teacherName || '',
        weekStart: row.weekStart || '',
        weekEnd: row.weekEnd || '',
        lessonCount: Number(row.lessonCount) || 0,
        summary: row.summary || '',
        homework: row.homework || '',
        submittedAt: row.submittedAt || '',
      });
    }

    // summaries 保留空数组，兼容旧版小程序（旧版展示逐节课总结，升级后为空）
    return NextResponse.json({ students, weeks, summaries: [] });
  } catch (err: any) {
    console.error('[parent/course-summaries] 查询失败:', err?.message || err);
    return NextResponse.json({ error: '加载课堂总结失败' }, { status: 500 });
  }
}
