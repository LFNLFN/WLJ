import { Pool } from 'pg';

type DbConfig = {
  type: 'postgres';
  pg: Pool;
};

let dbConfig: DbConfig | null = null;

// PostgreSQL 连接配置
function getPgPool(): Pool {
  // 只允许连接「线上数据库」：必须显式提供连接串，绝不回退到 localhost 之类的本地库
  const connStr = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connStr) {
    throw new Error(
      '未配置 DATABASE_URL：本项目只使用线上 PostgreSQL，不支持本地数据库。' +
        '请在 .env.local（本地开发）或阿里云服务器的环境变量中配置线上数据库连接串。'
    );
  }

  const sslMode = (process.env.PGSSLMODE || process.env.PGSSL || '').toLowerCase();
  const shouldUseSsl = sslMode === 'disable' ? false : true;
  const ssl = shouldUseSsl ? { rejectUnauthorized: false } : false;

  return new Pool({ connectionString: connStr, ssl });
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
