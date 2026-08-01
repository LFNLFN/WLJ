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

  // 渲染题目详情（支持 allResults / results / itemScores 等多种格式）
  const renderQuestions = (raw: any) => {
    // 收集所有题目数据
    let items: any[] = [];

    if (raw.allResults && Array.isArray(raw.allResults)) {
      // 注意力等量表的逐题结果
      items = raw.allResults.map((r: any, idx: number) => ({
        index: idx + 1,
        question: r.text || r.shortText || '',
        answer: r.answer || '',
        label: r.label || '',
        score: r.score,
      }));
    } else if (raw.results && Array.isArray(raw.results)) {
      // 感统评估的结果（按维度分组）
      if (raw.results.length > 0 && raw.results[0].factorName) {
        // 新版8维度格式
        return (
          <div className="space-y-4">
            {raw.results.map((r: any, idx: number) => (
              <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{r.factorName || '维度' + (idx + 1)}</span>
                  <span className="text-sm font-bold" style={{ color: (r.avgScore || 0) < 3 ? '#f56c6c' : '#67c23a' }}>
                    {r.avgScore || 0} 分
                  </span>
                </div>
                {r.level && <p className="text-xs text-gray-500 mt-1">{r.level}</p>}
                {r.description && <p className="text-xs text-gray-500 mt-1">{r.description}</p>}
              </div>
            ))}
          </div>
        );
      } else {
        items = raw.results.map((r: any, idx: number) => ({
          index: idx + 1,
          question: r.text || r.shortText || r.factorName || '',
          answer: r.answer || '',
          label: r.label || r.description || '',
          score: r.score ?? r.avgScore,
        }));
      }
    } else if (raw.itemScores && Array.isArray(raw.itemScores)) {
      // TML量表的逐题得分
      items = raw.itemScores.map((r: any, idx: number) => ({
        index: r.number || (idx + 1),
        question: r.text || '',
        answer: r.score !== null && r.score !== undefined ? String(r.score) : '未答',
        label: '',
        score: r.score,
      }));
    } else if (raw.part2Answers && typeof raw.part2Answers === 'object') {
      // MCH-FS 喂养困难问卷
      const qTexts = [
        '你觉得你在喂养孩子过程中有困难吗？',
        '你对孩子的喂养及进食感到担心吗？',
        '你孩子的食欲如何？',
        '你孩子每餐从什么时候开始拒绝进食？',
        '你孩子每餐进食需要多少分钟？',
        '你孩子进餐时表现如何（哭闹、玩玩具、看电视等）？',
        '你孩子是否对进食某类食物有恶心、呕吐的现象？',
        '你孩子是否有嘴中含着食物但不吞咽的现象？',
        '你孩子在进食时是否需要逗引或追着喂？',
        '你强迫孩子进食吗？',
        '你孩子的咀嚼（或吮吸）能力如何？',
        '你孩子的生长状况如何？',
        '孩子的进食情况对你和孩子之间关系的影响如何？',
        '孩子的进食情况对家庭成员之间关系的影响如何？'
      ];
      items = Object.entries(raw.part2Answers).map(([key, val]) => {
        const idx = parseInt(key, 10) - 1;
        return {
          index: key,
          question: qTexts[idx] || '题目' + key,
          answer: val + '分',
          label: '',
          score: parseInt(String(val), 10),
        };
      });
    } else if (raw.answers && typeof raw.answers === 'object') {
      // 最简格式：只有 answers 对象
      items = Object.entries(raw.answers).map(([key, val], idx) => ({
        index: idx + 1,
        question: '',
        answer: String(val),
        label: '',
        score: null,
      }));
    }

    if (items.length === 0) {
      return <p className="text-sm text-gray-400">无详细答题数据</p>;
    }

    return (
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {items.map((item, idx) => (
          <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-400 font-mono min-w-[1.5rem]">{item.index}.</span>
              <div className="flex-1 min-w-0">
                {item.question && (
                  <p className="text-sm text-gray-700 mb-1">{item.question}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {item.answer && (
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      回答：{item.answer}
                    </span>
                  )}
                  {item.label && (
                    <span className="text-xs text-gray-500">{item.label}</span>
                  )}
                  {item.score !== null && item.score !== undefined && (
                    <span className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: (item.score as number) >= 3 ? '#fef0f0' : '#f0f9eb',
                        color: (item.score as number) >= 3 ? '#f56c6c' : '#67c23a'
                      }}
                    >
                      得分：{item.score}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
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
