'use client';

import { useState } from 'react';
import type { TrainingPlan } from '@/lib/types';

interface AIGenerateDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (plan: Partial<TrainingPlan>) => void;
}

export default function AIGenerateDialog({ open, onClose, onApply }: AIGenerateDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    
    setGenerating(true);
    setError('');

    try {
      // 用清晰的指令要求 AI 只输出 JSON
      const userPrompt = `${prompt}

请严格按照以下 JSON 格式输出，不要包含任何其他文字、解释或 markdown 代码块标记，只返回纯 JSON：

{
  "organization": "机构名称",
  "planTitle": "训练阶段计划",
  "child": {
    "name": "儿童姓名",
    "birthDate": "出生年月",
    "age": "年龄",
    "diagnosis": "诊断结果",
    "cooperationLevel": "配合程度",
    "languageEnvironment": "语言环境",
    "assessmentDate": "测评日期",
    "recordNumber": "编号"
  },
  "trainingModules": [
    {
      "moduleTitle": "一、训练模块名称",
      "initialAssessment": ["初评条目1", "初评条目2"],
      "stages": [
        {
          "title": "第一阶段（初、中阶）计划",
          "period": "1-3个月",
          "items": ["训练内容1", "训练内容2"]
        },
        {
          "title": "第二阶段（高阶）计划",
          "period": "3-6个月",
          "items": ["训练内容1", "训练内容2"]
        }
      ]
    }
  ],
  "notes": "备注内容",
  "signatures": {
    "mainTeacher": "",
    "reviewer": ""
  }
}

要求：
1. 训练模块至少2个，每个模块包含初评情况和至少2个阶段
2. 阶段名称和时长根据实际情况合理设定
3. 训练内容要具体、可操作
4. 只输出 JSON，不要任何其他内容`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: '你是一位专业的特殊教育训练计划制定专家。你只输出 JSON 格式数据，不包含任何其他文字。' },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.5,
          maxTokens: 4096,
        }),
      });

      const data = await res.json();
      if (!data.content) {
        throw new Error('AI 返回内容为空');
      }

      // 尝试多种方式提取 JSON
      let jsonStr = data.content.trim();
      
      // 方式1: 尝试解析整个返回内容
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && parsed.trainingModules) {
          applyPlanData(parsed);
          return;
        }
      } catch (e) {}

      // 方式2: 尝试匹配 ```json ... ``` 代码块
      const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          if (parsed && parsed.trainingModules) {
            applyPlanData(parsed);
            return;
          }
        } catch (e) {}
      }

      // 方式3: 尝试匹配 ``` ... ```（不带 json 标记）
      const codeBlockMatch = jsonStr.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        try {
          const parsed = JSON.parse(codeBlockMatch[1].trim());
          if (parsed && parsed.trainingModules) {
            applyPlanData(parsed);
            return;
          }
        } catch (e) {}
      }

      // 方式4: 尝试从文本中提取第一个 { ... } 对象
      const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          const parsed = JSON.parse(braceMatch[0]);
          if (parsed && parsed.trainingModules) {
            applyPlanData(parsed);
            return;
          }
        } catch (e) {}
      }

      throw new Error('AI 返回格式不正确，无法解析 JSON 数据。请重试。');
    } catch (err: any) {
      setError(err.message || '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const applyPlanData = (parsed: any) => {
    // 兼容处理：确保每个模块都有 stages
    if (parsed.trainingModules) {
      parsed.trainingModules = parsed.trainingModules.map((mod: any) => {
        if (mod.stages && Array.isArray(mod.stages)) {
          mod.stages = mod.stages.map((s: any) => ({
            ...s,
            items: Array.isArray(s.items) ? s.items.map((i: any) => String(i)) : [String(s.items || '')],
          }));
          return mod;
        }
        // 旧格式 stageOne/stageTwo
        if (mod.stageOne || mod.stageTwo) {
          const stages = [];
          if (mod.stageOne) {
            stages.push({
              ...mod.stageOne,
              items: Array.isArray(mod.stageOne.items) ? mod.stageOne.items.map((i: any) => String(i)) : [''],
            });
          }
          if (mod.stageTwo) {
            stages.push({
              ...mod.stageTwo,
              items: Array.isArray(mod.stageTwo.items) ? mod.stageTwo.items.map((i: any) => String(i)) : [''],
            });
          }
          const { stageOne, stageTwo, ...rest } = mod;
          return { ...rest, stages };
        }
        return { ...mod, stages: [] };
      });
    }

    onApply(parsed);
    onClose();
  };

  const quickPrompts = [
    { label: '语言训练', prompt: '请为一位4岁语言发育迟缓儿童生成训练阶段计划，含语言理解和表达训练模块' },
    { label: '感统训练', prompt: '请为一位5岁感统失调儿童生成训练阶段计划，含前庭、本体觉训练模块' },
    { label: '社交训练', prompt: '请为一位3岁自闭症儿童生成训练阶段计划，含社交互动和沟通训练模块' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">🤖 AI 生成训练计划</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">快速选择</label>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setPrompt(item.prompt);
                    setError('');
                  }}
                  className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-primary-50 hover:text-primary-600 hover:border-primary-300 border border-gray-200 transition-colors"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">描述儿童情况和训练需求</label>
            <textarea
              value={prompt}
              onChange={e => { setPrompt(e.target.value); setError(''); }}
              placeholder="例如：儿童姓名小明，男，4岁，诊断为自闭症谱系障碍，语言发育落后，配合程度一般。请生成一份包含语言训练和社交训练的训练阶段计划..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none text-sm"
              rows={5}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ❌ {error}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
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
