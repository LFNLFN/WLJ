import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId, parseRow, parseRows, prepareSaveData } from './db';

export { getDb, generateId, parseRow, parseRows, prepareSaveData };

export function createHandlers(tableName: string, filterFields: string[] = []) {
  return {
    // GET 列表
    async GET(req: NextRequest) {
      try {
        const db = getDb();
        let sql = `SELECT * FROM ${tableName}`;
        const conditions: string[] = [];
        const params: string[] = [];
        const { searchParams } = new URL(req.url);
        for (const field of filterFields) {
          const val = searchParams.get(field);
          if (val) {
            conditions.push(`${field} = ?`);
            params.push(val);
          }
        }
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
        sql += ` ORDER BY createdAt DESC`;
        const rows = db.prepare(sql).all(...params);
        return NextResponse.json(parseRows(rows));
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    },

    // POST 创建
    async POST(req: NextRequest) {
      try {
        const db = getDb();
        const body = await req.json();
        const data = prepareSaveData(body);
        const id = data.id || generateId();
        const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');
        const values = columns.map(k => data[k]);
        db.prepare(`INSERT INTO ${tableName} (id, ${columns.join(',')}) VALUES (?, ${columns.map(() => '?').join(',')})`).run(id, ...values);
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
        return NextResponse.json(parseRow(row), { status: 201 });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    },
  };
}

// 用于 /api/[resource]/[id] 路由
export async function GET_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(row));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = getDb();
    const body = await req.json();
    const data = prepareSaveData(body);
    const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id' && k !== 'createdAt');
    if (columns.length === 0) {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      return NextResponse.json(parseRow(row));
    }
    const setClause = columns.map(k => `${k} = ?`).join(',');
    const values = columns.map(k => data[k]);
    db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`).run(...values, id);
    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(row));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = getDb();
    const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
    if (result.changes === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
