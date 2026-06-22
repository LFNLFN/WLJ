// API 基础地址
// 现在 Next.js API Routes 和前端在同一域名/端口下
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

export async function getLessonPlans(keyword?: string) {
  const params = keyword ? `?title=${encodeURIComponent(keyword)}` : '';
  return request(`/lesson-plans${params}`);
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
