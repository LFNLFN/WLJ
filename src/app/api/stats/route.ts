import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const teachers = db.prepare('SELECT COUNT(*) as count FROM teachers').get() as any;
    const students = db.prepare('SELECT COUNT(*) as count FROM students').get() as any;
    const courses = db.prepare('SELECT COUNT(*) as count FROM courses').get() as any;
    const records = db.prepare('SELECT COUNT(*) as count FROM class_records').get() as any;
    const recentRecords = parseRows(
      db.prepare('SELECT * FROM class_records ORDER BY createdAt DESC LIMIT 5').all()
    );
    return NextResponse.json({
      teachers: teachers.count,
      students: students.count,
      courses: courses.count,
      records: records.count,
      recentRecords
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
