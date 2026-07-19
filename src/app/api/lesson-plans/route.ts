import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows, generateId } from '@/lib/api/crud';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const keyword = searchParams.get('keyword');
    const type = searchParams.get('type');

    let sql = `SELECT * FROM lesson_plans`;
    const conditions: string[] = [];
    const params: any[] = [];

    if (keyword) {
      conditions.push(`title ILIKE $${params.length + 1}`);
      params.push(`%${keyword}%`);
    }

    if (type) {
      conditions.push(`"type" = $${params.length + 1}`);
      params.push(type);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY "updatedAt" DESC, "createdAt" DESC`;

    const result = await db.query(sql, params);
    return NextResponse.json(parseRows(result.rows));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json();
    const id = body.id || generateId();
    const title = body.title || '';
    const type = body.type || 'personal';
    const content = body.content || '';
    const now = new Date().toISOString();

    const result = await db.query(
      `INSERT INTO lesson_plans (id, title, type, content, "studentId", "studentName", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, title, type, content, body.studentId || '', body.studentName || '', now, now]
    );
    const row = result.rows[0] as any;
    const parsed = { ...row, _id: row.id };
    return NextResponse.json(parsed, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
