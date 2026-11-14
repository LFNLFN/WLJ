'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudentScaleRecord, saveStudentScaleRecord } from '@/lib/api';
import { buildReviewRows, formatAnswer, formatOption } from '@/lib/scale-question-bank';

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

  const [form, setForm] = useState({
    studentId: '',
    studentname: '',
    scaleTemplateId: '',
    scalename: '',
    category: '',
    evaluator: '',
    evaluationdate: '',
    summary: '',
    recommendations: '',
    status: 'completed' as 'draft' | 'completed',
  });

  const [scores, setScores] = useState<ScoreValue[]>([]);
  const [rawData, setRawData] = useState<any>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) { setLoading(false); return; }

      try {
        const record = await getStudentScaleRecord(id);
        if (record) {
          setForm({
            studentId: record.studentId,
            studentname: record.studentname,
            scaleTemplateId: record.scaleTemplateId,
            scalename: record.scalename,
            category: record.category,
            evaluator: record.evaluator,
            evaluationdate: record.evaluationdate,
            summary: record.summary,
            recommendations: record.recommendations,
            status: record.status,
          });
          setScores(record.scores || []);
          // 解析 rawData 中的题目详情
          if (record.rawdata) {
            const raw = typeof record.rawdata === 'string' ? JSON.parse(record.rawdata) : record.rawdata;
            setRawData(raw);
          }
        }
      } catch (err) {
        console.error('加载失败:', err);
      }
      setLoading(false);
    };

    loadData();
  }, [id]);

  // 渲染题目详情：题目原文 + 全部选项（标记-文字），选中项高亮
  const renderQuestions = (raw: any) => {
    const { rows, dimensionResults } = buildReviewRows(raw);

    if (rows.length === 0 && dimensionResults.length > 0) {
      return (
        <div className="space-y-4">
          {dimensionResults.map((r: any, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">{r.factorName || '维度' + (idx + 1)}</span>
                <span className="text-sm font-bold" style={{ color: (r.avgScore || 0) < 3 ? '#f56c6c' : '#67c23a' }}>
                  {r.avgScore || 0} 分
                </span>
              </div>
              {r.levelText && <p className="text-xs text-gray-500 mt-1">等级：{r.levelText}</p>}
              {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
            </div>
          ))}
        </div>
      );
    }

    if (rows.length === 0) {
      return <p className="text-sm text-gray-400">无详细答题数据</p>;
    }

    return (
      <div className="space-y-2 max-h-[32rem] overflow-y-auto">
        {rows.map((row) => {
          const valueList = Array.isArray(row.value) ? row.value.map((v: any) => String(v)) : null;
          const valueStr = valueList ? '' : String(row.value === undefined || row.value === null ? '' : row.value);
          const isSelected = (optValue: string) =>
            valueList ? valueList.indexOf(optValue) >= 0 : valueStr === optValue;

          const selectedOptions = row.options.filter((o) => isSelected(String(o.value)));
          const selectedText = selectedOptions.length > 0
            ? selectedOptions.map((o) => formatOption(o)).join('、')
            : formatAnswer(row.value, row.label);

          return (
            <div key={row.key} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
              {row.section && <p className="text-[11px] text-gray-400 mb-1">{row.section}</p>}
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 font-mono min-w-[1.5rem]">{row.no}.</span>
                <div className="flex-1 min-w-0">
                  {row.question && <p className="text-sm text-gray-700 mb-1">{row.question}</p>}

                  {row.options.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5 mb-1.5">
                      {row.options.map((opt) => {
                        const selected = isSelected(String(opt.value));
                        return (
                          <span
                            key={String(opt.value)}
                            className={
                              selected
                                ? 'text-xs px-2 py-0.5 rounded border border-[#F08020] bg-[#FFF0E0] text-[#C05010] font-medium'
                                : 'text-xs px-2 py-0.5 rounded border border-gray-200 bg-white text-gray-400'
                            }
                          >
                            {formatOption(opt)}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedText && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                        回答：{selectedText}
                      </span>
                    )}
                    {row.score !== null && row.score !== undefined && (
                      <span
                        className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: Number(row.score) >= 3 ? '#fef0f0' : '#f0f9eb',
                          color: Number(row.score) >= 3 ? '#f56c6c' : '#67c23a',
                        }}
                      >
                        得分：{row.score}
                      </span>
                    )}
                  </div>

                  {row.note && <p className="text-xs text-gray-500 mt-1">备注：{row.note}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
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
            <input type="text" value={form.studentname} readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">量表</label>
            <input type="text" value={form.scalename} readOnly
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
            <input type="date" value={form.evaluationdate}
              onChange={e => setForm(prev => ({ ...prev, evaluationdate: e.target.value }))}
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

      {/* 答题详情（来自小程序 rawData） */}
      {rawData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-700 mb-4">📝 答题详情</h3>
          <div className="space-y-3">
            {/* 总览信息 */}
            <div className="flex flex-wrap gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
              {rawData.totalScore !== undefined && (
                <span className="text-sm">总分：<strong>{rawData.totalScore}</strong> / {rawData.maxScore || '-'}</span>
              )}
              {rawData.percentage !== undefined && (
                <span className="text-sm">得分率：<strong>{rawData.percentage}%</strong></span>
              )}
              {rawData.scoreDesc && (
                <span className="text-sm">结论：<strong>{rawData.scoreDesc}</strong></span>
              )}
              {rawData.severity && (
                <span className="text-sm">等级：<strong>{rawData.severity}</strong></span>
              )}
              {rawData.overallLevel && (
                <span className="text-sm">等级：<strong>{rawData.overallLevel}</strong></span>
              )}
            </div>
            {/* 逐题展示 */}
            {renderQuestions(rawData)}
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
