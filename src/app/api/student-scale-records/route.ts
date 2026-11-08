import { NextRequest, NextResponse } from 'next/server';
import { createHandlers, getDb, generateId, parseRow, parseRows, prepareSaveData } from '@/lib/api/crud';
import {
  RAWREPORTID_UNIQUE_INDEX_SQL,
  ensureStudentForReport,
  ensureStudentLinkSchema,
  findStudentScaleRecordByRawReportId,
  isUniqueViolation,
  normalizeRawReportId,
} from '@/lib/api/scale-records';
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
    // 3. rawreportid 唯一索引：同一条小程序报告（rawreportid）只允许入库一次，
    //    用户连点 / 网络重试 / 批量重同步并发时由数据库兜底。
    //    若表里已存在历史重复数据，这里会失败（下次请求还会重试）——用
    //    `node scripts/dedupe-scale-records.js --apply` 清理后即可成功。
    try {
      await db.query(RAWREPORTID_UNIQUE_INDEX_SQL);
    } catch (e: any) {
      console.warn('创建 rawreportid 唯一索引失败（可能已存在重复数据）:', e.message);
    }
    // 4. 小程序 → PC 学生管理联动所需字段（进程内只补一次）
    await ensureStudentLinkSchema(db);
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

    const studentId = searchParams.get('studentId') || searchParams.get('studentid');

    if (session) {
      const reviewStatus = searchParams.get('reviewStatus') || searchParams.get('reviewstatus');
      const params: any[] = [];
      const conditions: string[] = [];
      let sql = 'SELECT * FROM student_scale_records';
      if (reviewStatus) {
        params.push(reviewStatus);
        conditions.push(`"reviewStatus" = $${params.length}`);
      }
      // 按学生过滤（PC「学生管理 → 查看评估」用）
      if (studentId) {
        params.push(studentId);
        conditions.push(`"studentId" = $${params.length}`);
      }
      if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
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
    const params: any[] = [userid];
    let sql = 'SELECT * FROM student_scale_records WHERE userid = $1';
    if (studentId) {
      params.push(studentId);
      sql += ` AND "studentId" = $${params.length}`;
    }
    sql += ' ORDER BY "createdAt" DESC';
    const result = await db.query(sql, params);
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

    // ===== 去重：同一条小程序报告（rawreportid）只入库一次 =====
    // 网络重试 / 连点 / 批量重同步都会把同一条报告再发一次，
    // 命中已存在的记录时直接返回它（200 + duplicate），不再插入新行。
    const rawreportid = normalizeRawReportId(data.rawreportid);
    data.rawreportid = rawreportid;
    if (rawreportid) {
      const existing = await findStudentScaleRecordByRawReportId(db, rawreportid);
      if (existing) {
        // 只回 id，不回整条记录：POST 免登录，避免用别人的 rawreportid 探测报告内容
        return NextResponse.json(
          { id: existing.id, duplicate: true, message: '该报告已提交过，已忽略重复提交' },
          { status: 200 }
        );
      }
    }

    // ===== 联动：把报告里的学生同步到 PC 学生管理 =====
    // 同名去重，没有就新建学生档案，并把报告挂到这个学生下面（PC「查看评估」按 studentId 过滤）。
    // 放在去重判断之后：重复提交直接返回已有记录，不用再动学生档案。
    // 联动失败不能影响报告提交，所以单独 try/catch。
    try {
      const link = await ensureStudentForReport(db, {
        name: data.studentname || data.studentName,
        userid,
        age: data.age,
      });
      if (link) {
        data.studentId = link.studentId;
        data.studentName = link.studentName;
      }
    } catch (e: any) {
      console.warn('[学生联动] 同步学生档案失败（不影响报告提交）:', e.message);
    }

    const id = data.id || generateId();
    const columns = Object.keys(data).filter((k) => k !== 'id' && k !== '_id');
    const cols = columns.map((c) => `"${c}"`).join(',');
    const vals = columns.map((_, i) => `$${i + 2}`).join(',');
    let result;
    try {
      result = await db.query(
        `INSERT INTO student_scale_records (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
        [id, ...columns.map((k) => data[k])]
      );
    } catch (err: any) {
      // 并发兜底：两个请求同时通过了上面的查询，唯一索引会让后到的插入失败，
      // 此时同样返回已存在的那条记录（不报 500、不产生重复行）。
      if (isUniqueViolation(err) && rawreportid) {
        const existing = await findStudentScaleRecordByRawReportId(db, rawreportid);
        if (existing) {
          return NextResponse.json(
            { id: existing.id, duplicate: true, message: '该报告已提交过，已忽略重复提交' },
            { status: 200 }
          );
        }
      }
      throw err;
    }
    return NextResponse.json(parseRow(result.rows[0]), { status: 201 });
  } catch (err: any) {
    console.error('保存评估记录失败:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
