import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId, parseRow, parseRows, prepareSaveData } from './db';
import { Pool } from 'pg';

export { getDb, generateId, parseRow, parseRows, prepareSaveData };

// 因为现在只使用 PostgreSQL，直接返回 true
export function isPg(db: any): db is Pool {
  return true;
}

export function createHandlers(tableName: string, filterFields: string[] = []) {
  return {
    async GET(req: NextRequest) {
      try {
        const db = await getDb();
        let sql = `SELECT * FROM ${tableName}`;
        const conditions: string[] = [];
        const params: any[] = [];
        const { searchParams } = new URL(req.url);
        for (const field of filterFields) {
          const val = searchParams.get(field);
          if (val) {
            conditions.push(`"${field}" = $${params.length + 1}`);
            params.push(val);
          }
        }
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ` ORDER BY "createdAt" DESC`;

        const result = await db.query(sql, params);
        return NextResponse.json(parseRows(result.rows));
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    },

    async POST(req: NextRequest) {
      try {
        const db = await getDb();
        const body = await req.json();
        const data = prepareSaveData(body);
        const id = data.id || generateId();
        const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');

        const cols = columns.map(c => `"${c}"`).join(',');
        const vals = columns.map((_, i) => `$${i + 2}`).join(',');
        const result = await db.query(
          `INSERT INTO ${tableName} (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
          [id, ...columns.map(k => data[k])]
        );
        return NextResponse.json(parseRow(result.rows[0]), { status: 201 });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    },
  };
}

export async function GET_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = await getDb();
    const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(row));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = await getDb();
    const body = await req.json();
    const data = prepareSaveData(body);
    const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id' && k !== 'createdAt');

    if (columns.length === 0) {
      const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
      return NextResponse.json(parseRow(result.rows[0]));
    }

    const setClause = columns.map((c, i) => `"${c}" = $${i + 1}`).join(',');
    const values = columns.map(k => data[k]);
    const result = await db.query(
      `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
      [...values, id]
    );
    if (!result.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(result.rows[0]));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = await getDb();
    const result = await db.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
    if (result.rowCount === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
