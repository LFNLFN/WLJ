// 教师
export interface Teacher {
  id: string;
  name: string;
  gender: string;
  phone: string;
  hireDate: string;
  rank: string;
  subjects: string[];
  createdAt: string;
}

// 学生
export interface Student {
  id: string;
  name: string;
  parentName: string;
  parentPhone: string;
  birthDate: string;
  age: number;
  createdAt: string;
}

// 课程
export interface Course {
  id: string;
  name: string;
  type: 'personal' | 'group';
  subject: string;
  teacherId: string;
  teacherName: string;
  lessonPlanIds: string[];
  lessonPlanTitles: string[];
  studentIds: string[];
  studentNames: string[];
  price: number;
  classHour: number;
  totalClasses: number;
  createdAt: string;
}

// 上课记录
export interface ClassRecord {
  id: string;
  courseId: string;
  courseName: string;
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  content: string;
  homework: string;
  status: 'completed' | 'cancelled' | 'pending';
  createdAt: string;
}

// 仪表盘统计
export interface DashboardStats {
  totalTeachers: number;
  totalStudents: number;
  totalCourses: number;
  totalRecords: number;
  recentRecords: ClassRecord[];
  monthlyIncome: number;
}

// ==================== 量表 ====================

// 量表模板定义
export interface ScaleTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  fields: ScaleField[];
  createdAt: string;
}

// 量表的评估字段
export interface ScaleField {
  id: string;
  label: string;
  type: 'score' | 'select' | 'text' | 'date';
  options?: string[];
  unit?: string;
  sortOrder: number;
}

// 学生量表评估记录
export interface StudentScaleRecord {
  id: string;
  studentId: string;
  studentName: string;
  scaleTemplateId: string;
  scaleName: string;
  category: string;
  evaluator: string;
  evaluationDate: string;
  scores: ScaleScore[];
  summary: string;
  recommendations: string;
  status: 'draft' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// 量表各维度得分
export interface ScaleScore {
  fieldId: string;
  fieldLabel: string;
  value: string | number;
  remark?: string;
}

// ==================== 教案 ====================

export interface LessonPlan {
  id: string;
  title: string;
  type: 'personal' | 'group';
  content: string;
  createdAt: string;
  updatedAt: string;
}
