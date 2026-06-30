'use client';

import type { TrainingModule } from '@/lib/types';
import EditableNumberedList from './EditableNumberedList';

interface TrainingModulesTableProps {
  modules: TrainingModule[];
  onChange: (modules: TrainingModule[]) => void;
}

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
        stageOne: { title: '第一阶段（初、中阶）计划', period: '1-3个月', items: [''] },
        stageTwo: { title: '第二阶段（高阶）计划', period: '3-6个月', items: [''] },
      },
    ]);
  };

  const removeModule = (index: number) => {
    onChange(modules.filter((_, i) => i !== index));
  };

  return (
    <div className="print-area mb-6">
      <h3 className="text-base font-semibold text-gray-800 mb-3 border-l-4 border-primary-500 pl-3">
        训练模块
      </h3>

      {modules.map((mod, modIdx) => (
        <div key={modIdx} className="mb-4 border border-gray-200 rounded-lg overflow-hidden print-break-inside">
          {/* 模块标题 */}
          <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
            <input
              type="text"
              value={mod.moduleTitle}
              onChange={e => updateModule(modIdx, { ...mod, moduleTitle: e.target.value })}
              className="flex-1 bg-transparent font-medium text-gray-800 border-0 focus:outline-none"
              placeholder="训练模块名称"
            />
            <button type="button" onClick={() => removeModule(modIdx)} className="text-red-400 hover:text-red-600 text-xs ml-2">删除</button>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 初评情况 */}
              <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                <h4 className="text-xs font-semibold text-gray-600 mb-2">初评情况</h4>
                <EditableNumberedList
                  items={mod.initialAssessment}
                  onChange={items => updateModule(modIdx, { ...mod, initialAssessment: items })}
                />
              </div>

              {/* 第一阶段 */}
              <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={mod.stageOne.title}
                    onChange={e => updateModule(modIdx, { ...mod, stageOne: { ...mod.stageOne, title: e.target.value } })}
                    className="flex-1 text-xs font-semibold text-blue-800 bg-transparent border-0 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={mod.stageOne.period}
                    onChange={e => updateModule(modIdx, { ...mod, stageOne: { ...mod.stageOne, period: e.target.value } })}
                    className="w-24 text-xs text-blue-600 bg-white border border-blue-200 rounded px-1 focus:outline-none text-center"
                  />
                </div>
                <EditableNumberedList
                  items={mod.stageOne.items}
                  onChange={items => updateModule(modIdx, { ...mod, stageOne: { ...mod.stageOne, items } })}
                />
              </div>

              {/* 第二阶段 */}
              <div className="border border-green-100 rounded-lg p-3 bg-green-50/30">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={mod.stageTwo.title}
                    onChange={e => updateModule(modIdx, { ...mod, stageTwo: { ...mod.stageTwo, title: e.target.value } })}
                    className="flex-1 text-xs font-semibold text-green-800 bg-transparent border-0 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={mod.stageTwo.period}
                    onChange={e => updateModule(modIdx, { ...mod, stageTwo: { ...mod.stageTwo, period: e.target.value } })}
                    className="w-24 text-xs text-green-600 bg-white border border-green-200 rounded px-1 focus:outline-none text-center"
                  />
                </div>
                <EditableNumberedList
                  items={mod.stageTwo.items}
                  onChange={items => updateModule(modIdx, { ...mod, stageTwo: { ...mod.stageTwo, items } })}
                />
              </div>
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
