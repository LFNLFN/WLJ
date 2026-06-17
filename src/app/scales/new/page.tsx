'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { saveScaleTemplate } from '@/lib/api';

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

const PRESET_SCALES: { name: string; category: string; description: string; fields: { label: string; type: string; options?: string[]; unit?: string }[] }[] = [
  {
    name: '韦氏智力评估',
    category: '智力',
    description: '评估儿童的智力发展水平',
    fields: [
      { label: '语言理解', type: 'score', unit: '分' },
      { label: '知觉推理', type: 'score', unit: '分' },
      { label: '工作记忆', type: 'score', unit: '分' },
      { label: '加工速度', type: 'score', unit: '分' },
      { label: '总智商', type: 'score', unit: '分' },
    ],
  },
  {
    name: '感觉统合评估',
    category: '感统',
    description: '评估儿童的感觉统合能力',
    fields: [
      { label: '前庭觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '触觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '本体觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '视觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
      { label: '听觉', type: 'select', options: ['正常', '轻度失调', '中度失调', '重度失调'] },
    ],
  },
  {
    name: '语言能力评估',
    category: '语言',
    description: '评估儿童的语言理解和表达能力',
    fields: [
      { label: '语言理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '语言表达', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '语音清晰度', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '词汇量', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '社交语言', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '注意力评估',
    category: '注意力',
    description: '评估儿童的注意力水平',
    fields: [
      { label: '持续注意力', type: 'score', unit: '分' },
      { label: '选择性注意力', type: 'score', unit: '分' },
      { label: '分配性注意力', type: 'score', unit: '分' },
      { label: '冲动控制', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '社交能力评估',
    category: '社交',
    description: '评估儿童的社交互动能力',
    fields: [
      { label: '目光对视', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '社交主动性', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '合作能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '游戏互动', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
  {
    name: '儿童行为评估',
    category: '行为',
    description: '评估儿童的行为表现',
    fields: [
      { label: '多动行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '冲动行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '刻板行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '自伤行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
      { label: '攻击行为', type: 'select', options: ['无', '轻度', '中度', '重度'] },
    ],
  },
  {
    name: '情绪发展评估',
    category: '情绪',
    description: '评估儿童的情绪发展状况',
    fields: [
      { label: '情绪识别', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪表达', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪调节', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '情绪理解', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
      { label: '共情能力', type: 'select', options: ['优秀', '良好', '一般', '需要改进'] },
    ],
  },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export default function NewScalePage() {
  const router = useRouter();
  const [step, setStep] = useState<'preset' | 'custom'>('preset');
  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
  });
  const [fields, setFields] = useState<ScaleField[]>([]);

  const selectPreset = (preset: typeof PRESET_SCALES[0]) => {
    setForm({ name: preset.name, category: preset.category, description: preset.description });
    setFields(
      preset.fields.map((f, i) => ({
        id: generateId(),
        label: f.label,
        type: f.type as ScaleField['type'],
        options: f.options,
        unit: f.unit,
        sortOrder: i,
      }))
    );
    setStep('custom');
  };

  const addField = () => {
    setFields(prev => [
      ...prev,
      { id: generateId(), label: '', type: 'score', options: [], unit: '分', sortOrder: prev.length },
    ]);
  };

  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const updateField = (id: string, key: keyof ScaleField, value: any) => {
    setFields(prev => prev.map(f => (f.id === id ? { ...f, [key]: value } : f)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('请输入量表名称');
      return;
    }
    if (fields.length === 0) {
      alert('请至少添加一个评估维度');
      return;
    }
    // 检查是否有空标签的字段
    const emptyLabel = fields.some(f => !f.label.trim());
    if (emptyLabel) {
      alert('请填写所有评估维度的名称');
      return;
    }

    const template = {
      name: form.name.trim(),
      category: form.category || '其他',
      description: form.description.trim(),
      fields: fields.map((f, i) => ({ ...f, sortOrder: i })),
    };

    try {
      await saveScaleTemplate(template);
      router.push('/scales');
    } catch (err) {
      alert('保存失败');
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">新建量表</h2>
            <p className="text-gray-500 mb-6">创建评估量表模板，支持从模板快速创建或自定义</p>

            {/* 选择预设量表 */}
            {step === 'preset' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-700 mb-4">选择预设量表模板</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {PRESET_SCALES.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => selectPreset(preset)}
                      className="text-left bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-[#F08020] hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-gray-800">{preset.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          preset.category === '智力' ? 'bg-purple-100 text-purple-700' :
                          preset.category === '感统' ? 'bg-blue-100 text-blue-700' :
                          preset.category === '语言' ? 'bg-green-100 text-green-700' :
                          preset.category === '行为' ? 'bg-orange-100 text-orange-700' :
                          preset.category === '情绪' ? 'bg-pink-100 text-pink-700' :
                          preset.category === '注意力' ? 'bg-cyan-100 text-cyan-700' :
                          'bg-indigo-100 text-indigo-700'
                        }`}>{preset.category}</span>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">{preset.description}</p>
                      <p className="text-xs text-gray-400">{preset.fields.length} 个评估维度</p>
                    </button>
                  ))}
                </div>

                <div className="text-center">
                  <span className="text-gray-400 mx-4">—— 或 ——</span>
                </div>

                <div className="text-center mt-4">
                  <button
                    onClick={() => { setStep('custom'); setForm({ name: '', category: '', description: '' }); setFields([]); }}
                    className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    ✏️ 自定义创建量表
                  </button>
                </div>
              </div>
            )}

            {/* 自定义/编辑表单 */}
            {step === 'custom' && (
              <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8">
                {/* 基本信息 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">量表名称 *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      placeholder="如：韦氏智力评估"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">类别 *</label>
                    <select
                      value={form.category}
                      onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                    >
                      <option value="">选择类别</option>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">描述</label>
                    <textarea
                      value={form.description}
                      onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      placeholder="量表的简要描述和用途说明"
                    />
                  </div>
                </div>

                {/* 评估维度配置 */}
                <div className="border-t border-gray-200 pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-700">评估维度</h3>
                    <button
                      type="button"
                      onClick={addField}
                      className="px-3 py-1.5 bg-[#F08020] text-white text-sm rounded-lg hover:bg-[#D06010] transition-colors"
                    >
                      ➕ 添加维度
                    </button>
                  </div>

                  {fields.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                      <p className="text-gray-400">暂无评估维度，请点击上方按钮添加</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <div key={field.id} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
                        <span className="text-sm text-gray-400 mt-2.5 w-6">{idx + 1}.</span>
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">维度名称 *</label>
                            <input
                              type="text"
                              value={field.label}
                              onChange={e => updateField(field.id, 'label', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                              placeholder="如：语言理解"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">类型</label>
                            <select
                              value={field.type}
                              onChange={e => updateField(field.id, 'type', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                            >
                              {FIELD_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                              ))}
                            </select>
                          </div>
                          {field.type === 'select' && (
                            <div className="md:col-span-1">
                              <label className="block text-xs text-gray-500 mb-1">选项（逗号分隔）</label>
                              <input
                                type="text"
                                value={field.options?.join('，') || ''}
                                onChange={e => updateField(field.id, 'options', e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean))}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                                placeholder="优秀，良好，一般，需要改进"
                              />
                            </div>
                          )}
                          {field.type === 'score' && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">单位</label>
                              <input
                                type="text"
                                value={field.unit || ''}
                                onChange={e => updateField(field.id, 'unit', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                                placeholder="如：分"
                              />
                            </div>
                          )}
                          {(field.type === 'text' || field.type === 'date') && <div />}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeField(field.id)}
                          className="text-red-400 hover:text-red-600 mt-2.5 p-1"
                          title="删除"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-8 pt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
                  >
                    💾 保存量表
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
    </div>
  );
}
