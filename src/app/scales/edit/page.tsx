'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getScaleTemplate, saveScaleTemplate } from '@/lib/api';

type ScaleField = {
  id: string;
  label: string;
  type: 'score' | 'select' | 'text' | 'date';
  options?: string[];
  unit?: string;
  sortOrder: number;
};

const CATEGORIES = ['智力', '感统', '语言', '行为', '情绪', '注意力', '社交', '其他'];
const FIELD_TYPES = [
  { value: 'score', label: '分值评分' },
  { value: 'select', label: '选项选择' },
  { value: 'text', label: '文本描述' },
  { value: 'date', label: '日期' },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', category: '', description: '' });
  const [fields, setFields] = useState<ScaleField[]>([]);

  useEffect(() => {
    if (id) {
      getScaleTemplate(id).then(template => {
        if (template) {
          setForm({ name: template.name, category: template.category, description: template.description });
          setFields(template.fields || []);
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [id]);

  const addField = () => {
    setFields(prev => [
      ...prev,
      { id: generateId(), label: '', type: 'score', options: [], unit: '分', sortOrder: prev.length },
    ]);
  };

  const removeField = (fieldId: string) => {
    setFields(prev => prev.filter(f => f.id !== fieldId));
  };

  const updateField = (fieldId: string, key: keyof ScaleField, value: any) => {
    setFields(prev => prev.map(f => (f.id === fieldId ? { ...f, [key]: value } : f)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.name.trim()) {
      alert('请输入量表名称');
      return;
    }
    if (fields.length === 0) {
      alert('请至少添加一个评估维度');
      return;
    }
    const emptyLabel = fields.some(f => !f.label.trim());
    if (emptyLabel) {
      alert('请填写所有评估维度的名称');
      return;
    }

    try {
      await saveScaleTemplate({
        id,
        ...form,
        fields: fields.map((f, i) => ({ ...f, sortOrder: i })),
      });
      router.push('/scales');
    } catch (err) {
      alert('保存失败');
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">量表名称 *</label>
          <input type="text" value={form.name} onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">类别</label>
          <select value={form.category} onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent">
            <option value="">选择类别</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
          <textarea value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-700">评估维度</h3>
          <button type="button" onClick={addField}
            className="px-3 py-1.5 bg-[#F08020] text-white text-sm rounded-lg hover:bg-[#D06010] transition-colors">
            ➕ 添加维度
          </button>
        </div>

        {fields.length === 0 && (
          <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-400">暂无评估维度</p>
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field, idx) => (
            <div key={field.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-400 mt-2.5 w-6">{idx + 1}.</span>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">维度名称 *</label>
                  <input type="text" value={field.label}
                    onChange={e => updateField(field.id, 'label', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">类型</label>
                  <select value={field.type} onChange={e => updateField(field.id, 'type', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm">
                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {field.type === 'select' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">选项（逗号分隔）</label>
                    <input type="text" value={field.options?.join('，') || ''}
                      onChange={e => updateField(field.id, 'options', e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm" />
                  </div>
                )}
                {field.type === 'score' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">单位</label>
                    <input type="text" value={field.unit || ''}
                      onChange={e => updateField(field.id, 'unit', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm" />
                  </div>
                )}
                {(field.type === 'text' || field.type === 'date') && <div />}
              </div>
              <button type="button" onClick={() => removeField(field.id)}
                className="text-red-400 hover:text-red-600 mt-2.5 p-1" title="删除">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
        <button type="submit" className="px-6 py-2.5 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors">
          💾 保存修改
        </button>
        <button type="button" onClick={() => router.back()}
          className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
          取消
        </button>
      </div>
    </form>
  );
}

export default function EditScalePage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">编辑量表</h2>
            <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
              <EditForm />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
