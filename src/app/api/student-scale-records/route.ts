import { NextRequest } from 'next/server';
import { createHandlers, getDb } from '@/lib/api/crud';

// 确保表结构存在（不删除已有数据）
async function ensureTable() {
  try {
    const db = await getDb();
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
