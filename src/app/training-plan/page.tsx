'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import ChildProfileCard from '@/components/training-plan/ChildProfileCard';
import TrainingModulesTable from '@/components/training-plan/TrainingModulesTable';
import AIGenerateDialog from '@/components/training-plan/AIGenerateDialog';
import { getTrainingPlan, saveTrainingPlan } from '@/lib/api';
import type { TrainingPlan } from '@/lib/types';

const emptyPlan: TrainingPlan = {
  schemaVersion: '1.0.0',
  documentType: 'children_training_stage_plan',
  sourceFile: '',
  organization: '',
  planTitle: '',
  child: {
    name: '', birthDate: '', age: '', diagnosis: '',
    cooperationLevel: '', languageEnvironment: '', assessmentDate: '2026.06.30', recordNumber: '',
  },
  trainingModules: [],
  notes: '',
  signatures: { mainTeacher: '', reviewer: '' },
};

// 辅助函数：确保 items 是字符串数组
function normalizeItems(items: any): string[] {
  if (!items) return [''];
  if (Array.isArray(items)) {
    return items.map(item => {
      if (typeof item === 'string') return item;
      if (item === null || item === undefined) return '';
      if (typeof item === 'object' && item.content) return String(item.content);
      return String(item);
    }).filter(Boolean);
  }
  return [String(items)];
}

function TrainingPlanEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('id');

  const [plan, setPlan] = useState<TrainingPlan>(emptyPlan);
  const [planTitle, setPlanTitle] = useState('');
  const [childName, setChildName] = useState('');
  const [loading, setLoading] = useState(!!planId);
  const [saving, setSaving] = useState(false);
  const [showAIGenerate, setShowAIGenerate] = useState(false);

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
        
        // 情况1: data 本身是完整的 plan 对象（有 trainingModules）
        if (data.trainingModules) {
          // 兼容新旧格式：确保每个模块都有 stages 数组
          data.trainingModules = data.trainingModules.map((mod: any) => {
            if (mod.stages && Array.isArray(mod.stages)) {
              // 确保 stages 中的 items 是字符串数组
              mod.stages = mod.stages.map((s: any) => ({
                ...s,
                items: !s.items ? [''] : 
                  Array.isArray(s.items) ? s.items.map((item: any) => 
                    typeof item === 'string' ? item : 
                    (item?.content ? item.content : String(item))
                  ) : [String(s.items || '')],
              }));
              return mod;
            }
            // 旧格式: stageOne/stageTwo -> stages
            if (mod.stageOne || mod.stageTwo) {
              const stages = [];
              if (mod.stageOne) {
                stages.push({
                  ...mod.stageOne,
                  items: normalizeItems(mod.stageOne.items),
                });
              }
              if (mod.stageTwo) {
                stages.push({
                  ...mod.stageTwo,
                  items: normalizeItems(mod.stageTwo.items),
                });
              }
              const { stageOne, stageTwo, ...rest } = mod;
              return { ...rest, stages };
            }
            // 既没有 stages 也没有 stageOne/Two
            return { ...mod, stages: [] };
          });
          setPlan((prev: TrainingPlan) => ({ ...prev, ...data }));
          return;
        }
        
        // 情况2: data 是 { planData: ..., content: ... } 旧格式
        if (data.planData && data.planData.trainingModules) {
          const planData = { ...data.planData };
          planData.trainingModules = planData.trainingModules.map((mod: any) => {
            if (mod.stages && Array.isArray(mod.stages)) {
              mod.stages = mod.stages.map((s: any) => ({
                ...s,
                items: normalizeItems(s.items),
              }));
              return mod;
            }
            if (mod.stageOne || mod.stageTwo) {
              const stages = [];
              if (mod.stageOne) stages.push({ ...mod.stageOne, items: normalizeItems(mod.stageOne.items) });
              if (mod.stageTwo) stages.push({ ...mod.stageTwo, items: normalizeItems(mod.stageTwo.items) });
              const { stageOne, stageTwo, ...rest } = mod;
              return { ...rest, stages };
            }
            return { ...mod, stages: [] };
          });
          setPlan((prev: TrainingPlan) => ({ ...prev, ...planData }));
          return;
        }
        
        // 情况3: data 是 { content: '...' } 纯文本
        if (data.content) {
          // 尝试从文本中提取 JSON 块
          const jsonMatch = data.content.match(/\\`\\`\\`json\n([\s\S]*?)\n\\`\\`\\`/);
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]);
              if (parsed && parsed.trainingModules) {
                // 兼容转换
                if (parsed.trainingModules) {
                  parsed.trainingModules = parsed.trainingModules.map((mod: any) => {
                    if (mod.stages) return { ...mod, stages: mod.stages.map((s: any) => ({ ...s, items: normalizeItems(s.items) })) };
                    if (mod.stageOne || mod.stageTwo) {
                      const stages = [];
                      if (mod.stageOne) stages.push({ ...mod.stageOne, items: normalizeItems(mod.stageOne.items) });
                      if (mod.stageTwo) stages.push({ ...mod.stageTwo, items: normalizeItems(mod.stageTwo.items) });
                      const { stageOne, stageTwo, ...rest } = mod;
                      return { ...rest, stages };
                    }
                    return mod;
                  });
                }
                setPlan((prev: TrainingPlan) => ({ ...prev, ...parsed }));
                return;
              }
            } catch (e) {}
          }
          
          // 纯文本拆分 - 从文本中提取儿童信息，剩余内容按训练阶段拆分
          const allLines = data.content.split('\n').map((l: string) => l.trim()).filter(Boolean);
          
          // 尝试从文本中提取儿童信息
          const childInfo: Record<string, string> = {};
          const trainingLines: string[] = [];
          
          for (const line of allLines) {
            const nameMatch = line.match(/^姓名[：:]\s*(.+)/);
            const ageMatch = line.match(/^年龄[：:]\s*(.+)/);
            const diagMatch = line.match(/^诊断[：:]\s*(.+)/);
            const assessMatch = line.match(/^测评日期[：:]\s*(.+)/);
            const coopMatch = line.match(/^配合程度[：:]\s*(.+)/);
            const langMatch = line.match(/^语言环境[：:]\s*(.+)/);
            
            if (nameMatch) childInfo.name = nameMatch[1].trim();
            else if (ageMatch) childInfo.age = ageMatch[1].trim();
            else if (diagMatch) childInfo.diagnosis = diagMatch[1].trim();
            else if (assessMatch) childInfo.assessmentDate = assessMatch[1].trim();
            else if (coopMatch) childInfo.cooperationLevel = coopMatch[1].trim();
            else if (langMatch) childInfo.languageEnvironment = langMatch[1].trim();
            else if (!line.match(/^(初评情况|第一阶段|第二阶段|第三阶段|训练计划|阶段计划|以下是为|这是[为给])[：:]/) && !line.match(/训练阶段计划/)) {
              // 跳过标题行和引导句
              if (line.length > 2 && !line.match(/^[0-9.、•\s]+$/)) trainingLines.push(line);
            }
          }
          
          if (trainingLines.length > 0) {
            // 尝试识别初评/阶段一分隔
            let assessmentLines: string[] = [];
            let stageOneLines: string[] = [];
            let stageTwoLines: string[] = [];
            
            let currentSection = 'assessment';
            for (const line of trainingLines) {
              if (line.match(/^第一阶段|^阶段一|^第1阶段/)) {
                currentSection = 'stageOne';
                continue;
              }
              if (line.match(/^第二阶段|^阶段二|^第2阶段/)) {
                currentSection = 'stageTwo';
                continue;
              }
              if (line.match(/^第三阶段|^阶段三|^第3阶段/)) {
                currentSection = 'stageThree';
                continue;
              }
              if (currentSection === 'assessment') assessmentLines.push(line);
              else if (currentSection === 'stageOne') stageOneLines.push(line);
              else if (currentSection === 'stageTwo') stageTwoLines.push(line);
            }
            
            // 如果没有识别出阶段分隔，按比例拆分
            if (stageOneLines.length === 0 && stageTwoLines.length === 0) {
              const chunkSize = Math.max(1, Math.ceil(trainingLines.length / 3));
              assessmentLines = trainingLines.slice(0, chunkSize);
              stageOneLines = trainingLines.slice(chunkSize, chunkSize * 2);
              stageTwoLines = trainingLines.slice(chunkSize * 2);
            }
            
            const stages = [
              { title: '第一阶段（初、中阶）计划', period: '1-3个月', items: stageOneLines.filter(Boolean) },
              { title: '第二阶段（高阶）计划', period: '3-6个月', items: stageTwoLines.filter(Boolean) },
            ];
            
            if (stages[0].items.length === 0) stages[0].items = [''];
            if (stages[1].items.length === 0) stages[1].items = [''];
            
            setPlan((prev: TrainingPlan) => ({
              ...prev,
              ...(Object.keys(childInfo).length > 0 ? {
                child: {
                  ...prev.child,
                  ...childInfo,
                }
              } : {}),
              trainingModules: [{
                moduleTitle: 'AI 生成训练计划',
                initialAssessment: assessmentLines.filter(Boolean).length > 0 ? assessmentLines : [''],
                stages,
              }],
            }));
          }
        }
      } catch (e) {
        console.error('解析训练计划数据失败:', e);
      }
    }
  }, []);

  const handleAIApply = (data: Partial<TrainingPlan>) => {
    setPlan(prev => ({ ...prev, ...data }));
  };

  const updatePlan = (updates: Partial<TrainingPlan>) => {
    setPlan(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any = {
        _id: planId || undefined,
        title: plan.planTitle || '训练阶段计划',
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
                <button onClick={() => setShowAIGenerate(true)}
                  className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors">
                  🤖 AI 生成
                </button>
                {/* <button onClick={handleExportExcel}
                  className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors">
                  📥 导出 Excel
                </button> */}
                <button onClick={handleSave} disabled={saving}
                  className="px-6 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                  {saving ? '保存中...' : '💾 保存'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 print:shadow-none print:border-none print:p-0">
              {/* 可编辑的计划名称 */}
              <div className="mb-6">
                <input
                  type="text"
                  value={plan.planTitle || ''}
                  onChange={e => updatePlan({ planTitle: e.target.value })}
                  className="w-full text-center text-xl font-bold text-gray-800 border-0 border-b border-dashed border-gray-300 focus:border-primary-500 focus:ring-0 outline-none bg-transparent mb-2"
                  placeholder="请输入训练计划名称"
                />
              </div>
              <ChildProfileCard child={plan.child} onChange={child => updatePlan({ child })} />
              <TrainingModulesTable modules={plan.trainingModules} onChange={modules => updatePlan({ trainingModules: modules })} />
            </div>
          </div>
        </main>
      </div>
      <AIGenerateDialog
        open={showAIGenerate}
        onClose={() => setShowAIGenerate(false)}
        onApply={handleAIApply}
      />
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
