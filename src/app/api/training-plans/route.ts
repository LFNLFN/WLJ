import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId, parseRows, isPg } from '@/lib/api/crud';

export async function GET() {
  try {
    const db = await getDb();
    let rows: any[];
    if (isPg(db)) {
      const res = await db.query('SELECT * FROM training_plans ORDER BY "updatedAt" DESC');
      rows = res.rows;
    } else {
      rows = db.prepare('SELECT * FROM training_plans ORDER BY updatedAt DESC').all();
    }

    // 解析 planData JSON
    const result = rows.map((row: any) => {
      let planData = {};
      try { planData = JSON.parse(row.planData || '{}'); } catch (e) {}
      return {
        _id: row.id,
        id: row.id,
        title: row.title || '',
        childName: row.childName || '',
        planData,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();
    const id = generateId();
    const title = body.title || '';
    const childName = body.childName || '';
    const planData = JSON.stringify(body.planData || body);
    const now = new Date().toISOString();

    if (isPg(db)) {
      await db.query(
        `INSERT INTO training_plans (id, title, "childName", "planData", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, title, childName, planData, now, now]
      );
    } else {
      db.prepare(
        `INSERT INTO training_plans (id, title, childName, planData, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, title, childName, planData, now, now);
    }

    return NextResponse.json({ _id: id, id, title, childName, createdAt: now, updatedAt: now }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
