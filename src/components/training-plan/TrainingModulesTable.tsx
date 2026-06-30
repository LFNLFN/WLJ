'use client';

import type { TrainingModule, TrainingStage } from '@/lib/types';
import EditableNumberedList from './EditableNumberedList';

interface TrainingModulesTableProps {
  modules: TrainingModule[];
  onChange: (modules: TrainingModule[]) => void;
}

/** 生成单个默认阶段（基于序号） */
function createDefaultStage(index: number): TrainingStage {
  const labels = [
    '第一阶段（初、中阶）计划',
    '第二阶段（高阶）计划',
    '第三阶段计划',
    '第四阶段计划',
    '第五阶段计划',
    '第六阶段计划',
  ];
  const periods = [
    '1-3个月',
    '3-6个月',
    '6-9个月',
    '9-12个月',
    '12-15个月',
    '15-18个月',
  ];
  return {
    title: labels[index] || `第${index + 1}阶段计划`,
    period: periods[index] || `${index * 3 + 1}-${(index + 1) * 3}个月`,
    items: [''],
  };
}

/** 确保数组中的每个元素都是字符串 */
function toStringArray(arr: any[]): string[] {
  if (!Array.isArray(arr)) return [''];
  return arr.map(item => {
    if (typeof item === 'string') return item;
    if (item === null || item === undefined) return '';
    if (typeof item === 'object' && item.content && typeof item.content === 'string') return item.content;
    return String(item);
  });
}

/** 阶段颜色 */
const stageColors = [
  { border: 'border-blue-100', bg: 'bg-blue-50/30', title: 'text-blue-800', period: 'text-blue-600', periodBorder: 'border-blue-200' },
  { border: 'border-green-100', bg: 'bg-green-50/30', title: 'text-green-800', period: 'text-green-600', periodBorder: 'border-green-200' },
  { border: 'border-purple-100', bg: 'bg-purple-50/30', title: 'text-purple-800', period: 'text-purple-600', periodBorder: 'border-purple-200' },
  { border: 'border-orange-100', bg: 'bg-orange-50/30', title: 'text-orange-800', period: 'text-orange-600', periodBorder: 'border-orange-200' },
  { border: 'border-pink-100', bg: 'bg-pink-50/30', title: 'text-pink-800', period: 'text-pink-600', periodBorder: 'border-pink-200' },
  { border: 'border-teal-100', bg: 'bg-teal-50/30', title: 'text-teal-800', period: 'text-teal-600', periodBorder: 'border-teal-200' },
];

export default function TrainingModulesTable({ modules, onChange }: TrainingModulesTableProps) {
  const updateModule = (index: number, updated: TrainingModule) => {
    const newModules = [...modules];
    newModules[index] = updated;
    onChange(newModules);
  };

  const addModule = () => {
    onChange([
      ...modules,
      {
        moduleTitle: '',
        initialAssessment: [''],
        stages: [createDefaultStage(0), createDefaultStage(1)], // 默认2个阶段
      },
    ]);
  };

  const removeModule = (index: number) => {
    onChange(modules.filter((_, i) => i !== index));
  };

  /** 为指定模块添加一个阶段（追加在末尾） */
  const addStage = (modIdx: number) => {
    const mod = modules[modIdx];
    const currentStages = [...(mod.stages || [])];
    const newStage = createDefaultStage(currentStages.length);
    currentStages.push(newStage);
    updateModule(modIdx, { ...mod, stages: currentStages });
  };

  /** 删除指定模块的某个阶段 */
  const removeStage = (modIdx: number, stageIdx: number) => {
    const mod = modules[modIdx];
    const newStages = mod.stages.filter((_, i) => i !== stageIdx);
    updateModule(modIdx, { ...mod, stages: newStages });
  };

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-gray-800 mb-3 border-l-4 border-primary-500 pl-3">
        训练模块
      </h3>

      {modules.map((mod, modIdx) => (
        <div key={modIdx} className="mb-4 border border-gray-200 rounded-lg overflow-hidden print-break-inside">
          {/* 模块标题 */}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
            <input
              type="text"
              value={mod.moduleTitle || ''}
              onChange={e => updateModule(modIdx, { ...mod, moduleTitle: e.target.value })}
              className="flex-1 bg-transparent font-medium text-gray-800 border-0 focus:outline-none"
              placeholder="训练模块名称"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => addStage(modIdx)}
                className="text-xs text-primary-600 hover:text-primary-800"
              >
                + 添加阶段
              </button>
              <button type="button" onClick={() => removeModule(modIdx)} className="text-red-400 hover:text-red-600 text-xs">
                删除模块
              </button>
            </div>
          </div>

          <div className="p-4">
            {/* 初评情况 - 占一整行 */}
            <div className="mb-4 border border-gray-100 rounded-lg p-3 bg-gray-50">
              <h4 className="text-xs font-semibold text-gray-600 mb-2">初评情况</h4>
              <EditableNumberedList
                items={toStringArray(mod.initialAssessment)}
                onChange={items => updateModule(modIdx, { ...mod, initialAssessment: items })}
              />
            </div>

            {/* 动态阶段列表 - 保持原有顺序 */}
            <div className="space-y-3">
              {(mod.stages || []).map((stage, stageIdx) => {
                const color = stageColors[stageIdx % stageColors.length];
                return (
                  <div key={stageIdx} className={`border ${color.border} rounded-lg p-3 ${color.bg}`}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex-1 flex items-center gap-2">
                        <span className={`text-xs font-bold ${color.title} min-w-[20px]`}>阶段{stageIdx + 1}</span>
                        <input
                          type="text"
                          value={stage?.title || ''}
                          onChange={e => {
                            const newStages = [...mod.stages];
                            newStages[stageIdx] = { ...newStages[stageIdx], title: e.target.value };
                            updateModule(modIdx, { ...mod, stages: newStages });
                          }}
                          className={`flex-1 text-xs font-semibold ${color.title} bg-transparent border-0 focus:outline-none`}
                          placeholder={`第${stageIdx + 1}阶段`}
                        />
                        <input
                          type="text"
                          value={stage?.period || ''}
                          onChange={e => {
                            const newStages = [...mod.stages];
                            newStages[stageIdx] = { ...newStages[stageIdx], period: e.target.value };
                            updateModule(modIdx, { ...mod, stages: newStages });
                          }}
                          className={`w-28 text-xs ${color.period} bg-white border ${color.periodBorder} rounded px-1 focus:outline-none text-center`}
                          placeholder="1-3个月"
                        />
                      </div>
                      {mod.stages.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeStage(modIdx, stageIdx)}
                          className="text-red-400 hover:text-red-600 text-xs shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <EditableNumberedList
                      items={toStringArray(stage?.items)}
                      onChange={items => {
                        const newStages = [...mod.stages];
                        newStages[stageIdx] = { ...newStages[stageIdx], items };
                        updateModule(modIdx, { ...mod, stages: newStages });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addModule}
        className="w-full px-4 py-2 border-2 border-dashed border-gray-300 text-gray-500 text-sm rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors"
      >
        + 添加训练模块
      </button>
    </div>
  );
}
