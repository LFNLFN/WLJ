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

// ==================== 阶段计划 ====================

export type StagePlanType = 'lesson' | 'week' | 'month';

export interface CourseStage {
  id: string;
  label: string;      // 阶段名称
  start: number;      // 起始
  end: number;        // 结束
  content: string;    // 教学内容
  objectives: string; // 教学目标/效果
  completed: boolean; // 是否完成
  lessonPlanIds: string[];
  lessonPlanTitles: string[];
}


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
  stagePlanType: StagePlanType;
  stages: CourseStage[];
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

// ==================== AI ====================

export interface AIConfig {
  provider: 'deepseek' | 'openai' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIGenerateRequest {
  messages: AIChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerateResponse {
  content: string;
  error?: string;
}

export interface RAGSearchResult {
  id: string;
  title: string;
  content: string;
  type: string;
  score: number;
}

// ==================== 微信小程序同步 ====================

// 小程序同步的评估记录（扩展 StudentScaleRecord 字段）
export interface SyncedScaleRecord extends StudentScaleRecord {
  source: string;          // 来源标记: 'weapp_sensory'
  rawReportId: string;     // 小程序原始报告ID
  rawData: string;         // 小程序原始报告JSON
  age: number;             // 年龄
  grade: string;           // 年级
  gender: string;          // 性别
}

// 同步请求
export interface SyncRequest {
  reports: any[];  // 小程序评估报告数组
}

// 同步结果
export interface SyncResult {
  id: string;        // 小程序报告ID
  savedId: string;   // 本地数据库ID
  success: boolean;
}

// 同步响应
export interface SyncResponse {
  success: boolean;
  total: number;
  synced: number;
  failed: number;
  results: SyncResult[];
  errors?: { id: string; error: string }[];
}

// 同步状态
export interface SyncStatus {
  dbType: 'postgresql' | 'sqlite';
  syncedCount: number;
  recentSyncs: SyncedScaleRecord[];
}
