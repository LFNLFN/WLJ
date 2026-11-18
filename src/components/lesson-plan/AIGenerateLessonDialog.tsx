'use client';

import { useEffect, useState } from 'react';

interface AIGenerateLessonDialogProps {
  open: boolean;
  onClose: () => void;
  type: 'personal' | 'group';
  onApply: (data: { title: string; content: string; type: 'personal' | 'group' }) => void;
}

const FOCUS_OPTIONS: { id: string; label: string; template: string }[] = [
  { id: 'language', label: '语言沟通', template: '重点训练语言理解与表达：听指令、词汇、句型扩展、主动沟通与轮流对话。' },
  { id: 'social', label: '社交互动', template: '重点训练共同注意、轮流等待、情绪识别、同伴互动与合作游戏。' },
  { id: 'cognitive', label: '认知', template: '重点训练注意力、配对分类、因果关系、顺序与简单问题解决。' },
  { id: 'motor', label: '动作 / 精细', template: '重点训练大运动协调、平衡，以及抓握、手眼协调、剪刀/绘画等精细动作。' },
  { id: 'sensory', label: '感觉统合', template: '重点安排前庭、本体觉、触觉调节活动，并写明活动强度与观察指标。' },
  { id: 'attention', label: '注意力', template: '重点训练安坐、任务持续、指令执行与冲动控制，采用短时高频任务与强化。' },
  { id: 'selfcare', label: '生活自理', template: '重点训练穿衣、进食、如厕、整理等生活自理步骤与提示退隐。' },
  { id: 'emotion', label: '情绪行为', template: '重点训练情绪识别与调节、等待与转衔、替代行为与规则遵守。' },
];

export default function AIGenerateLessonDialog({
  open,
  onClose,
  type,
  onApply,
}: AIGenerateLessonDialogProps) {
  const [topic, setTopic] = useState('');
  const [planType, setPlanType] = useState<'personal' | 'group'>(type);
  const [ageGroup, setAgeGroup] = useState('');
  const [duration, setDuration] = useState('30分钟');
  const [groupSize, setGroupSize] = useState('');
  const [focus, setFocus] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setPlanType(type);
      if (type === 'group') setGroupSize('4-6人');
      if (type === 'personal') setGroupSize('1对1');
    }
  }, [open, type]);

  if (!open) return null;

  const changePlanType = (next: 'personal' | 'group') => {
    setPlanType(next);
    setGroupSize(next === 'group' ? '4-6人' : '1对1');
    setError('');
  };

  const toggleFocus = (id: string) => {
    setFocus((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setError('');
  };

  const focusPreview = FOCUS_OPTIONS
    .filter((f) => focus.includes(f.id))
    .map((f) => `【${f.label}】${f.template}`)
    .join('\n');

  const handleGenerate = async () => {
    if (generating) return;
    if (!topic.trim()) {
      setError('请先填写教案主题或训练目标');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/lesson-plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: planType,
          topic: topic.trim(),
          ageGroup: ageGroup.trim(),
          duration: duration.trim(),
          groupSize: groupSize.trim(),
          focus,
          notes: [focusPreview, notes].filter(Boolean).join('\n'),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.content) {
        throw new Error(data.error || '生成失败，请稍后重试');
      }
      onApply({ title: data.title || topic.trim(), content: data.content, type: planType });
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
            <h3 className="text-lg font-semibold text-gray-800">🤖 AI 生成教案</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              类型：{planType === 'group' ? '集体教案' : '个人教案'} · 生成后请审核修改再保存
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">教案类型 *</label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => changePlanType('personal')}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  planType === 'personal'
                    ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                个人教案（1 对 1 / 个别化）
              </button>
              <button
                type="button"
                onClick={() => changePlanType('group')}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  planType === 'group'
                    ? 'border-green-500 bg-green-50 text-green-700 font-medium'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                集体教案（小组 / 班级）
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              这里选择的类型会同步到保存后的教案类型。
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">教案主题 / 训练目标 *</label>
            <textarea
              value={topic}
              onChange={(e) => { setTopic(e.target.value); setError(''); }}
              rows={3}
              placeholder="例如：4岁儿童「颜色与形状配对」认知训练；或「集体游戏中的轮流与等待」"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">适用年龄 / 能力</label>
              <input
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                placeholder="如：3-5岁 / 语言初阶"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">时长</label>
              <input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="如：30分钟"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">人数 / 形式</label>
              <input
                value={groupSize}
                onChange={(e) => setGroupSize(e.target.value)}
                placeholder={type === 'group' ? '如：4-6人' : '如：1对1'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">训练重点（可多选，自动生成提示词）</label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleFocus(item.id)}
                  className={
                    focus.includes(item.id)
                      ? 'px-3 py-1.5 rounded-lg text-sm border border-primary-500 bg-primary-50 text-primary-700'
                      : 'px-3 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }
                >
                  {item.label}
                </button>
              ))}
            </div>
            {focusPreview && (
              <div className="mt-2 p-3 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-500 whitespace-pre-wrap max-h-32 overflow-y-auto">
                {focusPreview}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">补充说明（可选）</label>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); setError(''); }}
              rows={3}
              placeholder="可补充：学生能力水平、可用教具、场地限制、希望重点练习的环节等"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
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
