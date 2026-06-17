import { NextRequest, NextResponse } from 'next/server';
import { createHandlers, getDb, generateId, parseRows } from '@/lib/api/crud';

const baseHandlers = createHandlers('class_records');

export async function GET(req: NextRequest) {
  return baseHandlers.GET(req);
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  // 检查是否是批量创建
  const isBatch = url.searchParams.get('batch') === 'true' || req.url.includes('/batch');

  if (isBatch) {
    return handleBatchCreate(req);
  }
  return baseHandlers.POST(req);
}

async function handleBatchCreate(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { courseId, courseName, teacherId, teacherName, studentIds, studentNames, date, startTime, endTime, duration, content, homework, status } = body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: '学生列表不能为空' }, { status: 400 });
    }

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

    insertMany(records);

    const saved = db.prepare(`SELECT * FROM class_records WHERE id IN (${savedIds.map(() => '?').join(',')})`).all(...savedIds);
    return NextResponse.json(parseRows(saved), { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
