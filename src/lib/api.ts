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

// ==================== AI 智能助理（火山方舟） ====================

/** 与智能助理对话（服务端自动完成工具调用循环） */
/** 提问时附带的图片 / 文件（dataUrl 由前端 FileReader 生成；text 为已抽好的文本） */
export interface ChatAttachmentPayload {
  name: string;
  mimeType?: string;
  dataUrl?: string;
  text?: string;
}

export async function agentChat(
  messages: { role: string; content: string }[],
  attachments?: ChatAttachmentPayload[]
) {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ messages, ...(attachments?.length ? { attachments } : {}) }),
  });
}

/** 工具列表 + 接入状态（不含密钥），用于页面的就绪检查与配置面板 */
export async function getAgentTools() {
  return request('/ai/tools');
}

// ==================== 知识库（📚 上传的资料） ====================

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  category: string;
  content: string;
  contentLength?: number;
  filename?: string | null;
  mimetype?: string | null;
  size?: number;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KnowledgeListResult {
  total: number;
  limit: number;
  offset: number;
  items: KnowledgeDocumentSummary[];
  categories?: string[];
}

export async function listKnowledgeDocuments(
  params: { q?: string; category?: string; limit?: number; offset?: number } = {}
): Promise<KnowledgeListResult> {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  const qs = search.toString();
  return request(`/knowledge${qs ? `?${qs}` : ''}`);
}

export async function getKnowledgeDocument(id: string): Promise<KnowledgeDocumentSummary> {
  return request(`/knowledge/${encodeURIComponent(id)}`);
}

export async function deleteKnowledgeDocument(id: string) {
  return request(`/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** 粘贴文本入库 */
export async function createKnowledgeText(data: { title: string; category?: string; content: string }) {
  return request('/knowledge', { method: 'POST', body: JSON.stringify(data) });
}

/** 上传文件入库（multipart，不能复用 request()——它会强塞 JSON 头） */
export async function uploadKnowledgeFile(file: File, meta: { title?: string; category?: string } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (meta.title) form.append('title', meta.title);
  if (meta.category) form.append('category', meta.category);

  const res = await fetch('/api/knowledge', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '上传失败' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
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

