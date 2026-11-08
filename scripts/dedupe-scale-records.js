#!/usr/bin/env node
/**
 * 评估记录去重（student_scale_records.rawreportid）
 *
 * 用途：
 *   1) 检查库里是否存在「同一个 rawreportid 对应多行」的重复报告
 *   2) --apply 时清理重复（每组只保留最早的一条），并建立唯一索引，
 *      让同一条报告在数据库层面**只能入库一次**（并发/重试都插不进来）
 *
 * 用法：
 *   node scripts/dedupe-scale-records.js            # 只体检，不改数据
 *   node scripts/dedupe-scale-records.js --apply    # 清理重复 + 建唯一索引
 *
 * 说明：
 *   /api/student-scale-records 和 /api/weapp-sync 在写库前都会按 rawreportid
 *   做一次幂等检查；唯一索引是并发情况下的最后一道保险。
 *   如果表里已有重复数据，/api 自动建索引会失败（只打警告），需要先跑 --apply。
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');

function loadEnvLocal() {
  const file = path.join(PROJECT_ROOT, '.env.local');
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

const INDEX_SQL = `CREATE UNIQUE INDEX IF NOT EXISTS idx_student_scale_records_rawreportid
  ON student_scale_records (rawreportid)
  WHERE rawreportid IS NOT NULL AND rawreportid <> ''`;

// 同一 rawreportid 只保留最早一条：createdat 最小的；createdat 相同再按 id 小的留
const DELETE_DUPES_SQL = `
  DELETE FROM student_scale_records a
  USING student_scale_records b
  WHERE a.rawreportid = b.rawreportid
    AND a.rawreportid IS NOT NULL
    AND a.rawreportid <> ''
    AND (COALESCE(a.createdat, '') > COALESCE(b.createdat, '')
         OR (COALESCE(a.createdat, '') = COALESCE(b.createdat, '') AND a.id > b.id))
  RETURNING a.id
`;

async function main() {
  const apply = process.argv.includes('--apply');
  const envFile = loadEnvLocal();
  const connectionString =
    process.env.DATABASE_URL || envFile.DATABASE_URL || envFile.POSTGRES_URL;
  if (!connectionString) {
    console.error('缺少 DATABASE_URL（环境变量或 .env.local）');
    process.exit(1);
  }

  const { Client } = require('pg');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const total = await client.query('SELECT COUNT(*)::int AS n FROM student_scale_records');
    const empty = await client.query(
      "SELECT COUNT(*)::int AS n FROM student_scale_records WHERE rawreportid IS NULL OR rawreportid = ''"
    );
    const groups = await client.query(`
      SELECT rawreportid, COUNT(*)::int AS n, MIN(createdat) AS first_at,
             string_agg(id, ', ' ORDER BY createdat) AS ids
      FROM student_scale_records
      WHERE rawreportid IS NOT NULL AND rawreportid <> ''
      GROUP BY rawreportid
      HAVING COUNT(*) > 1
      ORDER BY n DESC, first_at ASC
    `);
    const dupeRows = groups.rows.reduce((s, r) => s + r.n - 1, 0);

    console.log('=== 评估记录去重体检 ===');
    console.log(`总记录数            : ${total.rows[0].n}`);
    console.log(`rawreportid 为空    : ${empty.rows[0].n}（不参与去重）`);
    console.log(`重复的 rawreportid  : ${groups.rows.length} 组，多余 ${dupeRows} 行`);

    if (groups.rows.length > 0) {
      console.log('\n重复明细（每组只应保留第一条）：');
      groups.rows.slice(0, 20).forEach((r) => {
        console.log(`  ${r.rawreportid} × ${r.n}  (${r.first_at || '无时间'})`);
        console.log(`      ids: ${r.ids}`);
      });
      if (groups.rows.length > 20) console.log(`  ... 其余 ${groups.rows.length - 20} 组省略`);
    }

    if (!apply) {
      console.log('\n未做任何修改。确认无误后执行：node scripts/dedupe-scale-records.js --apply');
      const idx = await client.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'student_scale_records' AND indexname = 'idx_student_scale_records_rawreportid'"
      );
      console.log(idx.rows.length ? '唯一索引已存在 ✅' : '唯一索引尚未创建（重复数据清理后会自动建立）');
      return;
    }

    // ===== --apply：清理重复 + 建唯一索引 =====
    await client.query('BEGIN');
    let deleted = 0;
    try {
      const del = await client.query(DELETE_DUPES_SQL);
      deleted = del.rowCount || 0;
      await client.query(INDEX_SQL);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    console.log(`\n✅ 已删除重复记录 ${deleted} 行`);
    const after = await client.query('SELECT COUNT(*)::int AS n FROM student_scale_records');
    console.log(`✅ 现有记录 ${after.rows[0].n} 行`);
    const idx = await client.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'student_scale_records' AND indexname = 'idx_student_scale_records_rawreportid'"
    );
    console.log(idx.rows.length ? `✅ 唯一索引已建立：\n   ${idx.rows[0].indexdef}` : '⚠️ 唯一索引未建立');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
