import { NextRequest, NextResponse } from 'next/server';
import { createHandlers, getDb, generateId, parseRows, isPg } from '@/lib/api/crud';

const baseHandlers = createHandlers('class_records');

export async function GET(req: NextRequest) {
  return baseHandlers.GET(req);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const isBatch = url.searchParams.get('batch') === 'true';

  if (isBatch) {
    return handleBatchCreate(req);
  }
  return baseHandlers.POST(req);
}

async function handleBatchCreate(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();
    const { courseId, courseName, teacherId, teacherName, studentIds, studentNames, date, startTime, endTime, duration, content, homework, status } = body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: '学生列表不能为空' }, { status: 400 });
    }

    const records = studentIds.map((studentId: string, index: number) => ({
      id: generateId(),
      courseId: courseId || '',
      courseName: courseName || '',
      teacherId: teacherId || '',
      teacherName: teacherName || '',
      studentId: studentId || '',
      studentName: (studentNames && studentNames[index]) || '未知',
      date: date || '',
      startTime: startTime || '',
      endTime: endTime || '',
      duration: duration || 0,
      content: content || '',
      homework: homework || '',
      status: status || 'completed',
    }));

    if (isPg(db)) {
      for (const r of records) {
        await db.query(
          `INSERT INTO class_records (id, "courseId", "courseName", "teacherId", "teacherName", "studentId", "studentName", date, "startTime", "endTime", duration, content, homework, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [r.id, r.courseId, r.courseName, r.teacherId, r.teacherName, r.studentId, r.studentName, r.date, r.startTime, r.endTime, r.duration, r.content, r.homework, r.status]
        );
      }
      const ids = records.map((r: any) => r.id);
      const result = await db.query(`SELECT * FROM class_records WHERE id = ANY($1::text[])`, [ids]);
      return NextResponse.json(parseRows(result.rows), { status: 201 });
    } else {
      const insert = db.prepare(`
        INSERT INTO class_records (id, courseId, courseName, teacherId, teacherName, studentId, studentName, date, startTime, endTime, duration, content, homework, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      const savedIds: string[] = [];
      const insertMany = db.transaction((items: any[]) => {
        for (const item of items) {
          insert.run(...Object.values(item));
          savedIds.push(item.id);
        }
      });
      insertMany(records);
      const saved = db.prepare(`SELECT * FROM class_records WHERE id IN (${savedIds.map(() => '?').join(',')})`).all(...savedIds);
      return NextResponse.json(parseRows(saved), { status: 201 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE(req: NextRequest) {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
