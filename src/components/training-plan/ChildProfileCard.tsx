'use client';

import type { TrainingPlanChild } from '@/lib/types';

interface ChildProfileCardProps {
  child: TrainingPlanChild;
  onChange: (child: TrainingPlanChild) => void;
}

const fields: { key: keyof TrainingPlanChild; label: string }[] = [
  { key: 'name', label: '姓名' },
  { key: 'birthDate', label: '出生年月' },
  { key: 'age', label: '年龄' },
  { key: 'diagnosis', label: '诊断' },
  { key: 'cooperationLevel', label: '配合程度' },
  { key: 'languageEnvironment', label: '语言环境' },
  { key: 'assessmentDate', label: '测评日期' },
];

export default function ChildProfileCard({ child, onChange }: ChildProfileCardProps) {
  const updateField = (key: keyof TrainingPlanChild, value: string) => {
    onChange({ ...child, [key]: value });
  };

  return (
    <div className="print-area mb-6">
      <h3 className="text-base font-semibold text-gray-800 mb-3 border-l-4 border-primary-500 pl-3">
        儿童基本信息
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fields.map(field => (
          <div key={field.key} className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">{field.label}</label>
            <input
              type="text"
              value={(child[field.key] as string) || ''}
              onChange={e => updateField(field.key, e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-primary-500 outline-none bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
