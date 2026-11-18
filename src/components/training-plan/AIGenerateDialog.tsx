'use client';

import { useEffect, useState } from 'react';
import type { TrainingPlan } from '@/lib/types';
import { getLessonPlans } from '@/lib/api';

interface StudentInfo {
  id?: string;
  name?: string;
  age?: string;
  gender?: string;
}

interface AIGenerateDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (plan: Partial<TrainingPlan>) => void;
  student?: StudentInfo;
}

/** 常见问题 → 提示词模板（供评估员选用，可继续编辑） */
const PROBLEM_TEMPLATES: { id: string; label: string; template: string }[] = [
  {
    id: 'language',
    label: '语言发育迟缓',
    template: '重点提升语言理解与表达：听指令、词汇量、句子长度、主动表达与沟通意图；训练内容要结合游戏与日常情境，分阶段设置可观察的目标。',
  },
  {
    id: 'social',
    label: '社交发育迟缓',
    template: '重点提升共同注意、轮流等待、情绪识别与表达、同伴互动、集体规则；训练内容要包含成人引导与同伴情境的泛化。',
  },
  {
    id: 'motor',
    label: '动作发育迟缓',
    template: '重点提升大运动（平衡、协调、力量）、精细动作（抓握、手眼协调）与动作计划能力；训练内容要具体到活动、次数/时长与辅助方式。',
  },
  {
    id: 'cognitive',
    label: '认知发育迟缓',
    template: '重点提升注意力、记忆、分类配对、因果关系与问题解决；训练内容要从具体操作过渡到简单抽象，分阶段设置目标。',
  },
  {
    id: 'attention',
    label: '注意力 / 多动',
    template: '重点提升安坐、任务持续、指令执行、冲动控制与课堂规则；训练内容要包含短时高频任务、代币/强化与家庭配合。',
  },
  {
    id: 'sensory',
    label: '感觉统合失调',
    template: '重点围绕前庭觉、本体觉、触觉调节设计活动，兼顾情绪与行为调节；训练内容要写明活动、强度与观察指标。',
  },
  {
    id: 'asd',
    label: '自闭症谱系',
    template: '重点提升社交沟通、共同注意、模仿、情绪调节与刻板行为的替代方案；避免把训练写成医学治疗，强调个别化与家庭泛化。',
  },
  {
    id: 'feeding',
    label: '喂养 / 吞咽困难',
    template: '重点围绕口腔运动、食物质地进阶、进食安全与家庭喂养策略；涉及呛咳、湿性嗓音等红旗时必须建议按机构流程进一步评估，不做诊断。',
  },
  {
    id: 'speech',
    label: '构音 / 语音障碍',
    template: '重点提升口部运动、音位习得与语音清晰度，训练内容要包含听辨、模仿、音节/词/句层级练习与家庭巩固。',
  },
  {
    id: 'unknown',
    label: '不确定 / 综合发展',
    template: '目前尚未明确学生的主要问题。请先设计以观察、建立配合与基线评估为主的第一阶段，后续阶段按综合发展方向安排（语言、社交、动作、认知、注意力），并在计划中注明“需进一步评估后调整”。不要假定诊断。',
  },
];

export default function AIGenerateDialog({ open, onClose, onApply, student }: AIGenerateDialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [lessonPlans, setLessonPlans] = useState<any[]>([]);
  const [lessonPlanIds, setLessonPlanIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    getLessonPlans()
      .then((data) => setLessonPlans(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const toggleProblem = (id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      // 选中“不确定”时清空其它项，反之亦然
      if (id === 'unknown' && next.includes('unknown')) return ['unknown'];
      if (id !== 'unknown') return next.filter((x) => x !== 'unknown');
      return next;
    });
    setError('');
  };

  const templateText = PROBLEM_TEMPLATES
    .filter((t) => selected.includes(t.id))
    .map((t) => `【${t.label}】${t.template}`)
    .join('\n');

  const toggleLesson = (id: string) => {
    setLessonPlanIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setError('');
    try {
      const problems = selected.length > 0 ? selected : ['unknown'];
      const res = await fetch('/api/training-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student?.id || '',
          studentName: student?.name || '',
          studentAge: student?.age || '',
          studentGender: student?.gender || '',
          problems,
          lessonPlanIds,
          notes: [templateText, notes].filter(Boolean).join('\n'),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.plan) {
        throw new Error(data.error || '生成失败，请稍后重试');
      }
      onApply(data.plan as Partial<TrainingPlan>);
      onClose();
    } catch (err: any) {
      setError(err?.message || '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">🤖 AI 生成训练计划</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {student?.name ? `学生：${student.name}` : '未关联学生'} · 生成后仍需治疗师审核修改
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              学生目前的主要问题（可多选；不确定就选「不确定 / 综合发展」）
            </label>
            <div className="flex flex-wrap gap-2">
              {PROBLEM_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleProblem(item.id)}
                  className={
                    selected.includes(item.id)
                      ? 'px-3 py-1.5 rounded-lg text-sm border border-primary-500 bg-primary-50 text-primary-700'
                      : 'px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              如果录入学生时还不清楚问题，选「不确定 / 综合发展」：AI 会先设计观察与基线评估阶段，并注明需后续调整。
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              参考教案（可选，最多 5 份）
            </label>
            {lessonPlans.length === 0 ? (
              <p className="text-xs text-gray-400">教案中心还没有教案；可先在「教案中心」用 AI 生成并保存。</p>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-50">
                {lessonPlans.map((plan: any) => {
                  const checked = lessonPlanIds.includes(plan._id);
                  return (
                    <button
                      key={plan._id}
                      type="button"
                      onClick={() => toggleLesson(plan._id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        checked ? 'bg-purple-50 text-purple-800' : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className={`px-1.5 py-0.5 rounded text-[11px] ${plan.type === 'group' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                        {plan.type === 'group' ? '集体' : '个人'}
                      </span>
                      <span className="flex-1 truncate">{plan.title}</span>
                      <span className="text-purple-600">{checked ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">
              选中的教案会作为训练内容与活动设计的参考，不会照搬；不选则不参考。
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">提示词模板 / 补充说明（可编辑）</label>
            <textarea
              value={templateText}
              readOnly
              rows={Math.min(8, Math.max(3, templateText.split('\n').length + 1))}
              placeholder="选择上面的问题后，这里会显示对应的提示词模板"
              className="w-full px-4 py-3 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-600 resize-none"
            />
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setError(''); }}
              rows={3}
              placeholder="可补充：学生年龄、配合程度、家长期望、每周可训练次数、现有评估结果等"
              className="w-full mt-2 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">❌ {error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-6 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? (
              <>
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                生成中...
              </>
            ) : (
              '🚀 AI 生成'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
