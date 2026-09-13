import { NextRequest, NextResponse } from 'next/server';
import { createHandlers, getDb, generateId, parseRow, parseRows, prepareSaveData } from '@/lib/api/crud';
import { getSessionFromRequest } from '@/lib/auth/current';

// 确保表结构存在（不删除已有数据）
async function ensureTable() {
  try {
    const db = await getDb();
    // 1. 建表（如已存在则跳过）
    await db.query("CREATE TABLE IF NOT EXISTS student_scale_records ("
      + "id TEXT PRIMARY KEY,"
      + "userid TEXT DEFAULT '',"
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
      + "updatedat TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),"
      + "\"reviewStatus\" TEXT DEFAULT 'pending',"
      + "\"reviewComment\" TEXT DEFAULT '',"
      + "\"reviewerId\" TEXT DEFAULT '',"
      + "\"reviewerName\" TEXT DEFAULT '',"
      + "\"reviewedAt\" TEXT DEFAULT ''"
      + ")");
    // 2. 迁移：补充可能缺失的列（兼容旧表）
    const migrations = [
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS userid TEXT DEFAULT ''`,
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
      // 教师批阅相关（小程序教师端）
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT DEFAULT 'pending'`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "reviewComment" TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "reviewerId" TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "reviewerName" TEXT DEFAULT ''`,
      `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "reviewedAt" TEXT DEFAULT ''`,
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

const handlers = createHandlers('student_scale_records', ['studentname', 'userid']);

/**
 * 记录列表（按身份分流）
 *  - 带会话（教师账号，Cookie 或 Bearer token）→ 返回**全部**记录，可用 ?reviewStatus=pending|reviewed 过滤
 *  - 未登录（普通用户/家长）→ 必须带 ?userid=<设备标识>，只返回该设备的记录；否则 401
 * 这样普通用户看不到别人提交的评估表。
 */
export async function GET(req: NextRequest) {
  try {
    await ensureTable();
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const session = await getSessionFromRequest(req);

    if (session) {
      const reviewStatus = searchParams.get('reviewStatus') || searchParams.get('reviewstatus');
      const params: any[] = [];
      let sql = 'SELECT * FROM student_scale_records';
      if (reviewStatus) {
        params.push(reviewStatus);
        sql += ` WHERE "reviewStatus" = $${params.length}`;
      }
      sql += ' ORDER BY "createdAt" DESC';
      const result = await db.query(sql, params);
      return NextResponse.json(parseRows(result.rows));
    }

    const userid = searchParams.get('userid') || searchParams.get('userId');
    if (!userid) {
      return NextResponse.json(
        { error: '未登录：普通用户请带上 userid，教师请先登录教师账号' },
        { status: 401 }
      );
    }
    const result = await db.query(
      'SELECT * FROM student_scale_records WHERE userid = $1 ORDER BY "createdAt" DESC',
      [userid]
    );
    return NextResponse.json(parseRows(result.rows));
  } catch (err: any) {
    console.error('获取评估记录失败:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** 提交评估表：普通用户免登录，但必须带设备 userid；批阅相关字段一律由服务端维护 */
export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const db = await getDb();
    const body = await req.json().catch(() => ({}));
    const session = await getSessionFromRequest(req);

    // 防止客户端伪造批阅信息
    for (const key of ['reviewStatus', 'reviewstatus', 'reviewComment', 'reviewcomment',
      'reviewerId', 'reviewerid', 'reviewerName', 'reviewername', 'reviewedAt', 'reviewedat']) {
      delete body[key];
    }

    const data = prepareSaveData(body);
    const userid = String(data.userid || (session ? session.id : '') || '').trim();
    if (!userid) {
      return NextResponse.json(
        { error: '缺少 userid：普通用户提交评估表需要带设备标识（小程序会自动带上）' },
        { status: 400 }
      );
    }
    data.userid = userid;
    data.reviewStatus = 'pending';
    if (!data.status) data.status = 'completed';

    const id = data.id || generateId();
    const columns = Object.keys(data).filter((k) => k !== 'id' && k !== '_id');
    const cols = columns.map((c) => `"${c}"`).join(',');
    const vals = columns.map((_, i) => `$${i + 2}`).join(',');
    const result = await db.query(
      `INSERT INTO student_scale_records (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
      [id, ...columns.map((k) => data[k])]
    );
    return NextResponse.json(parseRow(result.rows[0]), { status: 201 });
  } catch (err: any) {
    console.error('保存评估记录失败:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
