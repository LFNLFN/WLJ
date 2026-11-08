/**
 * 评估记录（student_scale_records）去重
 *
 * 背景：小程序每次提交会把「报告自己的 id」作为 rawreportid 一起发上来。
 * 下面这些情况都会让**同一条报告**被 POST 多次：
 *   - 用户连点提交按钮（客户端已加锁，历史版本没有）
 *   - 手机网络抖动，请求超时后重试（第一次其实已经入库）
 *   - /api/weapp-sync 批量重同步同一批报告
 * 每次插入都会生成新的主键 id，所以数据库里会出现多张内容一样的报告。
 *
 * 这里按 rawreportid 做**幂等**：已存在就直接返回已有记录，不再插入新行。
 * 并发（两个请求同时到达）由数据库唯一索引兜底：
 *   CREATE UNIQUE INDEX ... ON student_scale_records (rawreportid)
 *   WHERE rawreportid IS NOT NULL AND rawreportid <> ''
 */

import { generateId } from './db';

/** rawreportid 规范化：去掉空白；空串表示「没有报告 id」，不参与去重 */
export function normalizeRawReportId(value: unknown): string {
  return String(value == null ? '' : value).trim();
}

/**
 * 按 rawreportid 查已入库的报告（保留最早的那条）
 * @returns 已存在的行；没有则返回 null
 */
export async function findStudentScaleRecordByRawReportId(
  db: any,
  rawreportid: string
): Promise<any | null> {
  if (!rawreportid) return null;
  const result = await db.query(
    `SELECT * FROM student_scale_records
     WHERE rawreportid = $1
     ORDER BY createdat ASC NULLS LAST
     LIMIT 1`,
    [rawreportid]
  );
  return result.rows[0] || null;
}

/** PostgreSQL 唯一键冲突（23505）——并发插入同一条报告时靠它兜底 */
export function isUniqueViolation(err: any): boolean {
  return err?.code === '23505';
}

/** 建 rawreportid 唯一索引（幂等；表里已有重复数据时会失败，交给脚本清理） */
export const RAWREPORTID_UNIQUE_INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_student_scale_records_rawreportid
  ON student_scale_records (rawreportid)
  WHERE rawreportid IS NOT NULL AND rawreportid <> ''`;

// ============================================================================
// 小程序 → PC 端学生管理 联动
// ============================================================================

/**
 * 补齐联动所需的列（幂等，进程内只跑一次）：
 *   student_scale_records."studentId" / "studentName" —— 报告 → 学生 的关联
 *   students.userid                                   —— 小程序设备号，用于分辨同名孩子
 */
let schemaReady = false;
export async function ensureStudentLinkSchema(db: any): Promise<void> {
  if (schemaReady) return;
  const statements = [
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentId" TEXT DEFAULT ''`,
    `ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentName" TEXT DEFAULT ''`,
    `ALTER TABLE students ADD COLUMN IF NOT EXISTS userid TEXT DEFAULT ''`,
  ];
  for (const sql of statements) {
    try {
      await db.query(sql);
    } catch (e: any) {
      console.warn('[学生联动] 补齐字段失败（忽略）:', e.message);
    }
  }
  schemaReady = true;
}

export interface StudentLinkResult {
  studentId: string;
  studentName: string;
  /** 本次是否新建了学生档案 */
  created: boolean;
  matchedBy: 'userid' | 'name' | 'created';
}

/** 这些名字当作「没填姓名」，不建学生档案 */
const PLACEHOLDER_NAMES = ['', '未知', '未填写', '匿名', '无'];

/**
 * 评估报告 → 学生档案：同名去重，没有就新建一条
 *
 * 匹配规则（避免每次提交都多一个学生）：
 *   1. 同名 + 同设备号 → 同一个孩子，直接用
 *   2. 同名 + 后台手工建的学生（没有设备号）→ 认领它，并补上设备号
 *   3. 其余（同名但已绑定别的设备）→ 新建，避免把两个孩子的报告混在一起
 *      （同一家庭用两部手机提交会出现两个同名学生，可在 PC 端合并/改名；
 *        宁可多一条档案，也不要把两个孩子的评估数据混在一起）
 */
export async function ensureStudentForReport(
  db: any,
  input: { name: unknown; userid?: unknown; age?: unknown }
): Promise<StudentLinkResult | null> {
  const name = String(input.name == null ? '' : input.name).trim();
  if (PLACEHOLDER_NAMES.includes(name)) return null;

  const userid = String(input.userid == null ? '' : input.userid).trim();
  const age = Number(input.age) || 0;

  const { rows } = await db.query(
    `SELECT id, name, COALESCE(userid, '') AS userid
       FROM students
      WHERE lower(btrim(name)) = lower($1)
      ORDER BY "createdAt" ASC`,
    [name]
  );

  // 1) 同名 + 同设备
  const sameDevice = rows.find((r: any) => userid && r.userid === userid);
  if (sameDevice) {
    return { studentId: sameDevice.id, studentName: sameDevice.name, created: false, matchedBy: 'userid' };
  }

  // 2) 同名 + 后台手工建（没有设备号）→ 认领
  const unbound = rows.find((r: any) => !r.userid);
  if (unbound) {
    if (userid) {
      await db.query('UPDATE students SET userid = $1 WHERE id = $2', [userid, unbound.id]).catch((e: any) =>
        console.warn('[学生联动] 绑定设备号失败（忽略）:', e.message)
      );
    }
    return { studentId: unbound.id, studentName: unbound.name, created: false, matchedBy: 'name' };
  }

  // 3) 新建学生档案（名字/年龄来自评估报告，其它信息留空等老师在 PC 端补）
  const id = generateId();
  await db.query(
    `INSERT INTO students (id, name, "parentName", "parentPhone", "birthDate", age, userid)
     VALUES ($1, $2, '', '', '', $3, $4)`,
    [id, name, age, userid]
  );
  console.log(`[学生联动] 新建学生档案：${name}（${id}）`);
  return { studentId: id, studentName: name, created: true, matchedBy: 'created' };
}
