'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudents, getScaleTemplates, saveStudentScaleRecord } from '@/lib/api';
import type { Student } from '@/lib/types';

type ScaleField = {
  id: string;
  label: string;
  type: 'score' | 'select' | 'text' | 'date';
  options?: string[];
  unit?: string;
  sortOrder: number;
};

type ScaleTemplate = {
  _id: string;
  id: string;
  name: string;
  category: string;
  description: string;
  fields: ScaleField[];
};

type ScoreValue = {
  fieldId: string;
  fieldLabel: string;
  value: string | number;
  remark?: string;
};

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export default function NewScaleRecordPage() {
  const router = useRouter();
  const [searchParams] = useState(() => new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  ));

  const [students, setStudents] = useState<Student[]>([]);
  const [templates, setTemplates] = useState<ScaleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ScaleTemplate | null>(null);
  const [step, setStep] = useState<'select' | 'evaluate' | 'result'>('select');

  const [form, setForm] = useState({
    studentId: searchParams.get('studentId') || '',
    studentName: '',
    scaleTemplateId: searchParams.get('templateId') || '',
    scaleName: '',
    category: '',
    evaluator: '',
    evaluationDate: new Date().toISOString().split('T')[0],
    summary: '',
    recommendations: '',
    status: 'completed' as 'draft' | 'completed',
  });

  const [scores, setScores] = useState<ScoreValue[]>([]);

  useEffect(() => {
    getStudents().then(data => {
      setStudents(data);
      const sid = searchParams.get('studentId');
      if (sid) {
        const student = data.find((s: any) => ((s as any)._id || (s as any).id) === sid);
        if (student) setForm(prev => ({ ...prev, studentName: student.name }));
      }
    }).catch(console.error);

    getScaleTemplates().then(data => {
      setTemplates(data);
      const tid = searchParams.get('templateId');
      if (tid) {
        const template = data.find((t: any) => (t._id || t.id) === tid);
        if (template) handleSelectTemplate(template);
      }
    }).catch(console.error);
  }, []);

  const handleSelectTemplate = (template: ScaleTemplate) => {
    setSelectedTemplate(template);
    setForm(prev => ({
      ...prev,
      scaleTemplateId: template._id || template.id,
      scaleName: template.name,
      category: template.category,
    }));
    // 初始化评分表
    setScores(
      (template.fields || []).map(f => ({
        fieldId: f.id,
        fieldLabel: f.label,
        value: f.type === 'select' ? (f.options?.[0] || '') : f.type === 'score' ? 0 : '',
      }))
    );
  };

  const handleStudentChange = (studentId: string) => {
    const student = students.find((s: any) => ((s as any)._id || (s as any).id) === studentId);
    setForm(prev => ({
      ...prev,
      studentId,
      studentName: student?.name || '',
    }));
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => (t._id || t.id) === templateId);
    if (template) {
      handleSelectTemplate(template);
    } else {
      setSelectedTemplate(null);
      setScores([]);
      setForm(prev => ({ ...prev, scaleTemplateId: '', scaleName: '', category: '' }));
    }
  };

  const updateScore = (fieldId: string, value: string | number) => {
    setScores(prev => prev.map(s => (s.fieldId === fieldId ? { ...s, value } : s)));
  };


  // SRS 评分分值映射
  const srsScoreMap: Record<string, number> = {
    '没有': 1,
    '有时': 2,
    '经常': 3,
    '总是': 4,
  };

  // SRS 评估标准
  const srsCriteria = [
    { range: [0, 76], level: '正常范围', description: '社交反应正常，无明显困难', color: 'text-green-600 bg-green-50' },
    { range: [77, 89], level: '轻微异常', description: '存在轻微的社交反应异常，需要关注和指导', color: 'text-yellow-600 bg-yellow-50' },
    { range: [90, 106], level: '中等异常', description: '存在中等程度的社交反应异常，建议进行干预和支持', color: 'text-orange-600 bg-orange-50' },
    { range: [107, Infinity], level: '严重异常', description: '存在严重的社交反应异常，需要专业评估和重点干预', color: 'text-red-600 bg-red-50' },
  ];

  // 计算 SRS 总分和等级
  const calculateSrsResult = (scores: ScoreValue[]) => {
    const totalScore = scores.reduce((sum, s) => {
      return sum + (srsScoreMap[s.value as string] || 0);
    }, 0);
    const criterion = srsCriteria.find(c => totalScore >= c.range[0] && totalScore <= c.range[1]) || srsCriteria[0];
    return { totalScore, criterion };
  };

  const isSrsScale = (name: string) => name.includes('社交反应量表') || name.includes('SRS');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId) {
      alert('请选择学生');
      return;
    }
    if (!form.scaleTemplateId) {
      alert('请选择量表');
      return;
    }

    const record = {
      studentId: form.studentId,
      studentName: form.studentName,
      scaleTemplateId: form.scaleTemplateId,
      scaleName: form.scaleName,
      category: form.category,
      evaluator: form.evaluator.trim(),
      evaluationDate: form.evaluationDate,
      scores,
      summary: form.summary.trim(),
      recommendations: form.recommendations.trim(),
      status: form.status,
    };

    try {
      await saveStudentScaleRecord(record);
      router.push('/scales/records');
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
            <h2 className="text-2xl font-bold text-gray-800 mb-2">新建量表评估</h2>
            <p className="text-gray-500 mb-6">为学生选择量表并进行评估记录</p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 第一步：选择学生和量表 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">① 选择学生与量表</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">学生 *</label>
                    <select
                      value={form.studentId}
                      onChange={e => handleStudentChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                    >
                      <option value="">选择学生</option>
                      {students.map(s => (
                        <option key={(s as any)._id || (s as any).id} value={(s as any)._id || (s as any).id}>
                          {(s as any).name}{(s as any).age ? `（${(s as any).age}岁）` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">评估人</label>
                    <input
                      type="text"
                      value={form.evaluator}
                      onChange={e => setForm(prev => ({ ...prev, evaluator: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                      placeholder="评估人姓名"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">评估日期 *</label>
                    <input
                      type="date"
                      value={form.evaluationDate}
                      onChange={e => setForm(prev => ({ ...prev, evaluationDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">量表 *</label>
                    <select
                      value={form.scaleTemplateId}
                      onChange={e => handleTemplateChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                    >
                      <option value="">选择量表</option>
                      {templates.map(t => (
                        <option key={t._id || t.id} value={t._id || t.id}>
                          {t.name}（{t.category}）
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {selectedTemplate && (
                  <div className="mt-4 p-4 bg-[#FFF5F0] rounded-lg">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{selectedTemplate.name}</span>
                      <span className="text-gray-400 mx-2">|</span>
                      {selectedTemplate.description}
                      <span className="text-gray-400 mx-2">|</span>
                      <span className="text-gray-500">{selectedTemplate.fields?.length || 0} 个评估维度</span>
                    </p>
                  </div>
                )}
              </div>

              {/* 第二步：评估打分 */}
              {selectedTemplate && scores.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">② 评估打分</h3>
                  <div className="space-y-4">
                    {scores.map((score, idx) => {
                      const field = selectedTemplate.fields?.find(f => f.id === score.fieldId);
                      return (
                        <div key={score.fieldId} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                          <span className="text-sm text-gray-400 w-6">{idx + 1}.</span>
                          <span className="text-sm font-medium text-gray-700 w-36">{score.fieldLabel}</span>
                          <div className="flex-1">
                            {field?.type === 'select' && field.options ? (
                              <select
                                value={score.value as string}
                                onChange={e => updateScore(score.fieldId, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                              >
                                {field.options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : field?.type === 'score' ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={score.value as number}
                                  onChange={e => updateScore(score.fieldId, Number(e.target.value))}
                                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                                  placeholder="分值"
                                />
                                {field.unit && <span className="text-sm text-gray-500">{field.unit}</span>}
                              </div>
                            ) : field?.type === 'text' ? (
                              <input
                                type="text"
                                value={score.value as string}
                                onChange={e => updateScore(score.fieldId, e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                                placeholder="请输入"
                              />
                            ) : (
                              <input
                                type="date"
                                value={score.value as string}
                                onChange={e => updateScore(score.fieldId, e.target.value)}
                                className="w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 第三步：评估结论 */}
              {selectedTemplate && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">

              {/* SRS 总分展示 */}
              {selectedTemplate && isSrsScale(selectedTemplate.name) && scores.length > 0 && (
                <div className="mt-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200">
                  <h4 className="text-base font-semibold text-indigo-800 mb-4">📊 评估结果</h4>
                  {(() => {
                    const result = calculateSrsResult(scores);
                    const allAnswered = scores.every(s => s.value !== '' && s.value !== undefined);
                    if (!allAnswered) {
                      return (
                        <div className="text-sm text-indigo-600">
                          ⚠️ 请完成所有题目的评分后查看结果
                          <div className="mt-2 text-indigo-400">
                            已答 {scores.filter(s => s.value !== '' && s.value !== undefined).length} / {scores.length} 题
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div>
                        <div className="flex items-center gap-6 mb-4">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-indigo-700">{result.totalScore}</div>
                            <div className="text-xs text-indigo-500 mt-1">总分</div>
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg font-bold" style={{color: result.criterion.level === '正常范围' ? '#16a34a' : result.criterion.level === '轻微异常' ? '#ca8a04' : result.criterion.level === '中等异常' ? '#ea580c' : '#dc2626'}}>
                                {result.criterion.level}
                              </span>
                              <span className="text-xs text-gray-400">（{result.totalScore}分）</span>
                            </div>
                            <p className="text-sm text-gray-600">{result.criterion.description}</p>
                          </div>
                        </div>
                        {/* 评估等级进度条 */}
                        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="absolute inset-0 flex">
                            <div className="flex-1 bg-green-400 opacity-30" />
                            <div className="flex-1 bg-yellow-400 opacity-30" />
                            <div className="flex-1 bg-orange-400 opacity-30" />
                            <div className="flex-1 bg-red-400 opacity-30" />
                          </div>
                          <div className="absolute h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{width: `${Math.min((result.totalScore / 260) * 100, 100)}%`}} />
                        </div>
                        <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                          <span>65 (正常)</span>
                          <span>77 (轻微)</span>
                          <span>90 (中等)</span>
                          <span>107 (严重)</span>
                          <span>260</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">③ 评估结论</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">综合评估结论</label>
                      <textarea
                        value={form.summary}
                        onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="根据评估结果，给出综合评估结论..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">康复建议</label>
                      <textarea
                        value={form.recommendations}
                        onChange={e => setForm(prev => ({ ...prev, recommendations: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
                        placeholder="针对评估结果，给出具体的康复训练建议..."
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-6 pt-6 border-t border-gray-200">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors"
                    >
                      💾 保存评估记录
                    </button>
                    <button
                      type="button"
                      onClick={() => router.back()}
                      className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
