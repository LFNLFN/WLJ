import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();

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
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
