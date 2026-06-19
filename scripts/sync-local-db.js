// 修复本地 SQLite 数据库 schema，使其与 src/lib/api/db.ts 一致
// 并导出所有数据，然后重新创建符合新 schema 的数据库

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'server', 'db', 'data.db');
const BACKUP_PATH = path.join(__dirname, '..', 'server', 'db', 'data.db.backup');

console.log('📂 数据库路径:', DB_PATH);

// 1. 备份原数据库
console.log('\n📦 备份原数据库...');
if (fs.existsSync(DB_PATH)) {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
  console.log('✅ 备份完成:', BACKUP_PATH);
}

// 2. 读取所有数据
console.log('\n📖 读取现有数据...');
const oldDb = new Database(DB_PATH);

const tables = ['teachers', 'students', 'courses', 'class_records', 'scale_templates', 'student_scale_records'];
const allData = {};

for (const table of tables) {
  try {
    const rows = oldDb.prepare(`SELECT * FROM ${table}`).all();
    allData[table] = rows;
    console.log(`   ${table}: ${rows.length} 条记录`);
  } catch(e) {
    console.log(`   ${table}: 读取失败 - ${e.message}`);
    allData[table] = [];
  }
}
oldDb.close();

// 3. 删除旧数据库（让 src/lib/api/db.ts 重新创建）
console.log('\n🗑️  删除旧数据库，准备重建...');
try {
  // 关闭 WAL 文件
  if (fs.existsSync(DB_PATH + '-shm')) fs.unlinkSync(DB_PATH + '-shm');
  if (fs.existsSync(DB_PATH + '-wal')) fs.unlinkSync(DB_PATH + '-wal');
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  console.log('✅ 已删除旧数据库');
} catch(e) {
  console.log('❌ 删除失败:', e.message);
}

// 4. 使用 src/lib/api/db.ts 的 schema 重新创建数据库
console.log('\n🔄 使用新 schema 创建数据库...');
const newDb = new Database(DB_PATH);
newDb.pragma('journal_mode = WAL');

newDb.exec(`
  CREATE TABLE IF NOT EXISTS teachers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT DEFAULT '',
    phone TEXT DEFAULT '', "hireDate" TEXT DEFAULT '', rank TEXT DEFAULT '',
    subjects TEXT DEFAULT '[]', createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    parentName TEXT DEFAULT '', parentPhone TEXT DEFAULT '', birthDate TEXT DEFAULT '',
    age INTEGER DEFAULT 0,
    createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT DEFAULT '',
    teacherId TEXT DEFAULT '', teacherName TEXT DEFAULT '',
    studentIds TEXT DEFAULT '[]', studentNames TEXT DEFAULT '[]',
    price REAL DEFAULT 0, classHour REAL DEFAULT 1, totalClasses INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS class_records (
    id TEXT PRIMARY KEY, courseId TEXT DEFAULT '', courseName TEXT DEFAULT '',
    teacherId TEXT DEFAULT '', teacherName TEXT DEFAULT '',
    studentId TEXT DEFAULT '', studentName TEXT DEFAULT '',
    date TEXT DEFAULT '', startTime TEXT DEFAULT '', endTime TEXT DEFAULT '',
    duration REAL DEFAULT 0, content TEXT DEFAULT '', homework TEXT DEFAULT '',
    status TEXT DEFAULT 'completed', createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS scale_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT "",
    description TEXT DEFAULT "", fields TEXT DEFAULT "[]",
    createdAt TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS student_scale_records (
    id TEXT PRIMARY KEY, studentId TEXT DEFAULT "", studentName TEXT DEFAULT "",
    scaleTemplateId TEXT DEFAULT "", scaleName TEXT DEFAULT "",
    category TEXT DEFAULT "", evaluator TEXT DEFAULT "",
    evaluationDate TEXT DEFAULT "", scores TEXT DEFAULT "[]",
    summary TEXT DEFAULT "", recommendations TEXT DEFAULT "",
    status TEXT DEFAULT "draft",
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );
`);

console.log('✅ 数据库表结构重建完成');

// 5. 重新插入数据（适配新 schema）
console.log('\n📥 恢复数据到新数据库...');
let totalInserted = 0;
let totalFailed = 0;

// teachers - 适配新字段
const insertTeacher = newDb.prepare(`
  INSERT OR REPLACE INTO teachers (id, name, gender, phone, "hireDate", rank, subjects, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const row of allData.teachers) {
  try {
    insertTeacher.run(
      row.id, row.name,
      row.gender || '', row.phone || '',
      row.hireDate || '', row.rank || '',
      row.subjects || '[]', row.createdAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 教师 ${row.name}: ${e.message}`);
    totalFailed++;
  }
}

// students - phone 字段移到 parentPhone
const insertStudent = newDb.prepare(`
  INSERT OR REPLACE INTO students (id, name, parentName, parentPhone, birthDate, age, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
for (const row of allData.students) {
  try {
    insertStudent.run(
      row.id, row.name,
      row.parentName || '', row.parentPhone || row.phone || '',
      row.birthDate || '', row.age || 0,
      row.createdAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 学生 ${row.name}: ${e.message}`);
    totalFailed++;
  }
}

// courses
const insertCourse = newDb.prepare(`
  INSERT OR REPLACE INTO courses (id, name, subject, teacherId, teacherName, studentIds, studentNames, price, classHour, totalClasses, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const row of allData.courses) {
  try {
    insertCourse.run(
      row.id, row.name, row.subject || '',
      row.teacherId || '', row.teacherName || '',
      row.studentIds || '[]', row.studentNames || '[]',
      row.price || 0, row.classHour || 1, row.totalClasses || 1,
      row.createdAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 课程 ${row.name}: ${e.message}`);
    totalFailed++;
  }
}

// class_records
const insertRecord = newDb.prepare(`
  INSERT OR REPLACE INTO class_records (id, courseId, courseName, teacherId, teacherName, studentId, studentName, date, startTime, endTime, duration, content, homework, status, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const row of allData.class_records) {
  try {
    insertRecord.run(
      row.id, row.courseId || '', row.courseName || '',
      row.teacherId || '', row.teacherName || '',
      row.studentId || '', row.studentName || '',
      row.date || '', row.startTime || '', row.endTime || '',
      row.duration || 0, row.content || '', row.homework || '',
      row.status || 'completed', row.createdAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 上课记录: ${e.message}`);
    totalFailed++;
  }
}

// scale_templates
const insertTemplate = newDb.prepare(`
  INSERT OR REPLACE INTO scale_templates (id, name, category, description, fields, createdAt)
  VALUES (?, ?, ?, ?, ?, ?)
`);
for (const row of allData.scale_templates) {
  try {
    insertTemplate.run(
      row.id, row.name, row.category || '',
      row.description || '', typeof row.fields === 'string' ? row.fields : JSON.stringify(row.fields || []),
      row.createdAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 量表模板 ${row.name}: ${e.message}`);
    totalFailed++;
  }
}

// student_scale_records
const insertScaleRecord = newDb.prepare(`
  INSERT OR REPLACE INTO student_scale_records (id, studentId, studentName, scaleTemplateId, scaleName, category, evaluator, evaluationDate, scores, summary, recommendations, status, createdAt, updatedAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
for (const row of allData.student_scale_records) {
  try {
    insertScaleRecord.run(
      row.id, row.studentId || '', row.studentName || '',
      row.scaleTemplateId || '', row.scaleName || '',
      row.category || '', row.evaluator || '',
      row.evaluationDate || '', typeof row.scores === 'string' ? row.scores : JSON.stringify(row.scores || []),
      row.summary || '', row.recommendations || '',
      row.status || 'draft', row.createdAt || new Date().toISOString(),
      row.updatedAt || new Date().toISOString()
    );
    totalInserted++;
  } catch(e) {
    console.log(`   ❌ 量表评估记录: ${e.message}`);
    totalFailed++;
  }
}

newDb.close();

console.log(`\n✅ 数据恢复完成: 成功 ${totalInserted} 条, 失败 ${totalFailed} 条`);

// 6. 同步到线上
console.log('\n' + '='.repeat(50));
console.log('🔄 现在运行同步到线上...');
console.log('   执行: node scripts/sync-to-remote.js');
console.log('='.repeat(50));
