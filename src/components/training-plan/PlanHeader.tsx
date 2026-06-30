'use client';

interface PlanHeaderProps {
  organization: string;
  planTitle: string;
  onOrganizationChange: (val: string) => void;
  onPlanTitleChange: (val: string) => void;
}

export default function PlanHeader({ organization, planTitle, onOrganizationChange, onPlanTitleChange }: PlanHeaderProps) {
  return (
    <div className="print-area text-center mb-8">
      <input
        type="text"
        value={organization}
        onChange={e => onOrganizationChange(e.target.value)}
        className="w-full text-center text-xl font-bold text-gray-800 border-0 border-b border-dashed border-gray-300 focus:border-primary-500 focus:ring-0 outline-none bg-transparent mb-2"
        placeholder="机构名称"
      />
      <input
        type="text"
        value={planTitle}
        onChange={e => onPlanTitleChange(e.target.value)}
        className="w-full text-center text-lg font-semibold text-gray-700 border-0 border-b border-dashed border-gray-300 focus:border-primary-500 focus:ring-0 outline-none bg-transparent"
        placeholder="计划标题"
      />
    </div>
  );
}
