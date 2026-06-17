// API 基础地址
// 优先级：1. NEXT_PUBLIC_API_URL 环境变量（Vercel 上设置）
//         2. 开发环境 localhost:3001
//         3. 生产环境 Railway
let API_BASE: string;

// 在浏览器环境运行时判断
if (typeof window !== 'undefined') {
  // 1. 优先使用环境变量（Next.js 构建时会替换 NEXT_PUBLIC_ 开头的变量）
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl) {
    API_BASE = envUrl;
  }
  // 2. 开发环境
  else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE = 'http://localhost:3001/api';
  }
  // 3. 生产环境 - Railway 后端
  else {
    API_BASE = 'https://wlj-production.up.railway.app/api';
  }
} else {
  // 构建时或服务端渲染时，使用环境变量
  API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://wlj-production.up.railway.app/api';
}

console.log('[API] 当前 API 地址:', API_BASE);

async function request(path: string, options: RequestInit = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ==================== 教师 ====================

export async function getTeachers() {
  return request('/teachers');
}

export async function getTeacher(id: string) {
  return request(`/teachers/${id}`);
}

export async function saveTeacher(teacher: any) {
  if (teacher.id || teacher._id) {
    return request(`/teachers/${teacher.id || teacher._id}`, {
      method: 'PUT',
      body: JSON.stringify(teacher),
    });
  }
  return request('/teachers', {
    method: 'POST',
    body: JSON.stringify(teacher),
  });
}

export async function deleteTeacher(id: string) {
  return request(`/teachers/${id}`, { method: 'DELETE' });
}

// ==================== 学生 ====================

export async function getStudents() {
  return request('/students');
}

export async function getStudent(id: string) {
  return request(`/students/${id}`);
}

export async function saveStudent(student: any) {
  if (student.id || student._id) {
    return request(`/students/${student.id || student._id}`, {
      method: 'PUT',
      body: JSON.stringify(student),
    });
  }
  return request('/students', {
    method: 'POST',
    body: JSON.stringify(student),
  });
}

export async function deleteStudent(id: string) {
  return request(`/students/${id}`, { method: 'DELETE' });
}

// ==================== 课程 ====================

export async function getCourses() {
  return request('/courses');
}

export async function getCourse(id: string) {
  return request(`/courses/${id}`);
}

export async function saveCourse(course: any) {
  if (course.id || course._id) {
    return request(`/courses/${course.id || course._id}`, {
      method: 'PUT',
      body: JSON.stringify(course),
    });
  }
  return request('/courses', {
    method: 'POST',
    body: JSON.stringify(course),
  });
}

export async function deleteCourse(id: string) {
  return request(`/courses/${id}`, { method: 'DELETE' });
}

// ==================== 上课记录 ====================

export async function getClassRecords() {
  return request('/class-records');
}

export async function getClassRecord(id: string) {
  return request(`/class-records/${id}`);
}

export async function saveClassRecord(record: any) {
  if (record.id || record._id) {
    return request(`/class-records/${record.id || record._id}`, {
      method: 'PUT',
      body: JSON.stringify(record),
    });
  }
  return request('/class-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export async function deleteClassRecord(id: string) {
  return request(`/class-records/${id}`, { method: 'DELETE' });
}

// 批量创建上课记录
export async function batchCreateClassRecords(data: any) {
  return request('/class-records/batch', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ==================== 仪表盘 ====================

export async function getStats() {
  return request('/stats');
}

// ==================== 量表模板 ====================

export async function getScaleTemplates() {
  return request('/scale-templates');
}

export async function getScaleTemplate(id: string) {
  return request(`/scale-templates/${id}`);
}

export async function saveScaleTemplate(template: any) {
  if (template.id || template._id) {
    return request(`/scale-templates/${template.id || template._id}`, {
      method: 'PUT',
      body: JSON.stringify(template),
    });
  }
  return request('/scale-templates', {
    method: 'POST',
    body: JSON.stringify(template),
  });
}

export async function deleteScaleTemplate(id: string) {
  return request(`/scale-templates/${id}`, { method: 'DELETE' });
}

// ==================== 学生量表评估记录 ====================

export async function getStudentScaleRecords() {
  return request('/student-scale-records');
}

export async function getStudentScaleRecord(id: string) {
  return request(`/student-scale-records/${id}`);
}

export async function saveStudentScaleRecord(record: any) {
  if (record.id || record._id) {
    return request(`/student-scale-records/${record.id || record._id}`, {
      method: 'PUT',
      body: JSON.stringify(record),
    });
  }
  return request('/student-scale-records', {
    method: 'POST',
    body: JSON.stringify(record),
  });
}

export async function deleteStudentScaleRecord(id: string) {
  return request(`/student-scale-records/${id}`, { method: 'DELETE' });
}

// 获取某个学生的所有量表评估记录
export async function getStudentScaleRecordsByStudent(studentId: string) {
  // 使用服务端过滤，避免全量数据拉取
  return request(`/student-scale-records?studentId=${encodeURIComponent(studentId)}`);
}
