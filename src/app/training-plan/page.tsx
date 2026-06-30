'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PlanHeader from '@/components/training-plan/PlanHeader';
import ChildProfileCard from '@/components/training-plan/ChildProfileCard';
import TrainingModulesTable from '@/components/training-plan/TrainingModulesTable';
import SignatureFooter from '@/components/training-plan/SignatureFooter';
import type { TrainingPlan, ExportConfig } from '@/lib/types';

// 内联默认数据，避免动态 import 的复杂性
import planData from '@/traning-plan-json/plans/huang-xingyao.training-plan.json';

export default function TrainingPlanPage() {
  const router = useRouter();
  const [plan, setPlan] = useState<TrainingPlan>(planData as unknown as TrainingPlan);

  const updatePlan = (updates: Partial<TrainingPlan>) => {
    setPlan(prev => prev ? { ...prev, ...updates } : prev);
  };

  const handleExportExcel = async () => {
    try {
      const { exportTrainingPlanToExcel } = await import('@/lib/export-training-plan');
      const config: ExportConfig = await import('@/traning-plan-json/export.config.json').then(m => m.default || m);
      exportTrainingPlanToExcel(plan, config);
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出失败，请查看控制台');
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {/* 操作栏 */}
            <div className="flex items-center justify-between mb-6 no-print">
              <div>
                <h2 className="text-xl font-bold text-gray-800">训练阶段计划</h2>
                <p className="text-sm text-gray-500 mt-1">{plan.child.name} - {plan.planTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  🖨️ 导出 PDF
                </button>
                <button
                  onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                  📥 导出 Excel
                </button>
              </div>
            </div>

            {/* 可编辑页面 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 print:shadow-none print:border-none print:p-0">
              <PlanHeader
                organization={plan.organization}
                planTitle={plan.planTitle}
                onOrganizationChange={val => updatePlan({ organization: val })}
                onPlanTitleChange={val => updatePlan({ planTitle: val })}
              />

              <ChildProfileCard
                child={plan.child}
                onChange={child => updatePlan({ child })}
              />

              <TrainingModulesTable
                modules={plan.trainingModules}
                onChange={modules => updatePlan({ trainingModules: modules })}
              />

              <SignatureFooter
                mainTeacher={plan.signatures.mainTeacher}
                reviewer={plan.signatures.reviewer}
                onMainTeacherChange={val => updatePlan({ signatures: { ...plan.signatures, mainTeacher: val } })}
                onReviewerChange={val => updatePlan({ signatures: { ...plan.signatures, reviewer: val } })}
                notes={plan.notes}
                onNotesChange={val => updatePlan({ notes: val })}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
