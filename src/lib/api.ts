// API 基础地址（唯一入口）
//
// 所有接口——包括登录 / 注册（/auth/login、/auth/register）——都使用这个相对路径，
// 即「与页面同源」：本地是 http://localhost:3000/api，线上是 https://www.weilaijia20210101.com/api。
// 登录接口和 /teachers、/students 等其它接口在同一 origin，不要在任何地方写死其它域名。
const API_BASE = '/api';

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
  return request('/class-records?batch=true', {
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
  return request(`/student-scale-records?studentId=${encodeURIComponent(studentId)}`);
}

// ==================== 教案 ====================

export async function getLessonPlans(keyword?: string, type?: string) {
  const searchParams = new URLSearchParams();
  if (keyword) searchParams.set('keyword', keyword);
  if (type) searchParams.set('type', type);
  const query = searchParams.toString();
  return request(`/lesson-plans${query ? '?' + query : ''}`);
}

export async function getLessonPlan(id: string) {
  return request(`/lesson-plans/${id}`);
}

export async function saveLessonPlan(plan: any) {
  if (plan.id || plan._id) {
    return request(`/lesson-plans/${plan.id || plan._id}`, {
      method: 'PUT',
      body: JSON.stringify(plan),
    });
  }
  return request('/lesson-plans', {
    method: 'POST',
    body: JSON.stringify(plan),
  });
}

export async function deleteLessonPlan(id: string) {
  return request(`/lesson-plans/${id}`, { method: 'DELETE' });
}

// ==================== AI ====================

export async function aiGenerate(messages: { role: string; content: string }[], temperature?: number, maxTokens?: number) {
  return request('/ai/generate', {
    method: 'POST',
    body: JSON.stringify({ messages, temperature, maxTokens }),
  });
}

export async function aiRAGSearch(query: string, maxResults?: number) {
  return request('/ai/rag', {
    method: 'POST',
    body: JSON.stringify({ query, maxResults }),
  });
}

// ==================== 训练阶段计划 ====================

export async function getTrainingPlans() {
  return request('/training-plans');
}

export async function getTrainingPlan(id: string) {
  return request(`/training-plans/${id}`);
}

export async function saveTrainingPlan(data: any) {
  if (data._id || data.id) {
    return request(`/training-plans/${data._id || data.id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  return request('/training-plans', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTrainingPlan(id: string) {
  return request(`/training-plans/${id}`, { method: 'DELETE' });
}

// ==================== 认证 ====================

export async function getCurrentUser() {
  return request('/auth/me');
}

export async function login(phone: string, password: string) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone, password }),
  });
}

export async function register(data: {
  name: string;
  phone: string;
  password: string;
  confirmPassword?: string;
  role?: string;
  securityQuestion?: string;
  securityAnswer?: string;
  registerCode?: string;
}) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export async function changePassword(data: { oldPassword: string; newPassword: string; confirmPassword?: string }) {
  return request('/auth/password', { method: 'POST', body: JSON.stringify(data) });
}

export async function getForgotInfo(phone: string) {
  return request(`/auth/forgot?phone=${encodeURIComponent(phone)}`);
}

export async function resetPassword(data: {
  phone: string;
  method: 'security' | 'recovery';
  answer?: string;
  recoveryCode?: string;
  newPassword: string;
  confirmPassword?: string;
}) {
  return request('/auth/forgot', { method: 'POST', body: JSON.stringify(data) });
}

export async function setSecurityQuestion(data: { securityQuestion: string; securityAnswer: string }) {
  return request('/auth/security-question', { method: 'POST', body: JSON.stringify(data) });
}

// ==================== 管理员：用户管理 ====================

export async function getUsers(keyword = '') {
  return request(`/admin/users${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`);
}

export async function updateUser(id: string, data: { role?: string; status?: string }) {
  return request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function adminResetUserPassword(id: string) {
  return request(`/admin/users/${id}/reset-password`, { method: 'POST' });
}

export async function adminIssueRecoveryCode(id: string) {
  return request(`/admin/users/${id}/recovery-code`, { method: 'POST' });
}

// ==================== 管理员：教师账号 ====================

export async function getTeacherAccounts() {
  return request('/admin/teacher-accounts');
}

export async function teacherAccountAction(teacherId: string, action: 'create' | 'reset') {
  return request(`/admin/teachers/${teacherId}/account`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });
}

