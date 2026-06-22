import { NextRequest, NextResponse } from 'next/server';
import { getDb, parseRows, isPg, generateId } from '@/lib/api/crud';

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
      if (isPg(db)) {
        conditions.push(`title ILIKE $${params.length + 1}`);
      } else {
        conditions.push(`title LIKE ?`);
      }
      params.push(`%${keyword}%`);
    }

    if (type) {
      if (isPg(db)) {
        conditions.push(`"type" = $${params.length + 1}`);
      } else {
        conditions.push(`type = ?`);
      }
      params.push(type);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY "updatedAt" DESC, "createdAt" DESC`;

    let rows: any[];
    if (isPg(db)) {
      const result = await db.query(sql, params);
      rows = result.rows;
    } else {
      const stmt = db.prepare(sql);
      rows = stmt.all(...params);
    }

    return NextResponse.json(parseRows(rows));
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

    if (isPg(db)) {
      const result = await db.query(
        `INSERT INTO lesson_plans (id, title, type, content, "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, title, type, content, now, now]
      );
      const row = result.rows[0] as any;
      const parsed = { ...row, _id: row.id };
      return NextResponse.json(parsed, { status: 201 });
    } else {
      db.prepare(
        `INSERT INTO lesson_plans (id, title, type, content, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, title, type, content, now, now);
      const row = db.prepare(`SELECT * FROM lesson_plans WHERE id = ?`).get(id) as any;
      const parsed = { ...row, _id: row.id };
      return NextResponse.json(parsed, { status: 201 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
