import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, maxResults = 5 } = body;

    if (!query || !query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const db = await getDb();
    const keyword = query.trim();
    const results: any[] = [];

    // 从 lesson_plans 表检索
    const plansRes = await db.query(
      `SELECT id, title, content FROM lesson_plans WHERE title ILIKE $1 OR content ILIKE $1 LIMIT $2`,
      [`%${keyword}%`, maxResults]
    );
    const plans = plansRes.rows;

    plans.forEach((p: any) => {
      results.push({
        id: p.id || p._id,
        title: p.title,
        content: p.content || '',
        type: '教案',
        score: 1,
      });
    });

    // 也从 courses 表的阶段计划中检索
    const coursesRes = await db.query(
      `SELECT id, name, stages FROM courses WHERE stages::text ILIKE $1 LIMIT $2`,
      [`%${keyword}%`, maxResults]
    );
    const courses = coursesRes.rows;

    courses.forEach((c: any) => {
      let stages: any[] = [];
      try {
        stages = typeof c.stages === 'string' ? JSON.parse(c.stages) : (c.stages || []);
      } catch (e) { stages = []; }

      stages.forEach((s: any) => {
        if (s.content && s.content.includes(keyword)) {
          results.push({
            id: s.id,
            title: `${c.name} - ${s.label}`,
            content: s.content,
            objectives: s.objectives || '',
            type: '阶段计划',
            score: 0.8,
          });
        }
      });
    });

    return NextResponse.json({ results: results.slice(0, maxResults) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
