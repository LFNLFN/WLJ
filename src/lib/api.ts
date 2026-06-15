// API 基础地址
// 优先使用环境变量（Vercel 上设置）
// 开发环境默认 localhost:3001
const API_BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) 
  || (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:3001/api' 
    : 'https://wlj-production.up.railway.app/api');

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
