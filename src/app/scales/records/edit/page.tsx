'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { getStudentScaleRecord, saveStudentScaleRecord, generateAssessmentDraft } from '@/lib/api';
import { reviewStudentScaleRecord } from '@/lib/api/review-record';
import { buildReviewRows, formatAnswer, formatOption } from '@/lib/scale-question-bank';

type ScoreValue = {
  fieldId: string;
  fieldLabel: string;
  value: string | number;
  remark?: string;
};

type AiDraft = {
  summary: string;
  recommendations: string;
  detail: any;
  meta: any;
  status: string;
};

function parseJsonSafe(value: any) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [aiStatus, setAiStatus] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState('');
  const [draftApplied, setDraftApplied] = useState(false);

  // 教师批阅
  const [reviewStatus, setReviewStatus] = useState<'pending' | 'reviewed'>('pending');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewerName, setReviewerName] = useState('');
  const [reviewedAt, setReviewedAt] = useState('');
  const [markReviewed, setMarkReviewed] = useState(true);
  const [originalReviewComment, setOriginalReviewComment] = useState('');

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
          // 教师批阅状态
          const status: 'pending' | 'reviewed' =
            (record.reviewStatus || record.reviewstatus) === 'reviewed' ? 'reviewed' : 'pending';
          const comment = record.reviewComment || record.reviewcomment || '';
          setReviewStatus(status);
          setReviewComment(comment);
          setOriginalReviewComment(comment);
          setReviewerName(record.reviewerName || record.reviewername || '');
          setReviewedAt(record.reviewedAt || record.reviewedat || '');
          setMarkReviewed(true);
          // 解析 rawData 中的题目详情
          if (record.rawdata) {
            const raw = typeof record.rawdata === 'string' ? JSON.parse(record.rawdata) : record.rawdata;
            setRawData(raw);
          }
          // 已有的 AI 草稿
          if (record.aiDraftSummary) {
            setAiDraft({
              summary: record.aiDraftSummary || '',
              recommendations: record.aiDraftRecommendations || '',
              detail: parseJsonSafe(record.aiDraftDetail),
              meta: parseJsonSafe(record.aiDraftMeta),
              status: record.aiDraftStatus || '',
            });
            setAiStatus(record.aiDraftStatus || '');
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

  const handleGenerateDraft = async () => {
    if (!id || draftLoading) return;
    setDraftLoading(true);
    setDraftError('');
    try {
      const updated = await generateAssessmentDraft(id);
      setAiDraft({
        summary: updated.aiDraftSummary || '',
        recommendations: updated.aiDraftRecommendations || '',
        detail: parseJsonSafe(updated.aiDraftDetail),
        meta: parseJsonSafe(updated.aiDraftMeta),
        status: updated.aiDraftStatus || 'generated',
      });
      setAiStatus(updated.aiDraftStatus || 'generated');
      setDraftApplied(false);
    } catch (err: any) {
      setDraftError(err?.message || 'AI 草稿生成失败，请稍后重试');
    } finally {
      setDraftLoading(false);
    }
  };

  const handleApplyDraft = () => {
    if (!aiDraft) return;
    setForm(prev => ({
      ...prev,
      summary: aiDraft.summary || prev.summary,
      recommendations: aiDraft.recommendations || prev.recommendations,
    }));
    setAiStatus('accepted');
    setDraftApplied(true);
  };

  const handleIgnoreDraft = () => {
    setAiDraft(null);
    setAiStatus('discarded');
    setDraftApplied(false);
    setDraftError('');
    // 持久化“已忽略”状态，避免下次打开又出现
    if (id) {
      saveStudentScaleRecord({ id, aiDraftStatus: 'discarded' }).catch(() => {});
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    let finalAiStatus = aiStatus;
    if (draftApplied && aiDraft) {
      const unchanged =
        form.summary === aiDraft.summary && form.recommendations === aiDraft.recommendations;
      finalAiStatus = unchanged ? 'accepted' : 'edited';
    }

    try {
      await saveStudentScaleRecord({
        id,
        ...form,
        scores,
        aiDraftStatus: finalAiStatus,
      });
    } catch (err) {
      alert('保存失败');
      return;
    }

    // 批阅状态：待批阅记录勾选「保存后标记为已批阅」时写入；
    // 已批阅记录修改了批阅意见时同步更新（批阅人由服务端按当前登录账号记录）。
    const commentChanged = reviewComment.trim() !== originalReviewComment.trim();
    const reviewPayload =
      reviewStatus === 'reviewed'
        ? commentChanged
          ? { status: 'reviewed' as const, comment: reviewComment.trim() }
          : null
        : markReviewed
          ? { status: 'reviewed' as const, comment: reviewComment.trim() }
          : commentChanged
            ? { status: 'pending' as const, comment: reviewComment.trim() }
            : null;

    if (reviewPayload) {
      try {
        await reviewStudentScaleRecord(id, reviewPayload);
      } catch (err: any) {
        alert('评估内容已保存，但批阅状态更新失败：' + (err?.message || '请稍后重试'));
        return;
      }
    }

    router.push('/scales/records');
  };

  const handleRevertReview = async () => {
    if (!id) return;
    if (!confirm('撤回后该记录回到「待批阅」，批阅人信息会被清空。确定撤回吗？')) return;
    try {
      await reviewStudentScaleRecord(id, { status: 'pending', comment: reviewComment.trim() });
      setReviewStatus('pending');
      setReviewerName('');
      setReviewedAt('');
      setMarkReviewed(true);
      setOriginalReviewComment(reviewComment.trim());
      alert('已撤回批阅');
    } catch (err: any) {
      alert('撤回失败：' + (err?.message || '请稍后重试'));
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  const draftDetail = (aiDraft && aiDraft.detail) || {};
  const draftMeta = (aiDraft && aiDraft.meta) || {};
  const asList = (value: any) => (Array.isArray(value) ? value : []);

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
            <label className="block text-sm font-medium text-gray-700 mb-2">记录状态</label>
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

      {/* AI 评估结果草稿 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 border-l-4 border-l-[#F08020]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-700">
              ✨ AI 评估结果草稿
              <span className="ml-2 align-middle text-[11px] font-normal text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                需专业人员确认
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              {aiDraft
                ? `生成于 ${draftMeta.generatedAt ? new Date(draftMeta.generatedAt).toLocaleString('zh-CN') : '—'} · ${draftMeta.model || '—'}`
                : '根据本条记录的结构化答案与分数生成结论和建议草稿，不会自动写入正式结论'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={draftLoading}
              className="px-3 py-1.5 text-sm rounded-lg bg-[#FFF0E0] text-[#C05010] hover:bg-[#FFE3C8] disabled:opacity-60 transition-colors"
            >
              {draftLoading ? '生成中…' : aiDraft ? '🔄 重新生成' : '✨ 生成草稿'}
            </button>
            {aiDraft && !draftApplied && (
              <button
                type="button"
                onClick={handleApplyDraft}
                className="px-3 py-1.5 text-sm rounded-lg bg-[#F08020] text-white hover:bg-[#D06010] transition-colors"
              >
                填入下方表单
              </button>
            )}
            {aiDraft && (
              <button
                type="button"
                onClick={handleIgnoreDraft}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                忽略
              </button>
            )}
          </div>
        </div>

        {draftError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg p-3">{draftError}</p>
        )}

        {aiDraft && (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1">综合结论</p>
              <p className="text-gray-700 leading-6">{aiDraft.summary || '—'}</p>
            </div>

            {asList(draftDetail.strengths).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">主要优势</p>
                <ul className="list-disc pl-5 text-gray-700 space-y-0.5">
                  {asList(draftDetail.strengths).map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {asList(draftDetail.difficulties).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">主要困难</p>
                <ul className="list-disc pl-5 text-gray-700 space-y-0.5">
                  {asList(draftDetail.difficulties).map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {asList(draftDetail.recommendations).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">分维度建议</p>
                <div className="space-y-2">
                  {asList(draftDetail.recommendations).map((item: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 rounded-lg">
                      {item.domain && (
                        <span className="text-xs text-[#C05010] bg-[#FFF3E8] px-2 py-0.5 rounded">
                          {item.domain}
                        </span>
                      )}
                      <p className="text-gray-700 mt-1 leading-6">{item.advice}</p>
                      {asList(item.evidence).length > 0 && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          依据：{asList(item.evidence).join('、')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {asList(draftDetail.redFlags).length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-500 mb-1">需关注（记录中的红旗）</p>
                <ul className="list-disc pl-5 text-red-600 space-y-0.5">
                  {asList(draftDetail.redFlags).map((item: any, idx: number) => (
                    <li key={idx}>{item.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {asList(draftDetail.uncertainties).length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 mb-1">资料不足 / 待核对</p>
                <ul className="list-disc pl-5 text-gray-500 space-y-0.5">
                  {asList(draftDetail.uncertainties).map((item: string, idx: number) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {draftApplied && (
          <p className="mt-3 text-xs text-orange-600">
            已填入下方表单，请确认或修改后点击「保存修改」。
          </p>
        )}
      </div>

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

      {/* 教师批阅 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-lg font-semibold text-gray-700">教师批阅</h3>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              reviewStatus === 'reviewed'
                ? 'bg-green-100 text-green-700'
                : 'bg-orange-100 text-orange-700'
            }`}
          >
            {reviewStatus === 'reviewed' ? '✅ 已批阅' : '⏳ 待批阅'}
          </span>
        </div>

        {reviewStatus === 'reviewed' ? (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p className="text-xs text-gray-400">
              批阅人：{reviewerName || '—'} · {reviewedAt || '—'}
            </p>
            <button
              type="button"
              onClick={handleRevertReview}
              className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              撤回批阅
            </button>
          </div>
        ) : (
          <label className="flex items-start gap-2 text-sm text-gray-600 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={markReviewed}
              onChange={e => setMarkReviewed(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              保存后标记为已批阅
              <span className="text-gray-400">（批阅人自动记录为当前登录账号）</span>
            </span>
          </label>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-2">批阅意见</label>
        <textarea
          value={reviewComment}
          onChange={e => setReviewComment(e.target.value)}
          rows={3}
          placeholder="填写批阅意见（选填）；保存后家长可在小程序查看"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F08020] focus:border-transparent"
        />
        <p className="text-xs text-gray-400 mt-1">
          批阅意见会展示给家长端；批阅人和批阅时间由系统按当前登录账号记录。
        </p>
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
