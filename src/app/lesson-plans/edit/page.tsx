'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getLessonPlan, saveLessonPlan } from '@/lib/api';

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [form, setForm] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      getLessonPlan(id).then(plan => {
        if (plan) {
          setForm({
            title: plan.title || '',
            content: plan.content || '',
          });
        }
      });
    }
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.title.trim()) return;
    if (!form.content.trim()) {
      alert('请输入教学内容');
      return;
    }
    setSaving(true);
    try {
      await saveLessonPlan({
        _id: id,
        title: form.title.trim(),
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
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">标题 *</label>
          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">教学内容 *</label>
          <textarea
            value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-colors resize-y"
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
          {saving ? '保存中...' : '💾 保存修改'}
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
  );
}

export default function EditLessonPlanPage() {
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
