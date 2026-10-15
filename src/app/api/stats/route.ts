import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();

    // 每项统计独立兜底：某张表不存在 / 查询失败时只让该项归零，
    // 不要把整个 /api/stats 打成 500（否则依赖它的页面整块没数据）。
    const countOf = (table: string) =>
      db.query(`SELECT COUNT(*) as count FROM ${table}`)
        .then((res: any) => parseInt(res.rows[0].count) || 0)
        .catch((err: any) => {
          console.warn(`[stats] ${table} 统计失败:`, err.message);
          return 0;
        });

    const [teachers, students, courses, records, recentRecords] = await Promise.all([
      countOf('teachers'),
      countOf('students'),
      countOf('courses'),
      countOf('class_records'),
      db.query('SELECT * FROM class_records ORDER BY "createdAt" DESC LIMIT 5')
        .then((res: any) => parseRows(res.rows))
        .catch((err: any) => {
          console.warn('[stats] 最近上课记录加载失败:', err.message);
          return [];
        }),
    ]);

    return NextResponse.json({
      teachers,
      students,
      courses,
      records,
      recentRecords,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
