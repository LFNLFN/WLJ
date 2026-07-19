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
  if (connStr) {
    return new Pool({
      connectionString: connStr,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  // 支持独立的环境变量（PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD）
  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });
}

// PostgreSQL 表创建
const PG_CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    "hireDate" TEXT DEFAULT '',
    rank TEXT DEFAULT '',
    subjects TEXT DEFAULT '[]',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    "parentName" TEXT DEFAULT '',
    "parentPhone" TEXT DEFAULT '',
    "birthDate" TEXT DEFAULT '',
    age INTEGER DEFAULT 0,
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'personal',
    subject TEXT DEFAULT '',
    "teacherId" TEXT DEFAULT '',
    "teacherName" TEXT DEFAULT '',
    "lessonPlanIds" TEXT DEFAULT '[]',
    "lessonPlanTitles" TEXT DEFAULT '[]',
    "stagePlanType" TEXT DEFAULT 'lesson',
    "stages" TEXT DEFAULT '[]',
    "studentIds" TEXT DEFAULT '[]',
    "studentNames" TEXT DEFAULT '[]',
    price REAL DEFAULT 0,
    "classHour" REAL DEFAULT 1,
    "totalClasses" INTEGER DEFAULT 1,
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS class_records (
    id TEXT PRIMARY KEY,
    "courseId" TEXT DEFAULT '',
    "courseName" TEXT DEFAULT '',
    "teacherId" TEXT DEFAULT '',
    "teacherName" TEXT DEFAULT '',
    "studentId" TEXT DEFAULT '',
    "studentName" TEXT DEFAULT '',
    date TEXT DEFAULT '',
    "startTime" TEXT DEFAULT '',
    "endTime" TEXT DEFAULT '',
    duration REAL DEFAULT 0,
    content TEXT DEFAULT '',
    homework TEXT DEFAULT '',
    status TEXT DEFAULT 'completed',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS scale_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT '',
    description TEXT DEFAULT '',
    fields TEXT DEFAULT '[]',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS student_scale_records (
    id TEXT PRIMARY KEY,
    "studentId" TEXT DEFAULT '',
    "studentName" TEXT DEFAULT '',
    "scaleTemplateId" TEXT DEFAULT '',
    "scaleName" TEXT DEFAULT '',
    category TEXT DEFAULT '',
    evaluator TEXT DEFAULT '',
    "evaluationDate" TEXT DEFAULT '',
    scores TEXT DEFAULT '[]',
    summary TEXT DEFAULT '',
    recommendations TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
  CREATE TABLE IF NOT EXISTS lesson_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'personal',
    content TEXT DEFAULT '',
    "studentId" TEXT DEFAULT '',
    "studentName" TEXT DEFAULT '',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );

  CREATE TABLE IF NOT EXISTS training_plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    "childName" TEXT DEFAULT '',
    "planData" TEXT DEFAULT '{}',
    "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
    "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
  );
`;

export async function getDb(): Promise<Pool> {
  if (dbConfig) {
    return dbConfig.pg;
  }

  const pool = getPgPool();
  // 创建表
  await pool.query(PG_CREATE_TABLES);
  // 数据库迁移: 为已有表添加新字段
  try { await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS "birthDate" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE students ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0'); } catch(e) {}
  try { await pool.query('ALTER TABLE students DROP COLUMN IF EXISTS grade'); } catch(e) {}
  try { await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS "gender" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS "phone" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS "hireDate" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS "rank" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE teachers ADD COLUMN IF NOT EXISTS "subjects" TEXT DEFAULT \'[]\''); } catch(e) {}
  try { await pool.query('ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS "content" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS "updatedAt" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'personal\''); } catch(e) {}
  try { await pool.query('ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS "studentId" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE lesson_plans ADD COLUMN IF NOT EXISTS "studentName" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS "title" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS "childName" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE training_plans ADD COLUMN IF NOT EXISTS "planData" TEXT DEFAULT \'{}\''); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "rawReportId" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "rawData" TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS age INTEGER DEFAULT 0'); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT \'\''); } catch(e) {}
  try { await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS "type" TEXT DEFAULT \'personal\''); } catch(e) {}
  try { await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS "lessonPlanIds" TEXT DEFAULT \'[]\''); } catch(e) {}
  try { await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS "lessonPlanTitles" TEXT DEFAULT \'[]\''); } catch(e) {}
  try { await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS "stagePlanType" TEXT DEFAULT \'lesson\''); } catch(e) {}
  try { await pool.query('ALTER TABLE courses ADD COLUMN IF NOT EXISTS "stages" TEXT DEFAULT \'[]\''); } catch(e) {}

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
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages'].forEach((field) => {
    if (typeof result[field] === 'string') {
      try { result[field] = JSON.parse(result[field]); } catch (e) { result[field] = []; }
    }
  });
  result._id = row.id;
  return result;
}

export function parseRows(rows: any[]): any[] {
  return rows.map(parseRow);
}

export function prepareSaveData(body: any): any {
  const data = { ...body };
  if (data._id) { data.id = data._id; delete data._id; }
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'lessonPlanIds', 'lessonPlanTitles', 'stages'].forEach((field) => {
    if (data[field] && Array.isArray(data[field])) data[field] = JSON.stringify(data[field]);
  });
  return data;
}
