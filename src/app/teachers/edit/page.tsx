'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getTeacher, saveTeacher } from '@/lib/api';

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [form, setForm] = useState({ name: '', gender: '', phone: '', hireDate: '', rank: '', subjects: [] as string[] });
  const [customSubject, setCustomSubject] = useState('');

  useEffect(() => {
    if (id) {
      getTeacher(id).then(teacher => {
        if (teacher) {
          setForm({
            name: teacher.name,
            gender: teacher.gender || '',
            phone: teacher.phone || '',
            hireDate: teacher.hireDate || '',
            rank: teacher.rank || '',
            subjects: teacher.subjects || [],
          });
        }
      });
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim()) return;
    await saveTeacher({
      _id: id,
      name: form.name.trim(),
      gender: form.gender,
      phone: form.phone.trim(),
      hireDate: form.hireDate,
      rank: form.rank,
      subjects: form.subjects,
    });
    router.push('/teachers');
  };

  const addCustomSubject = () => {
    const sub = customSubject.trim();
    if (sub && !form.subjects.includes(sub)) {
      setForm(prev => ({ ...prev, subjects: [...prev.subjects, sub] }));
      setCustomSubject('');
    }
  };

  const removeSubject = (sub: string) => {
    setForm(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s !== sub)
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">姓名 *</label>
          <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">性别</label>
          <select value={form.gender} onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
            <option value="">选择性别</option>
            <option value="男">男</option>
            <option value="女">女</option>
          </select>
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
          <input type="tel" value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">入职时间</label>
          <input type="date" value={form.hireDate} onChange={e => setForm(prev => ({ ...prev, hireDate: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none" />
        </div>
        <div className="mb-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">职级</label>
          <select value={form.rank} onChange={e => setForm(prev => ({ ...prev, rank: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none bg-white">
            <option value="">选择职级</option>
            <option value="初级教师">初级教师</option>
            <option value="中级教师">中级教师</option>
            <option value="高级教师">高级教师</option>
            <option value="特级教师">特级教师</option>
            <option value="教学主管">教学主管</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>

      <div className="mb-6 mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">可教科目</label>
        {form.subjects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {form.subjects.map(sub => (
              <span key={sub} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-primary-600 text-white">
                {sub}
                <button type="button" onClick={() => removeSubject(sub)} className="ml-1 hover:text-red-200 transition-colors">×</button>
              </span>
            ))}
          </div>
        )}
        {form.subjects.length === 0 && (
          <p className="text-sm text-gray-400 mb-2">暂未添加科目，请在下方输入自定义科目</p>
        )}
        <div className="flex gap-2">
          <input type="text" value={customSubject} onChange={e => setCustomSubject(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSubject(); } }}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-colors"
            placeholder="输入自定义科目名称" />
          <button type="button" onClick={addCustomSubject}
            className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors border border-gray-300">
            + 添加
          </button>
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
