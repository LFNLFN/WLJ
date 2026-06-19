'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { saveStudent } from '@/lib/api';

export default function NewStudentPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    parentName: '',
    parentPhone: '',
    birthDate: '',
    age: 0,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('请输入学生姓名');
      return;
    }
    saveStudent({
      name: form.name.trim(),
      parentName: form.parentName.trim(),
      parentPhone: form.parentPhone.trim(),
      birthDate: form.birthDate,
      age: form.age,
    });
    router.push('/students');
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="grid grid-cols-2 gap-6">
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">学生姓名 *</label>
                  <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="请输入姓名" />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">出生日期 *</label>
                  <input type="date" value={form.birthDate} onChange={e => {
                    const birthDate = e.target.value;
                    const age = birthDate ? Math.floor((new Date().getTime() - new Date(birthDate).getTime()) / 31557600000) : 0;
                    setForm(prev => ({ ...prev, birthDate, age }));
                  }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none" />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                  <input type="text" value={form.age ? `${form.age} 岁` : ''} readOnly
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 outline-none"
                    placeholder="选择出生日期后自动计算" />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">家长姓名</label>
                  <input type="text" value={form.parentName} onChange={e => setForm(prev => ({ ...prev, parentName: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="请输入家长姓名" />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">家长电话</label>
                  <input type="tel" value={form.parentPhone} onChange={e => setForm(prev => ({ ...prev, parentPhone: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    placeholder="请输入家长电话" />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
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
