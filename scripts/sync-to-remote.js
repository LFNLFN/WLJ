// 将本地 SQLite 数据同步到线上 PostgreSQL
// 使用方式: API_URL=https://your-domain.com/api node scripts/sync-to-remote.js

const API_BASE = process.env.API_URL || 'https://wlj-production.up.railway.app/api';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 读取本地 SQLite 数据
const dbPath = path.join(__dirname, '..', 'server', 'db', 'data.db');
console.log(`📂 读取本地数据库: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error('❌ 本地数据库文件不存在:', dbPath);
  process.exit(1);
}

const localDb = new Database(dbPath);

function parseFields(row) {
  if (!row) return row;
  const result = { ...row };
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores'].forEach(field => {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch(e) { result[field] = []; }
    }
  });
  return result;
}

async function syncTable(tableName, apiPath) {
  console.log(`\n📋 同步表: ${tableName}`);
  try {
    const rows = localDb.prepare(`SELECT * FROM ${tableName} ORDER BY createdAt`).all();
    console.log(`   本地共有 ${rows.length} 条记录`);

    // 获取线上已有记录
    let existingRecords = [];
    try {
      const res = await fetch(`${API_BASE}/${apiPath}`);
      if (res.ok) {
        existingRecords = await res.json();
      }
    } catch(e) {
      console.log(`   ⚠️  无法获取线上数据: ${e.message}`);
    }
    console.log(`   线上已有 ${existingRecords.length} 条记录`);

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      const record = parseFields(row);
      const recordId = record.id || record._id;
      
      // 检查是否已存在
      const exists = existingRecords.find(r => (r.id || r._id) === recordId);
      
      if (exists) {
        // 存在则更新
        try {
          const res = await fetch(`${API_BASE}/${apiPath}/${recordId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (res.ok) {
            skipped++;
          } else {
            const err = await res.text();
            console.log(`   ❌ 更新失败 [${record.name || recordId}]: ${err}`);
            failed++;
          }
        } catch(e) {
          console.log(`   ❌ 更新错误 [${record.name || recordId}]: ${e.message}`);
          failed++;
        }
      } else {
        // 不存在则创建
        try {
          const res = await fetch(`${API_BASE}/${apiPath}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (res.ok) {
            synced++;
          } else {
            const err = await res.text();
            console.log(`   ❌ 创建失败 [${record.name || recordId}]: ${err}`);
            failed++;
          }
        } catch(e) {
          console.log(`   ❌ 创建错误 [${record.name || recordId}]: ${e.message}`);
          failed++;
        }
      }
    }

    console.log(`   结果: 新增 ${synced}, 已存在(跳过) ${skipped}, 失败 ${failed}`);
    return { synced, skipped, failed };
  } catch(e) {
    console.log(`   ❌ 同步失败: ${e.message}`);
    return { synced: 0, skipped: 0, failed: 1 };
  }
}

async function main() {
  console.log('🚀 开始同步本地数据到线上...\n');
  console.log(`📡 API 地址: ${API_BASE}\n`);

  const tables = [
    { table: 'teachers', api: 'teachers' },
    { table: 'students', api: 'students' },
    { table: 'courses', api: 'courses' },
    { table: 'class_records', api: 'class-records' },
    { table: 'scale_templates', api: 'scale-templates' },
    { table: 'student_scale_records', api: 'student-scale-records' },
  ];

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const { table, api } of tables) {
    const result = await syncTable(table, api);
    totalSynced += result.synced;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
  }

  localDb.close();

  console.log('\n' + '='.repeat(50));
  console.log('📊 同步完成统计:');
  console.log(`   新增: ${totalSynced}`);
  console.log(`   已存在: ${totalSkipped}`);
  console.log(`   失败: ${totalFailed}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
