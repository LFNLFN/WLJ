'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getTeachers, getStudents, saveCourse } from '@/lib/api';

import type { Course, Teacher, Student } from '@/lib/types';

export default function NewCoursePage() {
  const router = useRouter();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    
    teacherId: '',
    studentIds: [] as string[],
    price: '',
    classHour: '45',
    totalClasses: '10',
  });
  useEffect(() => {
    getTeachers().then(data => setTeachers(data));
    getStudents().then(data => setStudents(data));
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.teacherId || form.studentIds.length === 0) {
      alert('请填写课程名称、选择教师和学生');
      return;
    }
    const teacher = teachers.find(t => t._id === form.teacherId)!;
    const selectedStudents = students.filter(s => form.studentIds.includes(s._id));

    saveCourse({
      name: form.name.trim(),

      teacherId: form.teacherId,
      teacherName: teacher.name,
      studentIds: form.studentIds,
      studentNames: selectedStudents.map(s => s.name),
      price: Number(form.price) || 0,
      classHour: Number(form.classHour) || 1,
      totalClasses: Number(form.totalClasses) || 10,
    });
    router.push('/courses');
  };

  const toggleStudent = (id: string) => {
    setForm(prev => ({
      ...prev,
      studentIds: prev.studentIds.includes(id)
        ? prev.studentIds.filter(s => s !== id)
        : [...prev.studentIds, id]
    }));
  };
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">课程名称 *</label>
                  <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="如：初三数学冲刺班" />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">授课教师 *</label>
                  <select value={form.teacherId} onChange={e => setForm(prev => ({ ...prev, teacherId: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
                    <option value="">选择教师</option>
                    {teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                  </select>
                  {teachers.length === 0 && <p className="text-xs text-red-500 mt-1">请先在"教师管理"中添加教师</p>}
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">每节课费用 (元)</label>
                  <input type="number" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="如：200" min="0" />
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

              <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">课程总费用</span>
                  <span className="text-xl font-bold text-primary-600">
                    ¥{Number(form.price || 0) * Number(form.totalClasses || 0)}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">每节课费用 ¥{form.price || 0} × 总课次 {form.totalClasses || 0}</p>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">选择学生 * ({form.studentIds.length} 人)</label>
                {students.length === 0 ? (
                  <p className="text-gray-400 text-sm">请先在"学生管理"中添加学生</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-3 border border-gray-200 rounded-lg">
                    {students.map(s => (
                      <button key={s.id} type="button" onClick={() => toggleStudent(s._id)}
                        className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                          form.studentIds.includes(s._id)
                            ? 'bg-primary-600 text-white border-primary-600'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-primary-300'
                        }`}>
                        {s.name}{s.age ? `（${s.age}岁）` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button type="submit" className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                  💾 保存
                </button>
                <button type="button" onClick={() => router.back()} className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                  取消
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
