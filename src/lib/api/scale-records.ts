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
