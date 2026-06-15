const mongoose = require('mongoose');

// 教师
const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  subjects: [String],
  createdAt: { type: Date, default: Date.now },
});

// 学生
const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  parentName: String,
  parentPhone: String,
  grade: String,
  createdAt: { type: Date, default: Date.now },
});

// 课程
const courseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  subject: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  teacherName: String,
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  studentNames: [String],
  price: Number,
  classHour: Number,
  totalClasses: Number,
  createdAt: { type: Date, default: Date.now },
});

// 上课记录
const classRecordSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  courseName: String,
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  teacherName: String,
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  studentName: String,
  date: String,
  startTime: String,
  endTime: String,
  duration: Number,
  content: String,
  homework: String,
  status: { type: String, enum: ['completed', 'cancelled', 'pending'], default: 'completed' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = {
  Teacher: mongoose.model('Teacher', teacherSchema),
  Student: mongoose.model('Student', studentSchema),
  Course: mongoose.model('Course', courseSchema),
  ClassRecord: mongoose.model('ClassRecord', classRecordSchema),
};
