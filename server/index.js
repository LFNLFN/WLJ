const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

// ==================== PostgreSQL 数据库 ====================
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let db;
let isPg = true;

async function initDb() {
  const { Pool } = require('pg');
  db = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  isPg = true;

  await db.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT DEFAULT '', phone TEXT DEFAULT '',
      "hireDate" TEXT DEFAULT '', rank TEXT DEFAULT '',
      subjects TEXT DEFAULT '[]', "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      "parentName" TEXT DEFAULT '', "parentPhone" TEXT DEFAULT '', "birthDate" TEXT DEFAULT '',
      age INTEGER DEFAULT 0,
      "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, subject TEXT DEFAULT '',
      "teacherId" TEXT DEFAULT '', "teacherName" TEXT DEFAULT '',
      "studentIds" TEXT DEFAULT '[]', "studentNames" TEXT DEFAULT '[]',
      price REAL DEFAULT 0, "classHour" REAL DEFAULT 1, "totalClasses" INTEGER DEFAULT 1,
      "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS class_records (
      id TEXT PRIMARY KEY, "courseId" TEXT DEFAULT '', "courseName" TEXT DEFAULT '',
      "teacherId" TEXT DEFAULT '', "teacherName" TEXT DEFAULT '',
      "studentId" TEXT DEFAULT '', "studentName" TEXT DEFAULT '',
      date TEXT DEFAULT '', "startTime" TEXT DEFAULT '', "endTime" TEXT DEFAULT '',
      duration REAL DEFAULT 0, content TEXT DEFAULT '', homework TEXT DEFAULT '',
      status TEXT DEFAULT 'completed', "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS scale_templates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT DEFAULT '',
      description TEXT DEFAULT '', fields TEXT DEFAULT '[]',
      "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS student_scale_records (
      id TEXT PRIMARY KEY, "studentId" TEXT DEFAULT '', "studentName" TEXT DEFAULT '',
      "scaleTemplateId" TEXT DEFAULT '', "scaleName" TEXT DEFAULT '',
      category TEXT DEFAULT '', evaluator TEXT DEFAULT '',
      "evaluationDate" TEXT DEFAULT '', scores TEXT DEFAULT '[]',
      summary TEXT DEFAULT '', recommendations TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      source TEXT DEFAULT '', "rawReportId" TEXT DEFAULT '', "rawData" TEXT DEFAULT '',
      age INTEGER DEFAULT 0, grade TEXT DEFAULT '', gender TEXT DEFAULT '',
      "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
      "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')
    );
  `);
  // 迁移：补充 student_scale_records 可能缺失的列（兼容旧表结构）
  try {
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "scaleName" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentId" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "studentName" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "scaleTemplateId" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "evaluationDate" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "rawReportId" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "rawData" TEXT DEFAULT ''`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "createdAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`);
    await db.query(`ALTER TABLE student_scale_records ADD COLUMN IF NOT EXISTS "updatedAt" TEXT DEFAULT to_char(now(), 'YYYY-MM-DD HH24:MI:SS')`);
  } catch(e) {
    console.log('迁移提示:', e.message);
  }
  console.log('✅ PostgreSQL 数据库已连接');
}

// ==================== 辅助函数 ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function parseRow(row) {
  if (!row) return null;
  const result = { ...row };
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'rawData'].forEach(f => {
    if (typeof result[f] === 'string') {
      try { result[f] = JSON.parse(result[f]); } catch(e) { result[f] = []; }
    }
  });
  result._id = row.id;
  return result;
}

function parseRows(rows) {
  return rows.map(parseRow);
}

function prepareSaveData(body) {
  const data = { ...body };
  if (data._id) { data.id = data._id; delete data._id; }
  ['subjects', 'studentIds', 'studentNames', 'fields', 'scores', 'rawData'].forEach(f => {
    if (data[f] && Array.isArray(data[f])) data[f] = JSON.stringify(data[f]);
  });
  return data;
}

// ==================== CRUD 工厂 ====================

function createCRUD(route, tableName, filterFields = []) {
  // 获取列表 - DB 失败时返回空数组 []，前端不会崩溃
  app.get(`/api/${route}`, async (req, res) => {
    try {
      let sql = `SELECT * FROM ${tableName}`;
      const conditions = [];
      const params = [];
      for (const field of filterFields) {
        if (req.query[field]) {
          conditions.push(`"${field}" = $${params.length + 1}`);
          params.push(req.query[field]);
        }
      }
      if (conditions.length > 0) sql += ` WHERE ${conditions.join(' AND ')}`;
      sql += ` ORDER BY "createdAt" DESC`;

      const result = await db.query(sql, params);
      res.json(parseRows(result.rows));
    } catch (err) {
      console.error(`获取 ${tableName} 列表失败:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 获取单条
  app.get(`/api/${route}/:id`, async (req, res) => {
    try {
      const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [req.params.id]);
      const row = result.rows[0];
      if (!row) return res.status(404).json({ error: '未找到' });
      res.json(parseRow(row));
    } catch (err) {
      console.error(`获取 ${tableName} 详情失败:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 新增
  app.post(`/api/${route}`, async (req, res) => {
    try {
      const data = prepareSaveData(req.body);
      const id = data.id || generateId();
      const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');

      const cols = columns.map(c => `"${c}"`).join(',');
      const vals = columns.map((_, i) => `$${i + 1}`).join(',');
      const result = await db.query(
        `INSERT INTO ${tableName} (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
        [id, ...columns.map(k => data[k])]
      );
      res.status(201).json(parseRow(result.rows[0]));
    } catch (err) {
      console.error(`创建 ${tableName} 失败:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 更新
  app.put(`/api/${route}/:id`, async (req, res) => {
    try {
      const data = prepareSaveData(req.body);
      const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id' && k !== 'createdAt');

      if (columns.length === 0) {
        const result = await db.query(`SELECT * FROM ${tableName} WHERE id = $1`, [req.params.id]);
        return res.json(parseRow(result.rows[0]));
      }

      const setClause = columns.map((c, i) => `"${c}" = $${i + 1}`).join(',');
      const values = columns.map(k => data[k]);
      const result = await db.query(
        `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
        [...values, req.params.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: '未找到' });
      res.json(parseRow(result.rows[0]));
    } catch (err) {
      console.error(`更新 ${tableName} 失败:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // 删除
  app.delete(`/api/${route}/:id`, async (req, res) => {
    try {
      const result = await db.query(`DELETE FROM ${tableName} WHERE id = $1`, [req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: '未找到' });
      res.json({ message: '删除成功' });
    } catch (err) {
      console.error(`删除 ${tableName} 失败:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ==================== 初始化数据库并注册路由 ====================

initDb().then(() => {
  // 注册 CRUD
  createCRUD('teachers', 'teachers');
  createCRUD('students', 'students');
  createCRUD('courses', 'courses');
  createCRUD('class-records', 'class_records');
  createCRUD("scale-templates", "scale_templates");
  createCRUD("student-scale-records", "student_scale_records", ["studentId"]);

  // 批量创建上课记录
  app.post('/api/class-records/batch', async (req, res) => {
    try {
      const { courseId, courseName, teacherId, teacherName, studentIds, studentNames, date, startTime, endTime, duration, content, homework, status } = req.body;
      if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: '学生列表不能为空' });
      }

      const records = studentIds.map((sid, i) => ({
        id: generateId(), courseId: courseId || '', courseName: courseName || '',
        teacherId: teacherId || '', teacherName: teacherName || '',
        studentId: sid || '', studentName: (studentNames && studentNames[i]) || '未知',
        date: date || '', startTime: startTime || '', endTime: endTime || '',
        duration: duration || 0, content: content || '', homework: homework || '',
        status: status || 'completed',
      }));
      for (const r of records) {
        await db.query(
          `INSERT INTO class_records (id, "courseId", "courseName", "teacherId", "teacherName", "studentId", "studentName", date, "startTime", "endTime", duration, content, homework, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [r.id, r.courseId, r.courseName, r.teacherId, r.teacherName, r.studentId, r.studentName, r.date, r.startTime, r.endTime, r.duration, r.content, r.homework, r.status]
        );
      }
      const ids = records.map(r => r.id);
      const result = await db.query(`SELECT * FROM class_records WHERE id = ANY($1::text[])`, [ids]);
      res.status(201).json(parseRows(result.rows));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 仪表盘统计
  app.get('/api/stats', async (req, res) => {
    try {
      const [t, s, c, r, rr] = await Promise.all([
        db.query('SELECT COUNT(*) as count FROM teachers'),
        db.query('SELECT COUNT(*) as count FROM students'),
        db.query('SELECT COUNT(*) as count FROM courses'),
        db.query('SELECT COUNT(*) as count FROM class_records'),
        db.query('SELECT * FROM class_records ORDER BY "createdAt" DESC LIMIT 5'),
      ]);
      res.json({
        teachers: t.rows[0].count,
        students: s.rows[0].count,
        courses: c.rows[0].count,
        records: r.rows[0].count,
        recentRecords: parseRows(rr.rows),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      db: 'postgresql',
      time: new Date().toISOString()
    });
  });

  // ==================== 集成 Next.js ====================
  const nextDir = path.join(__dirname, '..');
  const nextBuildDir = path.join(nextDir, '.next');

  if (fs.existsSync(nextBuildDir)) {
    const next = require(path.join(__dirname, '..', 'node_modules', 'next'));
    const nextApp = next({ dev: false, dir: nextDir, conf: { distDir: '.next' } });
    const handle = nextApp.getRequestHandler();

    nextApp.prepare().then(() => {
      app.all('*', (req, res) => {
        if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API 路由未找到' });
        return handle(req, res);
      });

      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 服务已启动: http://localhost:${PORT}`);
        console.log(`📋 数据库: PostgreSQL`);
      });
    }).catch(err => {
      console.error('❌ Next.js 启动失败:', err);
      process.exit(1);
    });
  } else {
    app.get('/', (req, res) => {
      res.send(`<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh"><h1>📚 API 服务已启动</h1></body></html>`);
    });
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 API 服务已启动 (无前端): http://localhost:${PORT}`);
    });
  }
}).catch(err => {
  console.error('❌ 数据库初始化失败:', err);
  process.exit(1);
});

// ==================== 微信小程序数据同步 ====================

const assessmentSync = require('./assessment-sync');

// 接收小程序评估数据同步
app.post('/api/weapp-sync', async (req, res) => {
  try {
    const { reports } = req.body;

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return res.status(400).json({ error: '缺少评估报告数据，请提供 reports 数组' });
    }

    const results = [];
    const errors = [];

    for (const report of reports) {
      try {
        const record = assessmentSync.convertToStudentScaleRecord(report);

        // 准备保存数据
        const data = prepareSaveData(record);
        const id = data.id || generateId();
        const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');

        const cols = columns.map(c => `"${c}"`).join(',');
        const vals = columns.map((_, i) => `$${i + 1}`).join(',');
        const result = await db.query(
          `INSERT INTO student_scale_records (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
          [id, ...columns.map(k => data[k])]
        );
        results.push({ id: report.id, savedId: result.rows[0].id, success: true });

        console.log(`✅ 同步成功: ${record.studentName} 的 ${record.scaleName}`);
      } catch (err) {
        console.error(`❌ 同步失败 (${report.id}):`, err.message);
        errors.push({ id: report.id, error: err.message });
      }
    }

    res.json({
      success: true,
      total: reports.length,
      synced: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: `请求处理失败: ${err.message}` });
  }
});

// 同步单条评估记录（小程序直接调用）
app.post('/api/weapp-sync/single', async (req, res) => {
  try {
    const report = req.body;
    if (!report || !report.scaleId) {
      return res.status(400).json({ error: '缺少评估报告数据' });
    }

    const record = assessmentSync.convertToStudentScaleRecord(report);
    const data = prepareSaveData(record);
    const id = data.id || generateId();
    const columns = Object.keys(data).filter(k => k !== 'id' && k !== '_id');

    const cols = columns.map(c => `"${c}"`).join(',');
    const vals = columns.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(
      `INSERT INTO student_scale_records (id, ${cols}) VALUES ($1, ${vals}) RETURNING *`,
      [id, ...columns.map(k => data[k])]
    );
    res.status(201).json({ success: true, savedId: result.rows[0].id, record: parseRow(result.rows[0]) });

    console.log(`✅ 单条同步成功: ${record.studentName} 的 ${record.scaleName}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 同步状态查询
app.get('/api/weapp-sync/status', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT COUNT(*) as total FROM student_scale_records WHERE source = 'weapp_sensory'`
    );
    const synced = await db.query(
      `SELECT * FROM student_scale_records WHERE source = 'weapp_sensory' ORDER BY "createdAt" DESC LIMIT 20`
    );

    res.json({
      dbType: 'postgresql',
      syncedCount: parseInt(result.rows[0].total),
      recentSyncs: parseRows(synced.rows),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
