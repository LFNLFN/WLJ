'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudentScaleRecord, saveStudentScaleRecord, getStudents, getScaleTemplates } from '@/lib/api';

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

function EditForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<ScaleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ScaleTemplate | null>(null);

  const [form, setForm] = useState({
    studentId: '',
    studentName: '',
    scaleTemplateId: '',
    scaleName: '',
    category: '',
    evaluator: '',
    evaluationDate: '',
    summary: '',
    recommendations: '',
    status: 'completed' as 'draft' | 'completed',
  });

  const [scores, setScores] = useState<ScoreValue[]>([]);

  useEffect(() => {
    const loadData = async () => {
      if (!id) { setLoading(false); return; }

      try {
        const record = await getStudentScaleRecord(id);
        if (record) {
          setForm({
            studentId: record.studentId,
            studentName: record.studentName,
            scaleTemplateId: record.scaleTemplateId,
            scaleName: record.scaleName,
            category: record.category,
            evaluator: record.evaluator,
            evaluationDate: record.evaluationDate,
            summary: record.summary,
            recommendations: record.recommendations,
            status: record.status,
          });
          setScores(record.scores || []);
        }

        const tmpls = await getScaleTemplates();
        setTemplates(tmpls);
        if (record?.scaleTemplateId) {
          const tmpl = tmpls.find((t: any) => (t._id || t.id) === record.scaleTemplateId);
          if (tmpl) setSelectedTemplate(tmpl);
        }
      } catch (err) {
        console.error('加载失败:', err);
      }
      setLoading(false);
    };

    loadData();
  }, [id]);

  const updateScore = (fieldId: string, value: string | number) => {
    setScores(prev => prev.map(s => (s.fieldId === fieldId ? { ...s, value } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    try {
      await saveStudentScaleRecord({
        id,
        ...form,
        scores,
      });
      router.push('/scales/records');
    } catch (err) {
      alert('保存失败');
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 基本信息 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">评估信息</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">学生</label>
            <input type="text" value={form.studentName} readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">量表</label>
            <input type="text" value={form.scaleName} readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">类别</label>
            <input type="text" value={form.category} readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">评估人</label>
            <input type="text" value={form.evaluator}
              onChange={e => setForm(prev => ({ ...prev, evaluator: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">评估日期</label>
            <input type="date" value={form.evaluationDate}
              onChange={e => setForm(prev => ({ ...prev, evaluationDate: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">状态</label>
            <select value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent">
              <option value="draft">草稿</option>
              <option value="completed">已完成</option>
            </select>
          </div>
        </div>
      </div>

      {/* 评估分数 */}
      {selectedTemplate && scores.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">评估维度</h3>
          <div className="space-y-4">
            {scores.map((score, idx) => {
              const field = selectedTemplate.fields?.find(f => f.id === score.fieldId);
              return (
                <div key={score.fieldId} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-400 w-6">{idx + 1}.</span>
                  <span className="text-sm font-medium text-gray-700 w-36">{score.fieldLabel}</span>
                  <div className="flex-1">
                    {field?.type === 'select' && field.options ? (
                      <select value={score.value as string}
                        onChange={e => updateScore(score.fieldId, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm">
                        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : field?.type === 'score' ? (
                      <div className="flex items-center gap-2">
                        <input type="number" value={score.value as number}
                          onChange={e => updateScore(score.fieldId, Number(e.target.value))}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm" />
                        {field.unit && <span className="text-sm text-gray-500">{field.unit}</span>}
                      </div>
                    ) : (
                      <input type="text" value={score.value as string}
                        onChange={e => updateScore(score.fieldId, e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent text-sm" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 评估结论 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">评估结论</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">综合评估结论</label>
            <textarea value={form.summary}
              onChange={e => setForm(prev => ({ ...prev, summary: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">康复建议</label>
            <textarea value={form.recommendations}
              onChange={e => setForm(prev => ({ ...prev, recommendations: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit"
          className="px-6 py-2.5 bg-[#F08020] text-white rounded-lg hover:bg-[#D06010] transition-colors">
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

export default function EditScaleRecordPage() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">编辑评估记录</h2>
            <Suspense fallback={<div className="text-center py-8">加载中...</div>}>
              <EditForm />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
