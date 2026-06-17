// 教师
export interface Teacher {
  id: string;
  name: string;
  phone: string;
  subjects: string[];
  createdAt: string;
}

// 学生
export interface Student {
  id: string;
  name: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  grade: string;
  createdAt: string;
}

// 课程
export interface Course {
  id: string;
  name: string;
  subject: string;
  teacherId: string;
  teacherName: string;
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

// 量表模板定义（某种量表的模板，如"韦氏智力测试"、"感统评估量表"等）
export interface ScaleTemplate {
  id: string;
  name: string;              // 量表名称
  category: string;          // 量表类别（智力/感统/语言/行为/情绪/其他）
  description: string;       // 量表描述
  fields: ScaleField[];      // 量表包含的评估字段
  createdAt: string;
}

// 量表的评估字段
export interface ScaleField {
  id: string;
  label: string;             // 字段名称（如"语言理解"、"粗大动作"）
  type: 'score' | 'select' | 'text' | 'date';  // 字段类型
  options?: string[];        // 如果是 select 类型，可选值列表
  unit?: string;             // 单位（如"分"、"月龄"）
  sortOrder: number;         // 排序
}

// 学生量表评估记录（某个学生在某个量表上的评估结果）
export interface StudentScaleRecord {
  id: string;
  studentId: string;         // 学生 ID
  studentName: string;       // 学生姓名
  scaleTemplateId: string;   // 量表模板 ID
  scaleName: string;         // 量表名称
  category: string;          // 量表类别
  evaluator: string;         // 评估人
  evaluationDate: string;    // 评估日期
  scores: ScaleScore[];      // 各维度得分
  summary: string;           // 综合评估结论
  recommendations: string;   // 康复建议
  status: 'draft' | 'completed';  // 状态
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
