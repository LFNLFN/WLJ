const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
// CORS 配置 - 允许来自 Vercel 前端的请求
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ==================== SQLite 数据库初始化 ====================

const dbPath = process.env.DB_PATH || path.join(__dirname, 'db', 'data.db');

// 确保数据库目录存在
const dbDir = path.dirname(dbPath);
if (!require('fs').existsSync(dbDir)) {
  require('fs').mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// 启用 WAL 模式（提高并发性能）
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

console.log('✅ SQLite 数据库已初始化');

// ==================== 辅助函数 ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function parseRow(row) {
  if (!row) return null;
  const result = { ...row };
  // 解析 JSON 字符串字段
  if (typeof result.subjects === 'string') {
    try { result.subjects = JSON.parse(result.subjects); } catch(e) { result.subjects = []; }
  }
  if (typeof result.studentIds === 'string') {
    try { result.studentIds = JSON.parse(result.studentIds); } catch(e) { result.studentIds = []; }
  }
  if (typeof result.fields === "string") {
    try { result.fields = JSON.parse(result.fields); } catch(e) { result.fields = []; }
  }
  if (typeof result.scores === "string") {
    try { result.scores = JSON.parse(result.scores); } catch(e) { result.scores = []; }
  }
  if (typeof result.studentNames === 'string') {
    try { result.studentNames = JSON.parse(result.studentNames); } catch(e) { result.studentNames = []; }
  }
  // 把 id 映射为 _id（兼容前端 _id 访问）
  result._id = row.id;
  return result;
}

function parseRows(rows) {
  return rows.map(parseRow);
}

function prepareSaveData(body) {
  const data = { ...body };
  // 把 _id 映射为 id
  if (data._id) { data.id = data._id; delete data._id; }
  // 序列化 JSON 字段
  if (data.subjects && Array.isArray(data.subjects)) data.subjects = JSON.stringify(data.subjects);
  if (data.studentIds && Array.isArray(data.studentIds)) data.studentIds = JSON.stringify(data.studentIds);
  if (data.studentNames && Array.isArray(data.studentNames)) data.studentNames = JSON.stringify(data.studentNames);
  if (data.fields && Array.isArray(data.fields)) data.fields = JSON.stringify(data.fields);
  if (data.scores && Array.isArray(data.scores)) data.scores = JSON.stringify(data.scores);
  return data;
}

// ==================== CRUD 工厂 ====================

function createCRUD(route, tableName, filterFields = []) {
  // 获取全部（支持查询参数过滤）
  app.get(`/api/${route}`, (req, res) => {
    try {
      let sql = `SELECT * FROM ${tableName}`;
      const conditions = [];
      const params = [];
      for (const field of filterFields) {
        if (req.query[field]) {
          conditions.push(`${field} = ?`);
          params.push(req.query[field]);
        }
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ` ORDER BY createdAt DESC`;
      const rows = db.prepare(sql).all(...params);
      res.json(parseRows(rows));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取单个
  app.get(`/api/${route}/:id`, (req, res) => {
    try {
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: '未找到' });
      res.json(parseRow(row));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 创建
  app.post(`/api/${route}`, (req, res) => {
    try {
      const data = prepareSaveData(req.body);
      const id = data.id || generateId();
      
      const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');
      const values = columns.map(k => data[k]);
      
      db.prepare(`INSERT INTO ${tableName} (id, ${columns.join(',')}) VALUES (?, ${columns.map(() => '?').join(',')})`).run(id, ...values);
      
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id);
      res.status(201).json(parseRow(row));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 更新
  app.put(`/api/${route}/:id`, (req, res) => {
    try {
      const data = prepareSaveData(req.body);
      const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id' && k !== 'createdAt');
      
      if (columns.length === 0) {
        const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
        return res.json(parseRow(row));
      }
      
      const setClause = columns.map(k => `${k} = ?`).join(',');
      const values = columns.map(k => data[k]);
      
      db.prepare(`UPDATE ${tableName} SET ${setClause} WHERE id = ?`).run(...values, req.params.id);
      
      const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(req.params.id);
      if (!row) return res.status(404).json({ error: '未找到' });
      res.json(parseRow(row));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 删除
  app.delete(`/api/${route}/:id`, (req, res) => {
    try {
      const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(req.params.id);
      if (result.changes === 0) return res.status(404).json({ error: '未找到' });
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// 注册 CRUD
createCRUD('teachers', 'teachers');
createCRUD('students', 'students');
createCRUD('courses', 'courses');
createCRUD('class-records', 'class_records');
createCRUD("scale-templates", "scale_templates");
createCRUD("student-scale-records", "student_scale_records", ["studentId"]);

// 批量创建上课记录
app.post('/api/class-records/batch', (req, res) => {
  try {
    const { courseId, courseName, teacherId, teacherName, studentIds, studentNames, date, startTime, endTime, duration, content, homework, status } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '学生列表不能为空' });
    }

    const insert = db.prepare(`
      INSERT INTO class_records (id, courseId, courseName, teacherId, teacherName, studentId, studentName, date, startTime, endTime, duration, content, homework, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const savedIds = [];
    const insertMany = db.transaction((items) => {
      for (const item of items) {
        insert.run(...Object.values(item));
        savedIds.push(item.id);
      }
    });

    const records = studentIds.map((studentId, index) => ({
      id: generateId(),
      courseId: courseId || '',
      courseName: courseName || '',
      teacherId: teacherId || '',
      teacherName: teacherName || '',
      studentId: studentId || '',
      studentName: (studentNames && studentNames[index]) || '未知',
      date: date || '',
      startTime: startTime || '',
      endTime: endTime || '',
      duration: duration || 0,
      content: content || '',
      homework: homework || '',
      status: status || 'completed',
    }));

    insertMany(records);

    const saved = db.prepare(`SELECT * FROM class_records WHERE id IN (${savedIds.map(() => '?').join(',')})`).all(...savedIds);
    res.status(201).json(parseRows(saved));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 仪表盘统计
app.get('/api/stats', (req, res) => {
  try {
    const teachers = db.prepare('SELECT COUNT(*) as count FROM teachers').get().count;
    const students = db.prepare('SELECT COUNT(*) as count FROM students').get().count;
    const courses = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
    const records = db.prepare('SELECT COUNT(*) as count FROM class_records').get().count;
    const recentRecords = parseRows(
      db.prepare('SELECT * FROM class_records ORDER BY createdAt DESC LIMIT 5').all()
    );

    res.json({ teachers, students, courses, records, recentRecords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: dbPath, time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API 服务已启动: http://localhost:${PORT}`);
});
