'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getCourse, getTeachers, getStudents, saveCourse } from '@/lib/api';
import type { Teacher, Student } from '@/lib/types';

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', subject: '', teacherId: '', studentIds: [] as string[], price: '', classHour: '45', totalClasses: '10' });
  const [customSubject, setCustomSubject] = useState('');

  useEffect(() => {
    getTeachers().then(data => setTeachers(data));
    getStudents().then(data => setStudents(data));
    if (id) {
      getCourse(id).then(course => {
        if (course) {
          setForm({
            name: course.name, subject: course.subject, teacherId: course.teacherId,
            studentIds: course.studentIds, price: String(course.price),
            classHour: String(course.classHour), totalClasses: String(course.totalClasses),
          });
        }
      });
    }
  }, [id]);

  // 从所有教师中收集所有科目
  const allSubjects = Array.from(
    new Set(teachers.flatMap(t => t.subjects || []))
  ).filter(Boolean) as string[];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim() || !form.teacherId) return;
    const teacher = teachers.find(t => t._id === form.teacherId)!;
    const selectedStudents = students.filter(s => form.studentIds.includes(s._id));
    saveCourse({
      id, name: form.name.trim(), subject: form.subject,
      teacherId: form.teacherId, teacherName: teacher.name,
      studentIds: form.studentIds, studentNames: selectedStudents.map(s => s.name),
      price: Number(form.price) || 0, classHour: Number(form.classHour) || 1,
      totalClasses: Number(form.totalClasses) || 10, createdAt: new Date().toISOString(),
    });
    router.push('/courses');
  };

  const toggleStudent = (sid: string) => {
    setForm(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(sid) ? prev.studentIds.filter(s => s !== sid) : [...prev.studentIds, sid]
    }));
  };

  const addCustomSubject = () => {
    const sub = customSubject.trim();
    if (sub) {
      setForm(prev => ({ ...prev, subject: sub }));
      setCustomSubject('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="grid grid-cols-2 gap-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">课程名称 *</label>
          <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">科目</label>
          <select value={form.subject} onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
            <option value="">选择科目</option>
            {allSubjects.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* 自定义科目输入 */}
          <div className="flex gap-2 mt-2">
            <input type="text" value={customSubject} onChange={e => setCustomSubject(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSubject(); } }}
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="或输入自定义科目" />
            <button type="button" onClick={addCustomSubject}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300">
              使用
            </button>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">授课教师 *</label>
          <select value={form.teacherId} onChange={e => setForm(prev => ({ ...prev, teacherId: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
            <option value="">选择教师</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">每节课费用 (元)</label>
          <input type="number" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="0" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">每节课时长 (分钟)</label>
          <input type="number" value={form.classHour} onChange={e => setForm(prev => ({ ...prev, classHour: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="1" step="1" />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">总课次</label>
          <input type="number" value={form.totalClasses} onChange={e => setForm(prev => ({ ...prev, totalClasses: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" min="1" />
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">选择学生 ({form.studentIds.length} 人)</label>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 border border-gray-200 rounded-lg">
          {students.map(s => (
            <button key={s.id} type="button" onClick={() => toggleStudent(s._id)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                form.studentIds.includes(s._id) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300'
              }`}>{s.name} ({s.grade || '未设置'})</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">💾 保存修改</button>
        <button type="button" onClick={() => router.back()} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">取消</button>
      </div>
    </form>
  );
}

export default function EditCoursePage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
              <EditForm />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
