'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AIGenerateLessonDialog from '@/components/lesson-plan/AIGenerateLessonDialog';
import { getLessonPlan, saveLessonPlan } from '@/lib/api';

export default function LessonPlanForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || '';
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: 'personal' as 'personal' | 'group',
    content: '',
  });

  useEffect(() => {
    if (!id) return;
    getLessonPlan(id)
      .then((plan: any) => {
        if (plan) {
          setForm({
            title: plan.title || '',
            type: plan.type === 'group' ? 'group' : 'personal',
            content: plan.content || '',
          });
        }
      })
      .catch(() => alert('加载教案失败'))
      .finally(() => setLoading(false));
  }, [id]);

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
        _id: id || undefined,
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
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <button onClick={() => router.push('/lesson-plans')} className="text-gray-400 hover:text-gray-600">
                  ← 返回教案中心
                </button>
                <h2 className="text-xl font-bold text-gray-800">{id ? '编辑教案' : '新建教案'}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAI(true)}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors"
                >
                  🤖 AI 生成
                </button>
              </div>
            </div>

            {loading ? (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-400">
                加载中...
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">标题 *</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
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
                          onChange={() => setForm((prev) => ({ ...prev, type: 'personal' }))}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700">个人教案（1 对 1 / 个别化）</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="type"
                          value="group"
                          checked={form.type === 'group'}
                          onChange={() => setForm((prev) => ({ ...prev, type: 'group' }))}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700">集体教案（小组 / 班级）</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      教案不关联具体学生；个人/集体只表示教学组织形式，训练计划可引用教案作为参考。
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">教学内容 *</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y text-sm leading-6"
                      placeholder="请输入教学内容：活动目标、适用对象、时长、准备材料、活动流程、家庭延伸等"
                      rows={16}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? '保存中...' : id ? '💾 保存修改' : '💾 保存'}
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
            )}
          </div>
        </main>
      </div>

      <AIGenerateLessonDialog
        open={showAI}
        onClose={() => setShowAI(false)}
        type={form.type}
        onApply={({ title, content, type }) => {
          setForm((prev) => ({
            ...prev,
            title: title || prev.title,
            content: content || prev.content,
            type: type || prev.type,
          }));
        }}
      />
    </div>
  );
}
