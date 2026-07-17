import { NextRequest, NextResponse } from 'next/server';
import { getDb, generateId, parseRow, parseRows, prepareSaveData } from './db';
import { Pool } from 'pg';

export { getDb, generateId, parseRow, parseRows, prepareSaveData, isPg };

// 判断是否 PostgreSQL
function isPg(db: any): db is Pool {
  return db && 
         typeof db.query === 'function' && 
         typeof db.connect === 'function' && 
         typeof db.prepare !== 'function';
}

// 查询超时时间（毫秒）
const QUERY_TIMEOUT = 10000;

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

        let rows: any[];
        if (isPg(db)) {
          // 设置查询超时
          await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
          const result = await db.query(sql, params);
          rows = result.rows;
        } else {
          rows = db.prepare(
            sql.replace(/"([^"]+)"/g, '$1').replace(/\$\d+/g, '?')
          ).all(...params);
        }
        return NextResponse.json(parseRows(rows));
      } catch (err: any) {
        // 区分超时错误和其他错误
        if (err.code === '57014') {
          return NextResponse.json(
            { error: '数据库查询超时，请稍后重试' },
            { status: 503 }
          );
        }
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
        
        if (isPg(db)) {
          await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
          const cols = columns.map(c => `"${c}"`).join(',');
          const vals = columns.map((_, i) => `$${i + 2}`).join(',');
          const result = await db.query(
            `INSERT INTO ${tableName} (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
            [id, ...columns.map(k => data[k])]
          );
          return NextResponse.json(parseRow(result.rows[0]), { status: 201 });
        } else {
          const values = columns.map(k => data[k]);
          db.prepare(
            `INSERT INTO ${tableName} (id, ${columns.join(',')}) VALUES (?, ${columns.map(() => '?').join(',')})`
          ).run(id, ...values);
          const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
          return NextResponse.json(parseRow(row), { status: 201 });
        }
      } catch (err: any) {
        if (err.code === '57014') {
          return NextResponse.json(
            { error: '数据库操作超时，请稍后重试' },
            { status: 503 }
          );
        }
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    },
  };
}

export async function GET_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = await getDb();
    let row: any;
    if (isPg(db)) {
      await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
      const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
      row = result.rows[0];
    } else {
      row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
    }
    if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
    return NextResponse.json(parseRow(row));
  } catch (err: any) {
    if (err.code === '57014') {
      return NextResponse.json({ error: '数据库查询超时' }, { status: 503 });
    }
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
      if (isPg(db)) {
        await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
        const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
        return NextResponse.json(parseRow(result.rows[0]));
      } else {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
        return NextResponse.json(parseRow(row));
      }
    }

    if (isPg(db)) {
      await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
      const setClause = columns.map((c, i) => `"${c}" = $${i + 1}`).join(',');
      const values = columns.map(k => data[k]);
      const result = await db.query(
        `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
        [...values, id]
      );
      if (!result.rows[0]) return NextResponse.json({ error: '未找到' }, { status: 404 });
      return NextResponse.json(parseRow(result.rows[0]));
    } else {
      const setClause = columns.map(k => `${k} = ?`).join(',');
      const values = columns.map(k => data[k]);
      db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`).run(...values, id);
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      if (!row) return NextResponse.json({ error: '未找到' }, { status: 404 });
      return NextResponse.json(parseRow(row));
    }
  } catch (err: any) {
    if (err.code === '57014') {
      return NextResponse.json({ error: '数据库更新超时' }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE_byId(req: NextRequest, tableName: string, id: string) {
  try {
    const db = await getDb();
    if (isPg(db)) {
      await db.query('SET statement_timeout = $1', [QUERY_TIMEOUT]);
      const result = await db.query(`DELETE FROM ${tableName} WHERE id = $1`, [id]);
      if (result.rowCount === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    } else {
      const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id);
      if (result.changes === 0) return NextResponse.json({ error: '未找到' }, { status: 404 });
    }
    return NextResponse.json({ message: '删除成功' });
  } catch (err: any) {
    if (err.code === '57014') {
      return NextResponse.json({ error: '数据库删除超时' }, { status: 503 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
