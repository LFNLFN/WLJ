import { NextRequest } from 'next/server';
import { createHandlers, getDb } from '@/lib/api/crud';

// 确保表结构存在（不删除已有数据）
async function ensureTable() {
  try {
    const db = await getDb();
    // 1. 建表（如已存在则跳过）
    await db.query("CREATE TABLE IF NOT EXISTS student_scale_records ("
      + "id TEXT PRIMARY KEY,"
      + "studentname TEXT DEFAULT '',"
      + "scalename TEXT DEFAULT '',"
      + "category TEXT DEFAULT '',"
      + "evaluator TEXT DEFAULT '',"
      + "evaluationdate TEXT DEFAULT '',"
      + "scores TEXT DEFAULT '[]',"
      + "summary TEXT DEFAULT '',"
      + "recommendations TEXT DEFAULT '',"
      + "status TEXT DEFAULT 'draft',"
      + "source TEXT DEFAULT '',"
      + "rawreportid TEXT DEFAULT '',"
      + "rawdata TEXT DEFAULT '',"
      + "age INTEGER DEFAULT 0,"
      + "grade TEXT DEFAULT '',"
      + "gender TEXT DEFAULT '',"
      + "createdat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),"
      + "updatedat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')"
      + ")");
    // 2. 迁移：补充可能缺失的列（兼容旧表）
    const migrations = [
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS studentname TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS scalename TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS evaluationdate TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS recommendations TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS source TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS rawreportid TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS rawdata TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS createdat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS updatedat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`,
    ];
    for (const sql of migrations) {
      try { await db.query(sql); } catch(e: any) {
        // PostgreSQL 9.6 以下不支持 IF NOT EXISTS，静默忽略
        if (!e.message?.includes('already exists')) throw e;
      }
    }
  } catch(e: any) {
    console.error('初始化 student_scale_records 表失败:', e.message);
  }
}

const handlers = createHandlers('student_scale_records', ['studentname']);

export async function GET(req: NextRequest) {
  await ensureTable();
  return handlers.GET(req);
}

export async function POST(req: NextRequest) {
  await ensureTable();
  return handlers.POST(req);
}
