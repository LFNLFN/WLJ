'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getTeacher, saveTeacher } from '@/lib/api';
import type { Teacher } from '@/lib/types';

const subjectOptions = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '政治', '编程', '美术', '音乐', '舞蹈', '其他'];

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [form, setForm] = useState({ name: '', phone: '', subjects: [] as string[] });

  useEffect(() => {
    if (id) {
      getTeacher(id).then(teacher => {
        if (teacher) {
          setForm({ name: teacher.name, phone: teacher.phone, subjects: teacher.subjects });
        }
      });
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim()) return;
    const teacher = {
      _id: id, name: form.name.trim(), phone: form.phone.trim(),
      subjects: form.subjects,
    };
    saveTeacher(teacher);
    router.push('/teachers');
  };

  const toggleSubject = (sub: string) => {
    setForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(sub) ? prev.subjects.filter(s => s !== sub) : [...prev.subjects, sub]
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">姓名 *</label>
        <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
        <input type="tel" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">可教科目</label>
        <div className="flex flex-wrap gap-2">
          {subjectOptions.map(sub => (
            <button key={sub} type="button" onClick={() => toggleSubject(sub)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                form.subjects.includes(sub) ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-300'
              }`}>{sub}</button>
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

export default function EditTeacherPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
              <EditForm />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
