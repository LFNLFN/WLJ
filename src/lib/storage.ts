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
