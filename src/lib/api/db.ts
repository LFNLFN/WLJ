import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // 优先使用 Railway Volume 挂载路径
  const volumePath = process.env.VOLUME_PATH || '/app/server/db';
  const dbPath = process.env.DB_PATH || path.join(volumePath, 'data.db');
  const dbDir = path.dirname(dbPath);
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // 如果数据库文件不存在，但旧的默认路径下有数据，则复制过来
  const oldDbPath = path.join(process.cwd(), 'server', 'db', 'data.db');
  if (!fs.existsSync(dbPath) && fs.existsSync(oldDbPath)) {
    console.log('📂 检测到旧数据库文件，正在迁移到 Volume 目录...');
    fs.copyFileSync(oldDbPath, dbPath);
    console.log('✅ 数据库迁移完成');
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 创建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      subjects TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      parentName TEXT DEFAULT '',
      parentPhone TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subject TEXT DEFAULT '',
      teacherId TEXT DEFAULT '',
      teacherName TEXT DEFAULT '',
      studentIds TEXT DEFAULT '[]',
      studentNames TEXT DEFAULT '[]',
      price REAL DEFAULT 0,
      classHour REAL DEFAULT 1,
      totalClasses INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS class_records (
      id TEXT PRIMARY KEY,
      courseId TEXT DEFAULT '',
      courseName TEXT DEFAULT '',
      teacherId TEXT DEFAULT '',
      teacherName TEXT DEFAULT '',
      studentId TEXT DEFAULT '',
      studentName TEXT DEFAULT '',
      date TEXT DEFAULT '',
      startTime TEXT DEFAULT '',
      endTime TEXT DEFAULT '',
      duration REAL DEFAULT 0,
      content TEXT DEFAULT '',
      homework TEXT DEFAULT '',
      status TEXT DEFAULT 'completed',
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scale_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT DEFAULT "",
      description TEXT DEFAULT "",
      fields TEXT DEFAULT "[]",
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_scale_records (
      id TEXT PRIMARY KEY,
      studentId TEXT DEFAULT "",
      studentName TEXT DEFAULT "",
      scaleTemplateId TEXT DEFAULT "",
      scaleName TEXT DEFAULT "",
      category TEXT DEFAULT "",
      evaluator TEXT DEFAULT "",
      evaluationDate TEXT DEFAULT "",
      scores TEXT DEFAULT "[]",
      summary TEXT DEFAULT "",
      recommendations TEXT DEFAULT "",
      status TEXT DEFAULT "draft",
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function parseRow(row: any): any {
  if (!row) return null;
  const result = { ...row };
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores'].forEach((field) => {
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
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores'].forEach((field) => {
    if (data[field] && Array.isArray(data[field])) data[field] = JSON.stringify(data[field]);
  });
  return data;
}
