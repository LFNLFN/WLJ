'use client';

import type { Teacher, Student, Course, ClassRecord } from './types';

// --- 教师 APIs ---
export function getTeachers(): Teacher[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('teachers');
  return data ? JSON.parse(data) : [];
}

export function getTeacher(id: string): Teacher | undefined {
  return getTeachers().find(t => t.id === id);
}

export function saveTeacher(teacher: Teacher): void {
  const teachers = getTeachers();
  const idx = teachers.findIndex(t => t.id === teacher.id);
  if (idx >= 0) {
    teachers[idx] = teacher;
  } else {
    teachers.push(teacher);
  }
  localStorage.setItem('teachers', JSON.stringify(teachers));
}

export function deleteTeacher(id: string): void {
  const teachers = getTeachers().filter(t => t.id !== id);
  localStorage.setItem('teachers', JSON.stringify(teachers));
}

// --- 学生 APIs ---
export function getStudents(): Student[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('students');
  return data ? JSON.parse(data) : [];
}

export function getStudent(id: string): Student | undefined {
  return getStudents().find(s => s.id === id);
}

export function saveStudent(student: Student): void {
  const students = getStudents();
  const idx = students.findIndex(s => s.id === student.id);
  if (idx >= 0) {
    students[idx] = student;
  } else {
    students.push(student);
  }
  localStorage.setItem('students', JSON.stringify(students));
}

export function deleteStudent(id: string): void {
  const students = getStudents().filter(s => s.id !== id);
  localStorage.setItem('students', JSON.stringify(students));
}

// --- 课程 APIs ---
export function getCourses(): Course[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('courses');
  return data ? JSON.parse(data) : [];
}

export function getCourse(id: string): Course | undefined {
  return getCourses().find(c => c.id === id);
}

export function saveCourse(course: Course): void {
  const courses = getCourses();
  const idx = courses.findIndex(c => c.id === course.id);
  if (idx >= 0) {
    courses[idx] = course;
  } else {
    courses.push(course);
  }
  localStorage.setItem('courses', JSON.stringify(courses));
}

export function deleteCourse(id: string): void {
  const courses = getCourses().filter(c => c.id !== id);
  localStorage.setItem('courses', JSON.stringify(courses));
}

// --- 上课记录 APIs ---
export function getClassRecords(): ClassRecord[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('records');
  return data ? JSON.parse(data) : [];
}

export function getClassRecord(id: string): ClassRecord | undefined {
  return getClassRecords().find(r => r.id === id);
}

export function saveClassRecord(record: ClassRecord): void {
  const records = getClassRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.push(record);
  }
  localStorage.setItem('records', JSON.stringify(records));
}

export function deleteClassRecord(id: string): void {
  const records = getClassRecords().filter(r => r.id !== id);
  localStorage.setItem('records', JSON.stringify(records));
}

// --- 量表模板 APIs ---
export function getScaleTemplates(): any[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('scaleTemplates');
  return data ? JSON.parse(data) : [];
}

export function getScaleTemplate(id: string): any | undefined {
  return getScaleTemplates().find(t => t.id === id);
}

export function saveScaleTemplate(template: any): void {
  const templates = getScaleTemplates();
  const idx = templates.findIndex(t => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    templates.push(template);
  }
  localStorage.setItem('scaleTemplates', JSON.stringify(templates));
}

export function deleteScaleTemplate(id: string): void {
  const templates = getScaleTemplates().filter(t => t.id !== id);
  localStorage.setItem('scaleTemplates', JSON.stringify(templates));
}

// --- 学生量表评估记录 APIs ---
export function getStudentScaleRecords(): any[] {
  if (typeof window === 'undefined') return [];
  const data = localStorage.getItem('studentScaleRecords');
  return data ? JSON.parse(data) : [];
}

export function getStudentScaleRecord(id: string): any | undefined {
  return getStudentScaleRecords().find(r => r.id === id);
}

export function saveStudentScaleRecord(record: any): void {
  const records = getStudentScaleRecords();
  const idx = records.findIndex(r => r.id === record.id);
  if (idx >= 0) {
    records[idx] = record;
  } else {
    records.unshift(record);
  }
  localStorage.setItem('studentScaleRecords', JSON.stringify(records));
}

export function deleteStudentScaleRecord(id: string): void {
  const records = getStudentScaleRecords().filter(r => r.id !== id);
  localStorage.setItem('studentScaleRecords', JSON.stringify(records));
}
