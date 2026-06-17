import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/api/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const table = searchParams.get('table') || 'scale_templates';
    const limit = parseInt(searchParams.get('limit') || '100');

    const db = getDb();

    // 获取所有表名
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();

    // 获取指定表的数据
    const rows = db.prepare(`SELECT * FROM ${table} LIMIT ?`).all(limit);

    // 解析 JSON 字段
    const parsedRows = rows.map((row: any) => {
      const result: any = { ...row };
      ['subjects', 'studentIds', 'studentNames', 'fields', 'scores'].forEach(f => {
        if (typeof result[f] === 'string') {
          try { result[f] = JSON.parse(result[f]); } catch(e) { }
        }
      });
      return result;
    });

    return NextResponse.json({
      table,
      total: db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get(),
      tables: tables.map((t: any) => t.name),
      data: parsedRows,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
