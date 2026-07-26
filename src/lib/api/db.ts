import { Pool } from 'pg';
import path from 'path';

type DbConfig = {
  type: 'postgres';
  pg: Pool;
};

let dbConfig: DbConfig | null = null;

// PostgreSQL 连接配置
function getPgPool(): Pool {
  // 优先使用连接字符串
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL || 
                  process.env.RAILWAY_DATABASE_URL || process.env.RAILWAY_POSTGRES_URL;
  const sslMode = (process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  const shouldUseSsl = sslMode === 'disable'
    ? false
    : !!connStr || process.env.NODE_ENV === 'production';
  const ssl = shouldUseSsl ? { rejectUnauthorized: false } : false;

  if (connStr) {
    return new Pool({
      connectionString: connStr,
      ssl,
    });
  }
  // 支持独立的环境变量（PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD）
  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl,
  });
}

export async function getDb(): Promise<Pool> {
  if (dbConfig) {
    return dbConfig.pg;
  }

  const pool = getPgPool();

  dbConfig = { type: 'postgres', pg: pool };
  console.log('✅ PostgreSQL 数据库已连接');
  return pool;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function parseRow(row: any): any {
  if (!row) return null;
  const result = { ...row };
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages', 'rawdata'].forEach((field) => {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch (e) { result[field] = []; }
    }
  });
  result._id = row.id;
  // 兼容全小写数据库列名 → 驼峰命名（student_scale_records 表使用全小写列名）
  const camelCaseMap: Record<string, string> = {
    studentname: 'studentName',
    scalename: 'scaleName',
    evaluationdate: 'evaluationDate',
    rawreportid: 'rawReportId',
    rawdata: 'rawData',
    createdat: 'createdAt',
    updatedat: 'updatedAt',
  };
  for (const [lower, camel] of Object.entries(camelCaseMap)) {
    if (result[lower] !== undefined && result[camel] === undefined) {
      result[camel] = result[lower];
    }
  }
  return result;
}

export function parseRows(rows: any[]): any[] {
  return rows.map(parseRow);
}

export function prepareSaveData(body: any): any {
  const data = { ...body };
  if (data._id) { data.id = data._id; delete data._id; }
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages', 'rawdata'].forEach((field) => {
    if (data[field] && Array.isArray(data[field])) data[field] = JSON.stringify(data[field]);
  });
  return data;
}
