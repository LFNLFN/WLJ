'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { saveLessonPlan } from '@/lib/api';

export default function NewLessonPlanPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    type: 'personal',
    content: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      alert('请输入教案标题');
      return;
    }
    if (!form.content.trim()) {
      alert('请输入教学内容');
      return;
    }
    setSaving(true);
    try {
      await saveLessonPlan({
        title: form.title.trim(),
        type: form.type,
        content: form.content.trim(),
      });
      router.push('/lesson-plans');
    } catch (err) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">标题 *</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
                    placeholder="请输入教案标题"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">类型 *</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="personal"
                        checked={form.type === 'personal'}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-4 h-4 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">个人教案</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="type"
                        value="group"
                        checked={form.type === 'group'}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-4 h-4 text-primary-600"
                      />
                      <span className="text-sm text-gray-700">集体教案</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">教学内容 *</label>
                  <textarea
                    value={form.content}
                    onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors resize-y"
                    placeholder="请输入教学内容"
                    rows={12}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mt-8">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  {saving ? '保存中...' : '💾 保存'}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
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
