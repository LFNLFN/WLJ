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
