'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import PlanHeader from '@/components/training-plan/PlanHeader';
import ChildProfileCard from '@/components/training-plan/ChildProfileCard';
import TrainingModulesTable from '@/components/training-plan/TrainingModulesTable';
import SignatureFooter from '@/components/training-plan/SignatureFooter';
import { getTrainingPlan, saveTrainingPlan } from '@/lib/api';
import type { TrainingPlan, ExportConfig } from '@/lib/types';

const emptyPlan: TrainingPlan = {
  schemaVersion: '1.0.0',
  documentType: 'children_training_stage_plan',
  sourceFile: '',
  organization: '未来家儿童能力发展中心',
  planTitle: '训练阶段计划',
  child: {
    name: '', birthDate: '', age: '', diagnosis: '',
    cooperationLevel: '', languageEnvironment: '', assessmentDate: '', recordNumber: '',
  },
  trainingModules: [],
  notes: '',
  signatures: { mainTeacher: '', reviewer: '' },
};

function TrainingPlanEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');

  const [plan, setPlan] = useState<TrainingPlan>(emptyPlan);
  const [planTitle, setPlanTitle] = useState('');
  const [childName, setChildName] = useState('');
  const [loading, setLoading] = useState(!!planId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (planId) {
      getTrainingPlan(planId).then(data => {
        if (data && data.planData) {
          setPlan(data.planData as TrainingPlan);
          setPlanTitle(data.title || '');
          setChildName(data.childName || '');
        }
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [planId]);

  // 从 localStorage 读取 AI 生成的数据
  useEffect(() => {
    const stored = localStorage.getItem('ai_training_plan_data');
    if (stored) {
      localStorage.removeItem('ai_training_plan_data');
      try {
        const data = JSON.parse(stored);
        if (data.planData && data.planData.trainingModules) {
          // 有结构化的 JSON 数据
          setPlan(prev => ({
            ...prev,
            ...data.planData,
          }));
        } else if (data.content) {
          const jsonMatch = data.content.match(/\`\`\`json\n([\s\S]*?)\n\`\`\`/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && parsed.trainingModules) {
                setPlan(prev => ({ ...prev, ...parsed }));
                return;
              }
            } catch (e) {}
          }
          const lines = data.content.split('\n').filter((l: string) => l.trim().length > 0);
          if (lines.length > 0) {
            const chunkSize = Math.max(1, Math.ceil(lines.length / 3));
            setPlan(prev => ({
              ...prev,
              trainingModules: [{
                moduleTitle: 'AI 生成训练计划',
                initialAssessment: lines.slice(0, chunkSize),
                stageOne: { title: '第一阶段计划', period: '1-3个月', items: lines.slice(chunkSize, chunkSize * 2) },
                stageTwo: { title: '第二阶段计划', period: '3-6个月', items: lines.slice(chunkSize * 2) },
              }],
            }));
          }
        }
      } catch (e) {}
    }
  }, []);


  const updatePlan = (updates: Partial<TrainingPlan>) => {
    setPlan(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        _id: planId || undefined,
        title: childName ? `${childName} - ${plan.planTitle}` : plan.planTitle,
        childName: plan.child.name || childName,
        planData: plan,
      };
      await saveTrainingPlan(payload);
      router.push('/training-plans');
    } catch (err) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      const { exportTrainingPlanToExcel } = await import('@/lib/export-training-plan');
      const config: ExportConfig = await import('@/traning-plan-json/export.config.json').then(m => m.default || m);
      exportTrainingPlanToExcel(plan, config);
    } catch (err) {
      console.error('导出失败:', err);
      alert('导出失败');
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <div className="flex-1 flex items-center justify-center"><p className="text-gray-400">加载中...</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {/* 操作栏 */}
            <div className="flex items-center justify-between mb-6 no-print">
              <div className="flex items-center gap-4">
                <button onClick={() => router.push('/training-plans')} className="text-gray-400 hover:text-gray-600">← 返回</button>
                <h2 className="text-xl font-bold text-gray-800">{planId ? '编辑' : '新建'}训练阶段计划</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
                  📥 导出 Excel
                </button>
                <button onClick={() => window.print()}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                  🖨️ 导出 PDF
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-6 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                  {saving ? '保存中...' : '💾 保存'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 print:shadow-none print:border-none print:p-0">
              <PlanHeader
                organization={plan.organization}
                planTitle={plan.planTitle}
                onOrganizationChange={val => updatePlan({ organization: val })}
                onPlanTitleChange={val => updatePlan({ planTitle: val })}
              />
              <ChildProfileCard child={plan.child} onChange={child => updatePlan({ child })} />
              <TrainingModulesTable modules={plan.trainingModules} onChange={modules => updatePlan({ trainingModules: modules })} />
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

export default function TrainingPlanEditPageWrapper() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">加载中...</div>}>
      <TrainingPlanEditPage />
    </Suspense>
  );
}
