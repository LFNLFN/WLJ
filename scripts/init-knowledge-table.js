#!/usr/bin/env node
/**
 * 创建 / 核对知识库表 knowledge_documents（幂等，可重复执行）
 *
 * 用法：
 *   DATABASE_URL="postgresql://..." node scripts/init-knowledge-table.js
 *   node scripts/init-knowledge-table.js --list          # 只列出已有资料
 *
 * 说明：
 *   /api/knowledge 首次被调用时会自动建表（CREATE TABLE IF NOT EXISTS），
 *   这个脚本供运维在没有页面访问权限时手动执行 / 核对，不依赖 Next.js 运行时。
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

const DDL = `
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id text PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '其它',
  content text NOT NULL DEFAULT '',
  filename text,
  mimetype text,
  size integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'upload',
  "createdBy" text,
  "createdAt" text,
  "updatedAt" text
)`;

async function main() {
  const env = loadEnvLocal();
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || env.DATABASE_URL;
  if (!connStr) {
    console.error('缺少 DATABASE_URL（线上 PostgreSQL 连接串）');
    process.exit(1);
  }

  // 只依赖项目自身安装的 pg
  const { Pool } = require(path.join(PROJECT_ROOT, 'node_modules', 'pg'));
  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });

  try {
    if (!process.argv.includes('--list')) {
      await pool.query(DDL);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS knowledge_documents_created_at_idx ON knowledge_documents ("createdAt" DESC)`
      );
      console.log('✅ 表 knowledge_documents 已就绪');
    }

    const { rows } = await pool.query(
      `SELECT id, title, category, coalesce(length(content), 0) AS chars, "createdAt"
       FROM knowledge_documents ORDER BY "createdAt" DESC LIMIT 100`
    );
    console.log(`📚 现有资料 ${rows.length} 份：`);
    for (const r of rows) {
      console.log(`  - ${r.id}  [${r.category}]  ${r.title}  (${r.chars} 字, ${r.createdAt || ''})`);
    }
  } catch (err) {
    console.error('执行失败：', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
