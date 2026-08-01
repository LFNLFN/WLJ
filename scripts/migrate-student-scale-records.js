/**
 * 数据库迁移脚本：为 student_scale_records 表补充缺失的列
 * 运行方式：node scripts/migrate-student-scale-records.js
 */
const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!DATABASE_URL) {
  console.error('❌ 未找到 DATABASE_URL 环境变量');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  console.log('🔍 正在检查 student_scale_records 表结构...');

  // 查询现有列
  const result = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'student_scale_records'
    ORDER BY ordinal_position
  `);

  console.log('当前已有列：');
  result.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));

  // 需要的列定义
  const requiredColumns = [
    ['userid', "TEXT DEFAULT ''"],
    ['studentname', "TEXT DEFAULT ''"],
    ['scalename', "TEXT DEFAULT ''"],
    ['category', "TEXT DEFAULT ''"],
    ['evaluator', "TEXT DEFAULT ''"],
    ['evaluationdate', "TEXT DEFAULT ''"],
    ['scores', "TEXT DEFAULT '[]'"],
    ['summary', "TEXT DEFAULT ''"],
    ['recommendations', "TEXT DEFAULT ''"],
    ['status', "TEXT DEFAULT 'draft'"],
    ['source', "TEXT DEFAULT ''"],
    ['rawreportid', "TEXT DEFAULT ''"],
    ['rawdata', "TEXT DEFAULT ''"],
    ['age', "INTEGER DEFAULT 0"],
    ['grade', "TEXT DEFAULT ''"],
    ['gender', "TEXT DEFAULT ''"],
    ['createdat', "TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')"],
    ['updatedat', "TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')"],
  ];

  const existingCols = new Set(result.rows.map(r => r.column_name));
  let added = 0;

  for (const [colName, colType] of requiredColumns) {
    if (!existingCols.has(colName)) {
      console.log(`  ➕ 添加列: ${colName}`);
      await pool.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "${colName}" ${colType}`);
      added++;
    } else {
      console.log(`  ✅ 已存在: ${colName}`);
    }
  }

  console.log(`\n✅ 迁移完成！新增 ${added} 列，共 ${requiredColumns.length} 列已确认。`);

  // 验证
  const verify = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'student_scale_records' ORDER BY ordinal_position
  `);
  console.log('\n最终表结构：');
  verify.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.column_name}`));

  await pool.end();
}

migrate().catch(err => {
  console.error('❌ 迁移失败:', err.message);
  process.exit(1);
});
