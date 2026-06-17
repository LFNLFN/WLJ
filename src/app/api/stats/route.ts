import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows } from '@/lib/api/db';
import { Pool } from 'pg';

function isPg(db: any): db is Pool {
  return db.constructor?.name === 'Pool';
}

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    
    if (isPg(db)) {
      const [t, s, c, r, rr] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM teachers'),
        db.query('SELECT COUNT(*) as count FROM students'),
        db.query('SELECT COUNT(*) as count FROM courses'),
        db.query('SELECT COUNT(*) as count FROM class_records'),
        db.query('SELECT * FROM class_records ORDER BY "createdAt" DESC LIMIT 5'),
      ]);
      return NextResponse.json({
        teachers: parseInt(t.rows[0].count),
        students: parseInt(s.rows[0].count),
        courses: parseInt(c.rows[0].count),
        records: parseInt(r.rows[0].count),
        recentRecords: parseRows(rr.rows),
      });
    } else {
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
        recentRecords,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
