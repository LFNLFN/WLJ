const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Teacher, Student, Course, ClassRecord } = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/little-potato-chips';

// 中间件
app.use(cors());
app.use(express.json());

// 连接 MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB 已连接'))
  .catch(err => console.error('❌ MongoDB 连接失败:', err));

// ==================== 通用 CRUD 工厂 ====================

function createCRUD(route, Model) {
  // 获取全部
  app.get(`/api/${route}`, async (req, res) => {
    try {
      const items = await Model.find().sort({ createdAt: -1 });
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 获取单个
  app.get(`/api/${route}/:id`, async (req, res) => {
    try {
      const item = await Model.findById(req.params.id);
      if (!item) return res.status(404).json({ error: '未找到' });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 创建
  app.post(`/api/${route}`, async (req, res) => {
    try {
      const item = new Model(req.body);
      await item.save();
      res.status(201).json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 更新
  app.put(`/api/${route}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ error: '未找到' });
      res.json(item);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 删除
  app.delete(`/api/${route}/:id`, async (req, res) => {
    try {
      const result = await Model.findByIdAndDelete(req.params.id);
      if (!result) return res.status(404).json({ error: '未找到' });
      res.json({ message: '删除成功' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// 批量创建上课记录（一次性为课程下所有学生创建）
app.post('/api/class-records/batch', async (req, res) => {
  try {
    const { courseId, courseName, teacherId, teacherName, studentIds, studentNames, date, startTime, endTime, duration, content, homework, status } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: '学生列表不能为空' });
    }

    const records = studentIds.map((studentId, index) => ({
      courseId,
      courseName,
      teacherId,
      teacherName,
      studentId,
      studentName: studentNames[index] || '未知',
      date, startTime, endTime, duration, content, homework, status,
      createdAt: new Date(),
    }));

    const saved = await ClassRecord.insertMany(records);
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 注册 CRUD 路由
createCRUD('teachers', Teacher);
createCRUD('students', Student);
createCRUD('courses', Course);
createCRUD('class-records', ClassRecord);

// 仪表盘统计
app.get('/api/stats', async (req, res) => {
  try {
    const [teachers, students, courses, records] = await Promise.all([
      Teacher.countDocuments(),
      Student.countDocuments(),
      Course.countDocuments(),
      ClassRecord.countDocuments(),
    ]);

    const recentRecords = await ClassRecord.find()
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ teachers, students, courses, records, recentRecords });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API 服务已启动: http://localhost:${PORT}`);
});
